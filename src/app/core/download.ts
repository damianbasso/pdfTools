import { copyBuffer } from './bytes';

export interface ReadyDownload {
  url: string;
  name: string;
}

export function toObjectUrl(data: Uint8Array, mime: string): string {
  return URL.createObjectURL(new Blob([copyBuffer(data)], { type: mime }));
}

export function replaceDownload(
  current: ReadyDownload | null,
  data: Uint8Array,
  mime: string,
  filename: string,
): ReadyDownload {
  if (current) URL.revokeObjectURL(current.url);
  const url = toObjectUrl(data, mime);
  saveUrl(url, filename);
  return { url, name: filename };
}

export function saveUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
