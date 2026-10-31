import { copyBuffer } from './bytes';
import { cropArguments, type CropPlan } from './video-crop';

type FfmpegInstance = {
  load: (config: { classWorkerURL: string; coreURL: string; wasmURL: string }) => Promise<boolean>;
  writeFile: (path: string, data: Uint8Array) => Promise<unknown>;
  exec: (args: string[]) => Promise<number>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile: (path: string) => Promise<unknown>;
  on: (
    event: 'log' | 'progress',
    callback: (payload: { message: string; progress: number }) => void,
  ) => void;
};

let engine: Promise<FfmpegInstance> | null = null;
let logLines: string[] = [];
let progressListener: ((progress: number) => void) | null = null;

export async function exportCroppedVideo(
  bytes: Uint8Array,
  plan: CropPlan,
  onProgress?: (message: string) => void,
): Promise<Uint8Array> {
  const ffmpeg = await loadEngine(onProgress);
  logLines = [];
  const label = plan.method === 'lossless' ? 'Rewriting the picture' : 'Cropping';
  progressListener = (progress) => {
    if (!Number.isFinite(progress) || progress <= 0) return;
    onProgress?.(`${label}... ${Math.min(100, Math.round(progress * 100))}%`);
  };

  onProgress?.(`${label}...`);
  await ffmpeg.writeFile('source.mp4', new Uint8Array(copyBuffer(bytes)));
  try {
    const code = await ffmpeg.exec(cropArguments(plan));
    if (code !== 0) throw new Error(summarizeLog(logLines));
    const output = await ffmpeg.readFile('cropped.mp4');
    if (typeof output === 'string') throw new Error('Could not read the cropped video.');
    return new Uint8Array(copyBuffer(output));
  } finally {
    progressListener = null;
    await ffmpeg.deleteFile('source.mp4').catch(() => undefined);
    await ffmpeg.deleteFile('cropped.mp4').catch(() => undefined);
  }
}

function loadEngine(onProgress?: (message: string) => void): Promise<FfmpegInstance> {
  if (!engine) {
    engine = startEngine(onProgress).catch((error: unknown) => {
      engine = null;
      throw error;
    });
  }
  return engine;
}

async function startEngine(onProgress?: (message: string) => void): Promise<FfmpegInstance> {
  onProgress?.('Loading the video engine...');
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const ffmpeg = new FFmpeg() as unknown as FfmpegInstance;
  ffmpeg.on('log', ({ message }) => {
    if (message) logLines.push(message);
  });
  ffmpeg.on('progress', ({ progress }) => progressListener?.(progress));
  const [coreURL, wasmURL] = await Promise.all([
    blobUrl('ffmpeg/ffmpeg-core.js', 'text/javascript', onProgress),
    blobUrl('ffmpeg/ffmpeg-core.wasm', 'application/wasm', onProgress),
  ]);
  try {
    await ffmpeg.load({
      classWorkerURL: new URL('ffmpeg/worker.js', document.baseURI).href,
      coreURL,
      wasmURL,
    });
  } finally {
    URL.revokeObjectURL(coreURL);
    URL.revokeObjectURL(wasmURL);
  }
  return ffmpeg;
}

async function blobUrl(
  path: string,
  type: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok || !response.body) throw new Error('Could not load the video engine.');
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    if (total > 0 && type === 'application/wasm') {
      onProgress?.(`Loading the video engine... ${Math.round((loaded / total) * 100)}%`);
    }
  }
  const blob = new Blob(
    chunks.map((chunk) => copyBuffer(chunk)),
    { type },
  );
  return URL.createObjectURL(blob);
}

function summarizeLog(lines: string[]): string {
  const useful = lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('ffmpeg version'));
  let message = 'Could not crop this video.';
  for (let index = useful.length - 1; index >= 0; index--) {
    const line = useful[index] ?? '';
    if (/error|invalid|failed/i.test(line)) {
      message = line;
      break;
    }
    if (index === useful.length - 1) message = line;
  }
  return message.length > 220 ? `${message.slice(0, 217)}...` : message;
}
