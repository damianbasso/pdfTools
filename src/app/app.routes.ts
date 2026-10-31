import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'merge' },
  {
    path: 'merge',
    title: 'Merge PDFs · pdfTools',
    loadComponent: () => import('./tools/merge-pdf').then((module) => module.MergePdf),
  },
  {
    path: 'split',
    title: 'Split PDF · pdfTools',
    loadComponent: () => import('./tools/split-pdf').then((module) => module.SplitPdf),
  },
  {
    path: 'images',
    title: 'Images to PDF · pdfTools',
    loadComponent: () => import('./tools/images-to-pdf').then((module) => module.ImagesToPdf),
  },
  {
    path: 'tiff',
    title: 'Combine TIFFs · pdfTools',
    loadComponent: () => import('./tools/combine-tiff').then((module) => module.CombineTiff),
  },
  { path: '**', redirectTo: 'merge' },
];
