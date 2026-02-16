import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Letter size in mm
const PAGE_W = 215.9;
const PAGE_H = 279.4;

// Margins in mm
const MARGIN = 7.62; // ~0.3 inches
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_H = PAGE_H - MARGIN * 2;

/**
 * Load an image from URL and return as HTMLImageElement.
 * Uses a canvas proxy to handle CORS images.
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Convert an image element to a data URL via canvas.
 */
function imageToDataUrl(img: HTMLImageElement, format: 'JPEG' | 'PNG' = 'JPEG'): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  
  // White background for JPEG (no transparency)
  if (format === 'JPEG') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL(`image/${format.toLowerCase()}`, 0.92);
}

/**
 * Calculate image dimensions to fit within a given area while maintaining aspect ratio.
 */
function fitImageToArea(
  imgWidth: number,
  imgHeight: number,
  areaWidth: number,
  areaHeight: number
): { w: number; h: number; x: number; y: number } {
  const imgRatio = imgWidth / imgHeight;
  const areaRatio = areaWidth / areaHeight;

  let w: number, h: number;
  if (imgRatio > areaRatio) {
    // Image is wider relative to area
    w = areaWidth;
    h = areaWidth / imgRatio;
  } else {
    // Image is taller relative to area
    h = areaHeight;
    w = areaHeight * imgRatio;
  }

  // Center in area
  const x = (areaWidth - w) / 2;
  const y = (areaHeight - h) / 2;

  return { w, h, x, y };
}

/**
 * Add a POD page header bar to the PDF (blue gradient header).
 */
function addPodPageHeader(
  pdf: jsPDF,
  title: string,
  subtitle: string,
  companyName: string,
  invoiceNumber: string,
  podIndex: number,
  totalPods: number
) {
  // Blue header bar
  pdf.setFillColor(30, 64, 175); // #1e40af
  pdf.rect(0, 0, PAGE_W, 18, 'F');

  // Gradient overlay (lighter blue on right side)
  pdf.setFillColor(59, 130, 246); // #3b82f6
  pdf.rect(PAGE_W * 0.5, 0, PAGE_W * 0.5, 18, 'F');

  // Title text
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, MARGIN + 2, 8);

  // Subtitle
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(subtitle, MARGIN + 2, 13.5);

  // Page indicator on right
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  const pageText = `POD ${podIndex} of ${totalPods}`;
  const textWidth = pdf.getTextWidth(pageText);
  pdf.text(pageText, PAGE_W - MARGIN - textWidth - 2, 10);

  // Footer
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(148, 163, 184); // #94a3b8
  const footerText = `${companyName}  •  Invoice ${invoiceNumber}  •  POD ${podIndex} of ${totalPods}`;
  const footerWidth = pdf.getTextWidth(footerText);
  pdf.text(footerText, (PAGE_W - footerWidth) / 2, PAGE_H - 5);

  // Footer line
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, PAGE_H - 8, PAGE_W - MARGIN, PAGE_H - 8);
}

export interface PodDocForPdf {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
}

export interface PdfGenerationOptions {
  invoiceElement: HTMLElement;
  podDocuments: PodDocForPdf[];
  invoiceNumber: string;
  loadNumber: string;
  companyName: string;
  onProgress?: (message: string) => void;
}

/**
 * Generate a complete invoice PDF with invoice on page 1 and PODs on subsequent pages.
 */
