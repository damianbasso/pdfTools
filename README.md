# pdfTools

A local file editor for PDFs and scans. Merge and split PDFs, turn JPEG and TIFF files into one PDF, and combine separate TIFFs into a multi-page TIFF.

Everything runs in the browser. Files are not uploaded.

## Tools

- **Merge PDFs.** Put documents in order, optionally keep only some pages from each file, and save one PDF.
- **Split a PDF.** Save every page separately, cut ranges such as `1-3, 4-6`, or pick pages for a new PDF. Several outputs download as a zip.
- **Images to PDF.** JPEG and TIFF files become one PDF. Each TIFF page is its own PDF page. Page size can be A4, US Letter, or the image's own size.
- **Combine TIFFs.** Separate TIFF files are written as one multi-page TIFF. JPEG files can be mixed in as extra pages.

## Privacy

Processing uses JavaScript in the page. There is no server and no account. Closing the tab drops the files from memory.

Password-protected PDFs and BigTIFF files are not supported. Copying a PDF can drop interactive form behavior. TIFF output is RGB, and transparent pixels are flattened onto white.

## Develop

```bash
npm install
npm start
npm test
npm run build
```

`npm start` serves the app at `http://localhost:4200/`.
