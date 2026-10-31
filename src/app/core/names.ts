const KNOWN_EXTENSION = /\.(pdf|tif|tiff|zip|jpe?g)$/i;

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '';
  if (size < 1024) return `${Math.round(size)} B`;
  const kilobytes = size / 1024;
  if (kilobytes < 1024)
    return `${kilobytes >= 10 ? kilobytes.toFixed(0) : kilobytes.toFixed(1)} KB`;
  const megabytes = kilobytes / 1024;
  if (megabytes < 1024)
    return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
  return `${(megabytes / 1024).toFixed(1)} GB`;
}

export function formatPages(count: number): string {
  return count === 1 ? '1 page' : `${count} pages`;
}

export function fileStem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim();
  return stem || 'document';
}

export function downloadName(name: string, extension: string, fallback: string): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ');
  if (!cleaned) return fallback.toLowerCase().endsWith(ext) ? fallback : `${fallback}${ext}`;
  const withoutExtension = cleaned.replace(KNOWN_EXTENSION, '');
  return `${withoutExtension || 'document'}${ext}`;
}

export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let index = 2;
  let next = `${stem}-${index}${extension}`;
  while (used.has(next)) {
    index += 1;
    next = `${stem}-${index}${extension}`;
  }
  used.add(next);
  return next;
}

export function groupFileLabel(indices: readonly number[]): string {
  const pages = indices.map((index) => index + 1);
  if (pages.length === 1) return `page-${String(pages[0]).padStart(2, '0')}`;
  const forward = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  const backward = pages.every((page, index) => index === 0 || page === pages[index - 1] - 1);
  if (forward || backward) return `pages-${pages[0]}-${pages[pages.length - 1]}`;
  return `pages-${pages[0]}-set`;
}
