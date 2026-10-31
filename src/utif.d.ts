declare module 'utif' {
  export interface TiffIfd {
    width: number;
    height: number;
    data?: Uint8Array;
    t254?: number[];
    t255?: number[];
    t256?: number[];
    t257?: number[];
    t274?: number[];
    t282?: number[];
    t283?: number[];
    t296?: number[];
  }

  export interface UtifApi {
    decode(buffer: ArrayBuffer): TiffIfd[];
    decodeImage(buffer: ArrayBuffer, ifd: TiffIfd, ifds?: TiffIfd[]): void;
    toRGBA8(ifd: TiffIfd): Uint8Array;
  }

  const UTIF: UtifApi;
  export default UTIF;
}
