import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { describeError } from '../core/errors';
import { replaceDownload, type ReadyDownload } from '../core/download';
import { exportCroppedVideo } from '../core/ffmpeg-crop';
import { fileStem, formatBytes } from '../core/names';
import { ZERO_MARGINS, type Margins } from '../core/black-bars';
import { readVideoGeometry } from '../core/mp4-video';
import { planVideoCrop, type CropPlan, type VideoGeometry } from '../core/video-crop';
import { measureBlackBars } from '../core/video-sample';
import { inputText } from '../ui/dom';
import { ActionBar } from '../ui/action-bar';
import { DropZone } from '../ui/drop-zone';

const MAX_VIDEO_BYTES = 750 * 1024 * 1024;

@Component({
  selector: 'app-crop-video',
  imports: [DropZone, ActionBar],
  templateUrl: './crop-video.html',
})
export class CropVideo {
  readonly accept = '.mp4,.mov,.m4v,video/mp4,video/quicktime';
  readonly sides = [
    { id: 'left', label: 'Left' },
    { id: 'right', label: 'Right' },
    { id: 'top', label: 'Top' },
    { id: 'bottom', label: 'Bottom' },
  ] as const;

  readonly file = signal<File | null>(null);
  readonly url = signal('');
  readonly threshold = signal(24);
  readonly margins = signal<Margins>({ ...ZERO_MARGINS });
  readonly measured = signal(false);
  readonly measuring = signal(false);
  readonly busy = signal(false);
  readonly progress = signal('');
  readonly error = signal('');
  readonly ready = signal<ReadyDownload | null>(null);

  private readonly geometry = signal<VideoGeometry | null>(null);
  private readonly presented = signal<{ width: number; height: number } | null>(null);
  private readonly player = viewChild<ElementRef<HTMLVideoElement>>('player');
  private token = 0;
  private remeasureTimer = 0;

  readonly fallback = computed(() => {
    const file = this.file();
    return file ? `${fileStem(file.name)}-cropped.mp4` : 'cropped.mp4';
  });

  readonly outcome = computed(() => {
    const geometry = this.geometry();
    const presented = this.presented();
    if (!geometry || !presented) return null;
    try {
      return {
        plan: planVideoCrop(geometry, this.margins(), presented.width, presented.height),
        problem: '',
      };
    } catch (caught) {
      return { plan: null as CropPlan | null, problem: describeError(caught) };
    }
  });

  readonly shades = computed(() => {
    const plan = this.outcome()?.plan;
    const presented = this.presented();
    if (!plan || !presented?.width || !presented.height) return null;
    return {
      left: (plan.previewMargins.left / presented.width) * 100,
      right: (plan.previewMargins.right / presented.width) * 100,
      top: (plan.previewMargins.top / presented.height) * 100,
      bottom: (plan.previewMargins.bottom / presented.height) * 100,
    };
  });

  readonly canRun = computed(() => !!this.outcome()?.plan?.removesPixels && !this.measuring());

  readonly hint = computed(() => {
    if (this.measuring()) return this.progress() || 'Checking frames for black bars.';
    if (!this.file()) {
      return 'Straight black bars only. Audio is copied, and the picture is kept without quality loss.';
    }
    const plan = this.outcome()?.plan;
    if (!plan) return '';
    if (!plan.removesPixels) {
      return 'No black bars were found. Raise the black level if the bars are dark gray.';
    }
    const { width, height } = plan.output;
    if (plan.method === 'lossless') {
      return `Saves a ${width}×${height} video. The picture is rewritten without quality loss, so the file can be larger. Audio is copied.`;
    }
    return `Saves a ${width}×${height} video. The picture is copied, not re-encoded.`;
  });

