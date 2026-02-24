const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Combine multiple PDFs and images into a single PDF
 * @param {Array} files - Array of {type: 'pdf'|'image', data: Buffer|base64, filename: string}
 * @returns {Promise<Buffer>} - Combined PDF as buffer
 */
async function combinePDFs(files) {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    try {
      if (file.type === 'pdf') {
        // Handle PDF files
        const pdfData = Buffer.isBuffer(file.data) 
          ? file.data 
          : Buffer.from(file.data, 'base64');
        
        const pdf = await PDFDocument.load(pdfData);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        
      } else if (file.type === 'image') {
        // Handle image files (JPG, PNG)
        const imageData = Buffer.isBuffer(file.data)
          ? file.data
          : Buffer.from(file.data, 'base64');
        
        let image;
        const ext = path.extname(file.filename).toLowerCase();
        
        if (ext === '.jpg' || ext === '.jpeg') {
          image = await mergedPdf.embedJpg(imageData);
        } else if (ext === '.png') {
          image = await mergedPdf.embedPng(imageData);
        } else {
          console.warn(`Unsupported image format: ${ext}, skipping ${file.filename}`);
          continue;
        }
        
        // Create page with image
        const page = mergedPdf.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }
    } catch (error) {
      console.error(`Error processing file ${file.filename}:`, error.message);
      // Continue with other files even if one fails
    }
  }

  const pdfBytes = await mergedPdf.save();
  return Buffer.from(pdfBytes);
}

module.exports = { combinePDFs };
