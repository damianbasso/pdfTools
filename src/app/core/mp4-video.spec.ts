import { describe, expect, it } from 'vitest';
import { unescapeRbsp } from './bits';
import { readVideoGeometry } from './mp4-video';

describe('mp4 video geometry', () => {
  it('reads an H.264 crop and a 90 degree display matrix', () => {
    const file = videoFile('avc1', avcConfig(baselineSps()), 90);
    expect(readVideoGeometry(file)).toMatchObject({
      codec: 'h264',
      rotation: 90,
      codedWidth: 1920,
      codedHeight: 1088,
      croppedWidth: 1920,
      croppedHeight: 1080,
      crop: { left: 0, right: 0, top: 0, bottom: 8 },
      cropUnitX: 2,
      cropUnitY: 2,
    });
  });

  it('reads a high-profile H.264 parameter set that includes a scaling list', () => {
    const file = videoFile('avc1', avcConfig(highSps()), 0);
    expect(readVideoGeometry(file)).toMatchObject({
      codec: 'h264',
      rotation: 0,
      codedWidth: 320,
      codedHeight: 192,
      croppedWidth: 320,
      croppedHeight: 180,
      crop: { bottom: 12 },
    });
  });

  it('reads an HEVC conformance window', () => {
    const file = videoFile('hvc1', hevcConfig(hevcSps()), 180);
    expect(readVideoGeometry(file)).toMatchObject({
      codec: 'hevc',
      rotation: 180,
      codedWidth: 1920,
      codedHeight: 1088,
      croppedWidth: 1920,
      croppedHeight: 1080,
      crop: { bottom: 8 },
    });
  });

  it('skips a media-data box that sits in front of the movie', () => {
    const file = concat(
      box('mdat', new Uint8Array(32)),
      videoFile('avc1', avcConfig(baselineSps()), 0),
    );
    expect(readVideoGeometry(file).rotation).toBe(0);
  });

  it('rejects codecs that would need a new encode, and encrypted video', () => {
    expect(() => readVideoGeometry(videoFile('vp09', new Uint8Array(), 0))).toThrow(
      /not H.264 or HEVC/,
    );
    expect(() => readVideoGeometry(videoFile('encv', new Uint8Array(), 0))).toThrow(/encrypted/);
    expect(() => readVideoGeometry(new Uint8Array([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]))).toThrow(
      /not an MP4/,
    );
  });

  it('removes emulation-prevention bytes', () => {
    expect(Array.from(unescapeRbsp(new Uint8Array([0, 0, 3, 1, 0, 0, 3])))).toEqual([
      0, 0, 1, 0, 0,
    ]);
  });
});

function baselineSps(): Uint8Array {
  const bits = new BitWriter();
  bits.u(66, 8);
  bits.u(0, 8);
  bits.u(30, 8);
  bits.ue(0);
  bits.ue(0);
  bits.ue(0);
  bits.ue(0);
  bits.ue(1);
  bits.u(0, 1);
  bits.ue(1920 / 16 - 1);
  bits.ue(1088 / 16 - 1);
  bits.u(1, 1);
  bits.u(1, 1);
  bits.u(1, 1);
  bits.ue(0);
  bits.ue(0);
  bits.ue(0);
  bits.ue(4);
  return bits.finish();
}

function highSps(): Uint8Array {
  const bits = new BitWriter();
  bits.u(100, 8);
  bits.u(0, 8);
  bits.u(31, 8);
  bits.ue(0);
  bits.ue(1);
  bits.ue(0);
  bits.ue(0);
  bits.u(0, 1);
  bits.u(1, 1);
  bits.u(1, 1);
  for (let index = 0; index < 16; index++) bits.se(0);
  for (let index = 0; index < 7; index++) bits.u(0, 1);
  bits.ue(0);
  bits.ue(2);
  bits.ue(1);
  bits.u(0, 1);
  bits.ue(320 / 16 - 1);
  bits.ue(192 / 16 - 1);
  bits.u(1, 1);
  bits.u(1, 1);
  bits.u(1, 1);
  bits.ue(0);
  bits.ue(0);
  bits.ue(0);
  bits.ue(6);
  return bits.finish();
}