  readonly problem = computed(() => this.outcome()?.problem ?? '');

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      window.clearTimeout(this.remeasureTimer);
      this.token += 1;
      this.revoke();
    });
  }

  async add(files: File[]): Promise<void> {
    const file = files[0];
    if (!file || this.busy() || this.measuring()) return;
    const token = ++this.token;
    this.reset(false);
    this.error.set('');
    if (file.size > MAX_VIDEO_BYTES) {
      this.error.set(
        'This video is larger than 750 MB. Cropping keeps the whole file in memory, so use a smaller one.',
      );
      return;
    }

    this.measuring.set(true);
    this.progress.set('Reading the video...');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const geometry = readVideoGeometry(bytes);
      if (token !== this.token) return;
      this.geometry.set(geometry);
      this.file.set(file);
      this.url.set(URL.createObjectURL(file));
      const video = await this.waitForPlayer();
      if (token !== this.token) return;
      if (!video) throw new Error('Could not play this video.');
      await this.readBars(video, token);
    } catch (caught) {
      if (token !== this.token) return;
      this.error.set(describeError(caught));
    } finally {
      if (token === this.token) {
        this.measuring.set(false);
        this.progress.set('');
      }
    }
  }

  setMargin(side: keyof Margins, event: Event): void {
    const value = Number(inputText(event));
    if (!Number.isFinite(value)) return;
    this.margins.update((margins) => ({ ...margins, [side]: Math.max(0, Math.round(value)) }));
  }

  setThreshold(event: Event): void {
    if (this.busy() || this.measuring()) return;
    const value = Math.min(80, Math.max(0, Math.round(Number(inputText(event)))));
    if (!Number.isFinite(value) || value === this.threshold()) return;
    this.threshold.set(value);
    window.clearTimeout(this.remeasureTimer);
    this.remeasureTimer = window.setTimeout(() => void this.remeasure(), 250);
  }

  clear(): void {
    if (this.busy()) return;
    this.token += 1;
    this.reset(true);
  }

  async run(filename: string): Promise<void> {
    const file = this.file();
    const plan = this.outcome()?.plan;
    if (!file || !plan?.removesPixels || this.busy() || this.measuring()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.progress.set('Preparing the video...');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const output = await exportCroppedVideo(bytes, plan, (message) => this.progress.set(message));
      this.ready.set(replaceDownload(this.ready(), output, 'video/mp4', filename));
    } catch (caught) {
      this.error.set(describeError(caught));
    } finally {
      this.busy.set(false);
      this.progress.set('');
    }
  }

  margin(side: keyof Margins): number {
    return this.margins()[side];
  }

  sizeLabel(file: File): string {
    return formatBytes(file.size);
  }

  private async remeasure(): Promise<void> {
    if (this.busy() || this.measuring() || !this.file()) return;
    const video = this.player()?.nativeElement;
    if (!video) return;
    const token = this.token;
    this.measuring.set(true);
    this.error.set('');
    try {
      await this.readBars(video, token);
    } catch (caught) {
      if (token !== this.token) return;
      this.error.set(describeError(caught));
    } finally {
      if (token === this.token) {
        this.measuring.set(false);
        this.progress.set('');
      }
    }
  }

  private async readBars(video: HTMLVideoElement, token: number): Promise<void> {
    const result = await measureBlackBars(video, this.threshold(), (done, total) => {
      if (token === this.token) {
        this.progress.set(`Checking frame ${Math.min(done + 1, total)} of ${total}...`);
      }
    });
    if (token !== this.token) return;
    this.presented.set({ width: result.width, height: result.height });
    this.margins.set(result.margins);
    this.measured.set(true);
    video.currentTime = 0;
  }

  private async waitForPlayer(): Promise<HTMLVideoElement | null> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const video = this.player()?.nativeElement;
      if (video) return video;
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    return null;
  }

  private reset(clearError: boolean): void {
    window.clearTimeout(this.remeasureTimer);
    this.revoke();
    this.file.set(null);
    this.url.set('');
    this.geometry.set(null);
    this.presented.set(null);
    this.margins.set({ ...ZERO_MARGINS });
    this.measured.set(false);
    this.measuring.set(false);
    this.progress.set('');
    this.ready.set(null);
    if (clearError) this.error.set('');
  }

  private revoke(): void {
    const ready = this.ready();
    if (ready) URL.revokeObjectURL(ready.url);
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
  }
}
