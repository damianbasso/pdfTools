import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface ToolLink {
  path: string;
  index: string;
  name: string;
  detail: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  readonly tools: readonly ToolLink[] = [
    { path: '/merge', index: '01', name: 'Merge PDFs', detail: 'One file from many' },
    { path: '/split', index: '02', name: 'Split PDF', detail: 'Pages, ranges, extracts' },
    { path: '/images', index: '03', name: 'Images to PDF', detail: 'JPEG, PNG, and TIFF' },
    { path: '/tiff', index: '04', name: 'Combine TIFFs', detail: 'Multi-page TIFF' },
  ];
}