export async function generateInvoicePdf(options: PdfGenerationOptions): Promise<Blob> {
  const { invoiceElement, podDocuments, invoiceNumber, loadNumber, companyName, onProgress } = options;

  onProgress?.('Rendering invoice page...');

  // Step 1: Capture the invoice page using html2canvas
  const canvas = await html2canvas(invoiceElement, {
    scale: 2, // High quality
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    // Remove any transform/scroll issues
    scrollX: 0,
    scrollY: 0,
    windowWidth: invoiceElement.scrollWidth,
    windowHeight: invoiceElement.scrollHeight,
  });

  // Step 2: Create PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  // Step 3: Add invoice page (page 1)
  const canvasDataUrl = canvas.toDataURL('image/jpeg', 0.95);


  // Fit the invoice canvas to the full page
  const invoiceFit = fitImageToArea(canvas.width, canvas.height, PAGE_W, PAGE_H);
  pdf.addImage(canvasDataUrl, 'JPEG', invoiceFit.x, invoiceFit.y, invoiceFit.w, invoiceFit.h);

  // Step 4: Add each POD document as a new page
  const imagePods = podDocuments.filter(d => d.file_type?.startsWith('image/'));
  
  for (let i = 0; i < imagePods.length; i++) {
    const doc = imagePods[i];
    onProgress?.(`Processing POD ${i + 1} of ${imagePods.length}...`);

    try {
      // Load the image
      const img = await loadImage(doc.file_url);
      const dataUrl = imageToDataUrl(img, 'JPEG');

      // Add new page
      pdf.addPage('letter', 'portrait');

      // Add blue header
      addPodPageHeader(
        pdf,
        `POD Document ${i + 1} of ${imagePods.length}`,
        `Invoice: ${invoiceNumber}  |  Load: ${loadNumber}  |  File: ${doc.file_name}`,
        companyName,
        invoiceNumber,
        i + 1,
        imagePods.length
      );

      // Calculate image area (below header, above footer)
      const imgAreaTop = 22; // mm below header
      const imgAreaBottom = PAGE_H - 12; // mm above footer
      const imgAreaHeight = imgAreaBottom - imgAreaTop;
      const imgAreaWidth = CONTENT_W;

      // Fit image into available area
      const fit = fitImageToArea(img.naturalWidth, img.naturalHeight, imgAreaWidth, imgAreaHeight);

      // Draw image centered in the available area
      const imgX = MARGIN + fit.x;
      const imgY = imgAreaTop + fit.y;

      pdf.addImage(dataUrl, 'JPEG', imgX, imgY, fit.w, fit.h);

      // Optional: thin border around image
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.3);
      pdf.rect(imgX, imgY, fit.w, fit.h);

    } catch (err) {
      console.error(`Failed to add POD ${i + 1} to PDF:`, err);
      
      // Add error page
      pdf.addPage('letter', 'portrait');
      addPodPageHeader(
        pdf,
        `POD Document ${i + 1} of ${imagePods.length}`,
        `Invoice: ${invoiceNumber}  |  Load: ${loadNumber}  |  File: ${doc.file_name}`,
        companyName,
        invoiceNumber,
        i + 1,
        imagePods.length
      );

      pdf.setTextColor(220, 38, 38);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Image could not be loaded', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(doc.file_name, PAGE_W / 2, PAGE_H / 2 + 8, { align: 'center' });
    }
  }

  onProgress?.('Finalizing PDF...');
  return pdf.output('blob');
}

/**
 * Download a generated PDF blob.
 */
export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert a single JPEG/PNG image URL to a PDF and download it.
 * Used for customers who only accept PDF files.
 */
export async function convertImageToPdf(
  imageUrl: string,
  fileName: string,
  onProgress?: (message: string) => void
): Promise<Blob> {
  onProgress?.('Loading image...');

  const img = await loadImage(imageUrl);
  const dataUrl = imageToDataUrl(img, 'JPEG');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  // Fit image to full page with small margins
  const fit = fitImageToArea(img.naturalWidth, img.naturalHeight, CONTENT_W, CONTENT_H);
  const imgX = MARGIN + fit.x;
  const imgY = MARGIN + fit.y;

  pdf.addImage(dataUrl, 'JPEG', imgX, imgY, fit.w, fit.h);

  onProgress?.('Generating PDF...');
  return pdf.output('blob');
}

/**
 * Convert multiple POD images to a single multi-page PDF.
 * Each image gets its own page.
 */
