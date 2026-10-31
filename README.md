# pdfTools

A local file editor for PDFs, scans, and video. Merge and split PDFs, turn JPEG, PNG, and TIFF files into one PDF, combine separate TIFFs into a multi-page TIFF, and crop black bars out of a video without losing picture quality.

Everything runs in the browser. Files are not uploaded.

## Tools

- **Merge PDFs.** Put documents in order, optionally keep only some pages from each file, and save one PDF.
- **Split a PDF.** Save every page separately, cut ranges such as `1-3, 4-6`, or pick pages for a new PDF. Several outputs download as a zip.
- **Images to PDF.** JPEG, PNG, and TIFF files become one PDF. Each JPEG or PNG is one page, and each TIFF page is its own PDF page. Page size can be A4, US Letter, or the image's own size. PNG files are embedded as-is.
- **Combine TIFFs.** Separate TIFF files are written as one multi-page TIFF. JPEG files can be mixed in as extra pages.
- **Crop video.** Remove straight black bars from an H.264 or HEVC video in an MP4 or MOV. Audio is copied, and the cropped picture matches the original pixels. Some files keep the compressed picture and only change the crop window. A crop from the top or the left is rewritten without quality loss so the file plays at the new size, and that file can be larger. Other codecs cannot be cropped this way.

## Privacy

Processing uses JavaScript in the page. There is no server and no account. Closing the tab drops the files from memory. The video tool loads FFmpeg from this same site the first time you crop. The video itself is not uploaded. FFmpeg is included under the GPL.

Password-protected PDFs and BigTIFF files are not supported. Copying a PDF can drop interactive form behavior. TIFF output is RGB, and transparent pixels are flattened onto white.

## Develop

```bash
npm install
npm start
npm test
npm run build
```

`npm start` serves the app at `http://localhost:4200/`.
