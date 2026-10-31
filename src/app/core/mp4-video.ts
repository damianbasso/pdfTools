import { BitReader, unescapeRbsp } from './bits';
import type { Margins } from './black-bars';
import { ZERO_MARGINS } from './black-bars';
import type { QuarterTurn, VideoGeometry } from './video-crop';

interface Box {
  type: string;
  contentStart: number;
  end: number;
}

const HIGH_PROFILES = new Set([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135]);

export function readVideoGeometry(data: Uint8Array): VideoGeometry {
  const root = topBoxes(data);
  const moov = root.find((box) => box.type === 'moov');
  if (!moov) throw new Error('This file is not an MP4 or MOV video.');

  let unsupported = '';
  for (const trak of children(data, moov).filter((box) => box.type === 'trak')) {
    const handler = handlerType(data, trak);
    if (handler !== 'vide') continue;
    const entry = sampleEntry(data, trak);
    if (!entry) continue;
    if (entry.type === 'encv') {
      throw new Error('This video is encrypted, so it cannot be cropped here.');
    }
    const rotation = readRotation(data, trak);
    if (entry.type === 'avc1' || entry.type === 'avc3') {
      return { ...readAvcPicture(data, entry), rotation };
    }
    if (entry.type === 'hvc1' || entry.type === 'hev1') {
      return { ...readHevcPicture(data, entry), rotation };
    }
    unsupported = entry.type;
  }

  if (unsupported) {
    throw new Error('This video is not H.264 or HEVC, so the bars cannot be removed here.');
  }
  throw new Error('No video track was found in this file.');
}

function readAvcPicture(data: Uint8Array, entry: Box): Omit<VideoGeometry, 'rotation'> {
  const avcC = codecChild(data, entry, 'avcC');
  if (!avcC) throw new Error('Could not read the picture size in this video.');
  const record = data.subarray(avcC.contentStart, avcC.end);
  if (record.length < 8) throw new Error('Could not read the picture size in this video.');
  const sets = record[5] & 0x1f;
  if (sets < 1) throw new Error('Could not read the picture size in this video.');
  const length = (record[6] << 8) | record[7];
  const nal = record.subarray(8, 8 + length);
  if (nal.length !== length || nal.length < 2) {
    throw new Error('Could not read the picture size in this video.');
  }
  return parseAvcSps(unescapeRbsp(nal.subarray(1)));
}

export function parseAvcSps(rbsp: Uint8Array): Omit<VideoGeometry, 'rotation'> {
  const reader = new BitReader(rbsp);
  const profile = reader.readBits(8);
  reader.readBits(8);
  reader.readBits(8);
  reader.ue();
  let chroma = 1;
  let separate = false;
  if (HIGH_PROFILES.has(profile)) {
    chroma = reader.ue();
    if (chroma === 3) separate = reader.readBit() === 1;
    reader.ue();
    reader.ue();
    reader.readBit();
    if (reader.readBit() === 1) {
      const lists = chroma === 3 ? 12 : 8;
      for (let index = 0; index < lists; index++) {
        if (reader.readBit() === 1) skipScalingList(reader, index < 6 ? 16 : 64);
      }
    }
  }
  reader.ue();
  const order = reader.ue();
  if (order === 0) {
    reader.ue();
  } else if (order === 1) {
    reader.readBit();
    reader.se();
    reader.se();
    const cycle = reader.ue();
    if (cycle > 255) throw new Error('Could not read the picture size in this video.');
    for (let index = 0; index < cycle; index++) reader.se();
  } else if (order !== 2) {
    throw new Error('Could not read the picture size in this video.');
  }
  reader.ue();
  reader.readBit();
  const width = (reader.ue() + 1) * 16;
  const heightInMapUnits = reader.ue() + 1;
  const frameMbsOnly = reader.readBit() === 1;
  const height = heightInMapUnits * 16 * (frameMbsOnly ? 1 : 2);
  if (!frameMbsOnly) reader.readBit();
  reader.readBit();
  const offsets = { ...ZERO_MARGINS };
  if (reader.readBit() === 1) {
    offsets.left = reader.ue();
    offsets.right = reader.ue();
    offsets.top = reader.ue();
    offsets.bottom = reader.ue();
  }
  return picture('h264', width, height, offsets, avcCropUnits(chroma, frameMbsOnly, separate));
}

