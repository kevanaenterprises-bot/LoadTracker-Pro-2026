/**
 * PDF-to-Image conversion utility using pdfjs-dist.
 * Renders PDF pages to canvas elements and exports them as base64 PNG images
 * suitable for sending to OCR APIs like Google Cloud Vision.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the PDF.js worker from CDN to avoid Vite bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface PdfPageImage {
  pageNumber: number;
  /** Full data URL string (e.g. "data:image/png;base64,...") */
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfConversionOptions {
  /** Render scale factor. Higher = better OCR quality but larger images. Default: 2.0 */
  scale?: number;
  /** Maximum number of pages to render. Default: 10 */
  maxPages?: number;
  /** Callback for progress updates during conversion */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Convert a PDF File into an array of page images (PNG data URLs).
 * Each page is rendered to an off-screen canvas at the specified scale,
 * then exported as a PNG data URL.
 */
export async function pdfToImages(
  file: File,
  options?: PdfConversionOptions
): Promise<PdfPageImage[]> {
  const scale = options?.scale ?? 2.0;
  const maxPages = options?.maxPages ?? 10;
  const onProgress = options?.onProgress;

  // Read the file into an ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    // Disable font loading to avoid unnecessary network requests
    disableFontFace: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = Math.min(pdf.numPages, maxPages);
  const pages: PdfPageImage[] = [];

  for (let i = 1; i <= numPages; i++) {
    onProgress?.(i, numPages);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    // Create an off-screen canvas for rendering
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`Could not get 2D context for page ${i}`);
    }

    // Fill with white background (PDFs can have transparent backgrounds)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the PDF page to the canvas
    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // Export canvas as PNG data URL
    const dataUrl = canvas.toDataURL('image/png');

    pages.push({
      pageNumber: i,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    });

    // Clean up page resources
    page.cleanup();
  }

  // Clean up document resources
  pdf.destroy();

  return pages;
}

/**
 * Get the number of pages in a PDF file without rendering them.
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  }).promise;
  const count = pdf.numPages;
  pdf.destroy();
  return count;
}
