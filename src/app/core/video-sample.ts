import { yieldThread } from './async';
import { contentBox, marginsAround, type ContentBox, type Margins } from './black-bars';

export function sampleTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0.2) return [0];
  const fractions = [0.12, 0.3, 0.5, 0.7, 0.88];
  const times = fractions.map((fraction) => Math.min(duration - 0.05, duration * fraction));
  return [...new Set(times.map((time) => Math.round(time * 1000) / 1000))];
}

export async function measureBlackBars(
  video: HTMLVideoElement,
  threshold: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ margins: Margins; width: number; height: number }> {
  await waitUntil(video, 'loadedmetadata', () => video.videoWidth > 0);
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 2 || height < 2) throw new Error('Could not play this video.');

  const times = sampleTimes(video.duration);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not read the video.');

  const wasMuted = video.muted;
  video.muted = true;
  const boxes: ContentBox[] = [];
  try {
    for (let index = 0; index < times.length; index++) {
      onProgress?.(index, times.length);
      await seekTo(video, times[index] ?? 0);
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const box = contentBox(frame.data, width, height, threshold);
      if (box) boxes.push(box);
      await yieldThread();
    }
  } finally {
    video.muted = wasMuted;
  }

  onProgress?.(times.length, times.length);
  if (!boxes.length) throw new Error('No picture was found to measure. The frames may be empty.');
  return { margins: marginsAround(boxes, width, height), width, height };
}

function waitUntil(
  video: HTMLVideoElement,
  event: 'loadedmetadata' | 'seeked' | 'loadeddata',
  ready: () => boolean,
): Promise<void> {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onEvent = () => {
      if (ready()) finish();
    };
    const onError = () => finish(new Error('Could not play this video.'));
    const timer = window.setTimeout(
      () => finish(new Error('Could not read a frame from this video.')),
      15000,
    );
    video.addEventListener(event, onEvent);
    video.addEventListener('error', onError);
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => {
      if (video.readyState >= 2) finish();
    };
    const onError = () => finish(new Error('Could not read a frame from this video.'));
    const timer = window.setTimeout(
      () => finish(new Error('Could not read a frame from this video.')),
      15000,
    );
    video.addEventListener('seeked', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onError);
    try {
      video.currentTime = time;
    } catch {
      finish(new Error('Could not read a frame from this video.'));
    }
  });
}