function readHevcPicture(data: Uint8Array, entry: Box): Omit<VideoGeometry, 'rotation'> {
  const hvcC = codecChild(data, entry, 'hvcC');
  if (!hvcC) throw new Error('Could not read the picture size in this video.');
  const record = data.subarray(hvcC.contentStart, hvcC.end);
  const nal = firstHevcSps(record);
  if (nal.length < 3) throw new Error('Could not read the picture size in this video.');
  return parseHevcSps(unescapeRbsp(nal.subarray(2)));
}

export function parseHevcSps(rbsp: Uint8Array): Omit<VideoGeometry, 'rotation'> {
  const reader = new BitReader(rbsp);
  reader.readBits(4);
  const maxSubLayersMinus1 = reader.readBits(3);
  reader.readBit();
  skipProfileTierLevel(reader, maxSubLayersMinus1);
  reader.ue();
  const chroma = reader.ue();
  const separate = chroma === 3 && reader.readBit() === 1;
  const width = reader.ue();
  const height = reader.ue();
  const offsets = { ...ZERO_MARGINS };
  if (reader.readBit() === 1) {
    offsets.left = reader.ue();
    offsets.right = reader.ue();
    offsets.top = reader.ue();
    offsets.bottom = reader.ue();
  }
  return picture('hevc', width, height, offsets, hevcCropUnits(chroma, separate));
}

function picture(
  codec: 'h264' | 'hevc',
  codedWidth: number,
  codedHeight: number,
  offsets: Margins,
  units: { x: number; y: number },
): Omit<VideoGeometry, 'rotation'> {
  if (codedWidth < 2 || codedHeight < 2 || codedWidth > 16384 || codedHeight > 16384) {
    throw new Error('Could not read the picture size in this video.');
  }
  const crop = {
    left: offsets.left * units.x,
    right: offsets.right * units.x,
    top: offsets.top * units.y,
    bottom: offsets.bottom * units.y,
  };
  const croppedWidth = codedWidth - crop.left - crop.right;
  const croppedHeight = codedHeight - crop.top - crop.bottom;
  if (croppedWidth < 2 || croppedHeight < 2) {
    throw new Error('Could not read the picture size in this video.');
  }
  return {
    codec,
    codedWidth,
    codedHeight,
    crop,
    croppedWidth,
    croppedHeight,
    cropUnitX: units.x,
    cropUnitY: units.y,
  };
}

function avcCropUnits(
  chroma: number,
  frameMbsOnly: boolean,
  separate: boolean,
): { x: number; y: number } {
  const vertical = frameMbsOnly ? 1 : 2;
  if (separate || chroma === 0) return { x: 1, y: vertical };
  if (chroma === 1) return { x: 2, y: 2 * vertical };
  if (chroma === 2) return { x: 2, y: vertical };
  return { x: 1, y: vertical };
}

function hevcCropUnits(chroma: number, separate: boolean): { x: number; y: number } {
  if (separate || chroma === 0 || chroma === 3) return { x: 1, y: 1 };
  if (chroma === 1) return { x: 2, y: 2 };
  if (chroma === 2) return { x: 2, y: 1 };
  return { x: 1, y: 1 };
}

function skipScalingList(reader: BitReader, size: number): void {
  let lastScale = 8;
  let nextScale = 8;
  for (let index = 0; index < size; index++) {
    if (nextScale !== 0) {
      const delta = reader.se();
      nextScale = (lastScale + delta + 256) % 256;
    }
    lastScale = nextScale === 0 ? lastScale : nextScale;
  }
}

function skipProfileTierLevel(reader: BitReader, maxSubLayersMinus1: number): void {
  reader.readBits(2 + 1 + 5 + 32 + 4 + 44 + 8);
  const profilePresent: number[] = [];
  const levelPresent: number[] = [];
  for (let index = 0; index < maxSubLayersMinus1; index++) {
    profilePresent.push(reader.readBit());
    levelPresent.push(reader.readBit());
  }
  if (maxSubLayersMinus1 > 0) {
    for (let index = maxSubLayersMinus1; index < 8; index++) reader.readBits(2);
  }
  for (let index = 0; index < maxSubLayersMinus1; index++) {
    if (profilePresent[index]) reader.readBits(2 + 1 + 5 + 32 + 4 + 44);
    if (levelPresent[index]) reader.readBits(8);
  }
}