export async function convertPodsToPdf(
  pods: PodDocForPdf[],
  invoiceNumber: string,
  loadNumber: string,
  companyName: string,
  onProgress?: (message: string) => void
): Promise<Blob> {
  const imagePods = pods.filter(d => d.file_type?.startsWith('image/'));
  if (imagePods.length === 0) throw new Error('No image PODs to convert');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  for (let i = 0; i < imagePods.length; i++) {
    const doc = imagePods[i];
    onProgress?.(`Converting POD ${i + 1} of ${imagePods.length}...`);

    if (i > 0) pdf.addPage('letter', 'portrait');

    try {
      const img = await loadImage(doc.file_url);
      const dataUrl = imageToDataUrl(img, 'JPEG');

      // Add blue header
      addPodPageHeader(
        pdf,
        `POD Document ${i + 1} of ${imagePods.length}`,
        `Invoice: ${invoiceNumber}  |  Load: ${loadNumber}  |  File: ${doc.file_name}`,
        companyName,
        invoiceNumber,
        i + 1,
        imagePods.length
      );

      const imgAreaTop = 22;
      const imgAreaBottom = PAGE_H - 12;
      const imgAreaHeight = imgAreaBottom - imgAreaTop;

      const fit = fitImageToArea(img.naturalWidth, img.naturalHeight, CONTENT_W, imgAreaHeight);
      const imgX = MARGIN + fit.x;
      const imgY = imgAreaTop + fit.y;

      pdf.addImage(dataUrl, 'JPEG', imgX, imgY, fit.w, fit.h);

      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.3);
      pdf.rect(imgX, imgY, fit.w, fit.h);
    } catch (err) {
      console.error(`Failed to convert POD ${i + 1}:`, err);
      pdf.setTextColor(220, 38, 38);
      pdf.setFontSize(12);
      pdf.text('Image could not be loaded', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
    }
  }

  return pdf.output('blob');

}

/**
 * Convert a Blob to a base64 string (without the data URL prefix).
 * Used for sending PDFs to edge functions as attachments.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the "data:application/pdf;base64," prefix
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a complete invoice PDF and return as base64 string.
 * Used for attaching to emails via edge functions.
 */
export async function generateInvoicePdfBase64(options: PdfGenerationOptions): Promise<{
  base64: string;
  filename: string;
}> {
  const blob = await generateInvoicePdf(options);
  const base64 = await blobToBase64(blob);
  const filename = `Invoice_${options.invoiceNumber}_${options.loadNumber}.pdf`;
  return { base64, filename };
}

/**
 * Generate ONLY the invoice page as a PDF (no PODs).
 * Used for email attachments — PODs are fetched server-side by the edge function.
 * This keeps the request payload small (~200-500KB) to avoid timeouts.
 */
export async function generateInvoiceOnlyPdfBase64(options: {
  invoiceElement: HTMLElement;
  invoiceNumber: string;
  loadNumber: string;
  onProgress?: (message: string) => void;
}): Promise<{
  base64: string;
  filename: string;
}> {
  const { invoiceElement, invoiceNumber, loadNumber, onProgress } = options;

  onProgress?.('Rendering invoice page...');

  // Capture the invoice page using html2canvas
  const canvas = await html2canvas(invoiceElement, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    windowWidth: invoiceElement.scrollWidth,
    windowHeight: invoiceElement.scrollHeight,
  });

  // Create single-page PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const canvasDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const invoiceFit = fitImageToArea(canvas.width, canvas.height, PAGE_W, PAGE_H);
  pdf.addImage(canvasDataUrl, 'JPEG', invoiceFit.x, invoiceFit.y, invoiceFit.w, invoiceFit.h);

  onProgress?.('Preparing invoice for email...');
  const blob = pdf.output('blob');
  const base64 = await blobToBase64(blob);
  const filename = `Invoice_${invoiceNumber}_${loadNumber}.pdf`;
  return { base64, filename };
}

/**
 * Load an image URL and convert it to a base64 data URL.
 * Used by the print function to embed images directly in the print HTML
 * so they don't need to be fetched again (avoids CORS / timing issues).
 */
export async function loadImageToDataUrl(url: string): Promise<string> {
  const img = await loadImage(url);
  return imageToDataUrl(img, 'JPEG');
}