function hevcSps(): Uint8Array {
  const bits = new BitWriter();
  bits.u(0, 4);
  bits.u(0, 3);
  bits.u(1, 1);
  bits.u(0, 32);
  bits.u(0, 32);
  bits.u(0, 32);
  bits.ue(0);
  bits.ue(1);
  bits.ue(1920);
  bits.ue(1088);
  bits.u(1, 1);
  bits.ue(0);
  bits.ue(0);
  bits.ue(0);
  bits.ue(4);
  return bits.finish();
}

function avcConfig(sps: Uint8Array): Uint8Array {
  const nal = concat(new Uint8Array([0x67]), sps);
  const body = new Uint8Array(8 + nal.length);
  body[0] = 1;
  body[1] = sps[0] ?? 0;
  body[3] = 30;
  body[4] = 0xff;
  body[5] = 0xe1;
  body[6] = nal.length >> 8;
  body[7] = nal.length & 0xff;
  body.set(nal, 8);
  return box('avcC', body);
}

function hevcConfig(sps: Uint8Array): Uint8Array {
  const nal = concat(new Uint8Array([0x42, 0x01]), sps);
  const body = new Uint8Array(28 + nal.length);
  body[0] = 1;
  body[22] = 1;
  body[23] = 33;
  body[25] = 1;
  body[26] = nal.length >> 8;
  body[27] = nal.length & 0xff;
  body.set(nal, 28);
  return box('hvcC', body);
}

function videoFile(codec: string, config: Uint8Array, rotation: 0 | 90 | 180 | 270): Uint8Array {
  const entry = box(codec, concat(new Uint8Array(78), config));
  const stsdBody = concat(new Uint8Array(8), entry);
  new DataView(stsdBody.buffer).setUint32(4, 1);
  const mdia = box('mdia', concat(hdlr(), box('minf', box('stbl', box('stsd', stsdBody)))));
  return box('moov', box('trak', concat(tkhd(rotation), mdia)));
}

function hdlr(): Uint8Array {
  const body = new Uint8Array(25);
  body.set([0x76, 0x69, 0x64, 0x65], 8);
  return box('hdlr', body);
}

function tkhd(rotation: 0 | 90 | 180 | 270): Uint8Array {
  const body = new Uint8Array(84);
  const view = new DataView(body.buffer);
  view.setUint32(12, 1);
  const one = 0x00010000;
  const negative = -65536;
  const cells: Record<typeof rotation, [number, number, number, number]> = {
    0: [one, 0, 0, one],
    90: [0, one, negative, 0],
    180: [negative, 0, 0, negative],
    270: [0, negative, one, 0],
  };
  const [a, b, c, d] = cells[rotation];
  view.setInt32(40, a);
  view.setInt32(44, b);
  view.setInt32(52, c);
  view.setInt32(56, d);
  view.setInt32(64, rotation === 90 ? 1080 * 65536 : 0);
  view.setInt32(72, 0x40000000);
  return box('tkhd', body);
}

class BitWriter {
  private readonly bytes: number[] = [];
  private current = 0;
  private bits = 0;

  u(value: number, count: number): void {
    for (let shift = count - 1; shift >= 0; shift--) {
      this.current = (this.current << 1) | ((value >>> shift) & 1);
      this.bits += 1;
      if (this.bits === 8) {
        this.bytes.push(this.current & 0xff);
        this.current = 0;
        this.bits = 0;
      }
    }
  }

  ue(value: number): void {
    const code = value + 1;
    const width = 32 - Math.clz32(code);
    if (width > 1) this.u(0, width - 1);
    this.u(code, width);
  }

  se(value: number): void {
    this.ue(value <= 0 ? -2 * value : 2 * value - 1);
  }

  finish(): Uint8Array {
    if (this.bits) this.bytes.push((this.current << (8 - this.bits)) & 0xff);
    return Uint8Array.from(this.bytes);
  }
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