function firstHevcSps(record: Uint8Array): Uint8Array {
  if (record.length < 23) return new Uint8Array();
  const arrays = record[22] ?? 0;
  let offset = 23;
  for (let array = 0; array < arrays; array++) {
    if (offset + 3 > record.length) return new Uint8Array();
    const nalType = record[offset] & 0x3f;
    const count = (record[offset + 1] << 8) | record[offset + 2];
    offset += 3;
    for (let nal = 0; nal < count; nal++) {
      if (offset + 2 > record.length) return new Uint8Array();
      const length = (record[offset] << 8) | record[offset + 1];
      offset += 2;
      const bytes = record.subarray(offset, offset + length);
      if (bytes.length !== length) return new Uint8Array();
      offset += length;
      if (nalType === 33) return bytes;
    }
  }
  return new Uint8Array();
}

function readRotation(data: Uint8Array, trak: Box): QuarterTurn {
  const tkhd = children(data, trak).find((box) => box.type === 'tkhd');
  if (!tkhd) throw new Error('This video uses a rotation that cannot be cropped here.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = data[tkhd.contentStart] ?? 0;
  const matrix = tkhd.contentStart + (version === 1 ? 52 : 40);
  if (matrix + 16 > tkhd.end) {
    throw new Error('This video uses a rotation that cannot be cropped here.');
  }
  const a = view.getInt32(matrix) / 65536;
  const b = view.getInt32(matrix + 4) / 65536;
  const c = view.getInt32(matrix + 12) / 65536;
  const d = view.getInt32(matrix + 16) / 65536;
  if (near(a, 1) && near(b, 0) && near(c, 0) && near(d, 1)) return 0;
  if (near(a, 0) && near(b, 1) && near(c, -1) && near(d, 0)) return 90;
  if (near(a, -1) && near(b, 0) && near(c, 0) && near(d, -1)) return 180;
  if (near(a, 0) && near(b, -1) && near(c, 1) && near(d, 0)) return 270;
  throw new Error('This video uses a rotation that cannot be cropped here.');
}

function near(value: number, target: number): boolean {
  return Math.abs(value - target) < 0.02;
}

function handlerType(data: Uint8Array, trak: Box): string {
  const hdlr = findDescendant(data, trak, 'hdlr');
  if (!hdlr || hdlr.contentStart + 12 > hdlr.end) return '';
  return fourcc(data, hdlr.contentStart + 8);
}

function codecChild(data: Uint8Array, entry: Box, type: string): Box | null {
  let offset = entry.contentStart + 78;
  while (offset + 8 <= entry.end) {
    const child = readBox(data, offset, entry.end);
    if (!child) return null;
    if (child.type === type) return child;
    offset = child.end;
  }
  return null;
}

function sampleEntry(data: Uint8Array, trak: Box): Box | null {
  const stsd = findDescendant(data, trak, 'stsd');
  if (!stsd || stsd.contentStart + 8 > stsd.end) return null;
  return readBox(data, stsd.contentStart + 8, stsd.end);
}

function topBoxes(data: Uint8Array): Box[] {
  const boxes: Box[] = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    const box = readBox(data, offset, data.length);
    if (!box) break;
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

function children(data: Uint8Array, box: Box): Box[] {
  const boxes: Box[] = [];
  let offset = box.contentStart;
  while (offset + 8 <= box.end) {
    const child = readBox(data, offset, box.end);
    if (!child) break;
    boxes.push(child);
    offset = child.end;
  }
  return boxes;
}

function findDescendant(data: Uint8Array, root: Box, type: string): Box | null {
  const pending = children(data, root);
  while (pending.length) {
    const next = pending.shift();
    if (!next) break;
    if (next.type === type) return next;
    pending.push(...children(data, next));
  }
  return null;
}

function readBox(data: Uint8Array, offset: number, limit: number): Box | null {
  if (offset + 8 > limit) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let size = view.getUint32(offset);
  const type = fourcc(data, offset + 4);
  let contentStart = offset + 8;
  if (size === 1) {
    if (offset + 16 > limit) return null;
    const high = view.getUint32(offset + 8);
    const low = view.getUint32(offset + 12);
    size = high * 2 ** 32 + low;
    contentStart = offset + 16;
  } else if (size === 0) {
    size = limit - offset;
  }
  if (!Number.isFinite(size) || size < contentStart - offset) return null;
  const end = offset + size;
  if (end > limit) return null;
  return { type, contentStart, end };
}

function fourcc(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset] ?? 0,
    data[offset + 1] ?? 0,
    data[offset + 2] ?? 0,
    data[offset + 3] ?? 0,
  );
}
