/** Reads an H.264 or HEVC bitstream. Values wider than 32 bits are only used as skips. */
export class BitReader {
  private byte = 0;
  private bit = 0;

  constructor(private readonly data: Uint8Array) {}

  readBit(): number {
    if (this.byte >= this.data.length)
      throw new Error('Could not read the picture size in this video.');
    const value = (this.data[this.byte] >> (7 - this.bit)) & 1;
    this.bit += 1;
    if (this.bit === 8) {
      this.bit = 0;
      this.byte += 1;
    }
    return value;
  }

  readBits(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index++) value = value * 2 + this.readBit();
    return value;
  }

  ue(): number {
    let zeros = 0;
    while (this.readBit() === 0) {
      zeros += 1;
      if (zeros > 31) throw new Error('Could not read the picture size in this video.');
    }
    if (zeros === 0) return 0;
    return 2 ** zeros - 1 + this.readBits(zeros);
  }

  se(): number {
    const code = this.ue();
    const magnitude = Math.ceil(code / 2);
    return code % 2 === 0 ? -magnitude : magnitude;
  }
}

/** Removes H.264/HEVC emulation-prevention bytes from a NAL payload. */
export function unescapeRbsp(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  let written = 0;
  for (let index = 0; index < data.length; index++) {
    if (
      index + 2 < data.length &&
      data[index] === 0 &&
      data[index + 1] === 0 &&
      data[index + 2] === 3
    ) {
      out[written] = 0;
      out[written + 1] = 0;
      written += 2;
      index += 2;
      continue;
    }
    out[written] = data[index] ?? 0;
    written += 1;
  }
  return out.subarray(0, written);
}
