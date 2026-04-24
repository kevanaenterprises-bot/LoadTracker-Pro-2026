const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Read JPEG EXIF orientation tag from a Buffer.
 * Returns 1 (no rotation) if it can't be determined.
 * Common values: 1=normal, 3=180°, 6=90° CW, 8=90° CCW
 */
function getJpegOrientation(buf) {
  try {
    if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return 1;
    let offset = 2;
    while (offset + 4 <= buf.length) {
      if (buf[offset] !== 0xFF) break;
      const marker = (buf[offset] << 8) | buf[offset + 1];
      const segLen = buf.readUInt16BE(offset + 2);
      if (marker === 0xFFE1) { // APP1
        const exifSig = buf.slice(offset + 4, offset + 8).toString('binary');
        if (exifSig === 'Exif') {
          const tiff = offset + 10;
          const le = buf[tiff] === 0x49; // 'II' = little-endian
          const read16 = (o) => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
          const read32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
          const ifd0 = tiff + read32(tiff + 4);
          if (ifd0 + 2 > buf.length) return 1;
          const numTags = read16(ifd0);
          for (let i = 0; i < numTags; i++) {
            const e = ifd0 + 2 + i * 12;
            if (e + 12 > buf.length) break;
            if (read16(e) === 0x0112) return read16(e + 8); // Orientation tag
          }
        }
      } else if (marker === 0xFFDA) {
        break; // Start of scan — headers done
      }
      offset += 2 + segLen;
    }
  } catch {}
  return 1;
}

/**
 * Combine multiple PDFs and images into a single PDF.
 * Respects JPEG EXIF orientation so phone photos appear right-side up.
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

        const ext = path.extname(file.filename || '').toLowerCase();
        let image;

        if (ext === '.jpg' || ext === '.jpeg') {
          image = await mergedPdf.embedJpg(imageData);
        } else if (ext === '.png') {
          image = await mergedPdf.embedPng(imageData);
        } else {
          console.warn(`Unsupported image format: ${ext}, skipping ${file.filename}`);
          continue;
        }

        // Read EXIF orientation for JPEG so phone photos don't appear sideways
        const orientation = (ext === '.jpg' || ext === '.jpeg')
          ? getJpegOrientation(imageData)
          : 1;

        const rawW = image.width;
        const rawH = image.height;

        // Orientations 5-8 require 90°/270° rotation → swap page dimensions
        const needsSwap = orientation >= 5 && orientation <= 8;
        const pageW = needsSwap ? rawH : rawW;
        const pageH = needsSwap ? rawW : rawH;

        const page = mergedPdf.addPage([pageW, pageH]);

        // Apply rotation so image fills the page correctly.
        // pdf-lib uses PDF coordinates (origin bottom-left, y up).
        // Verified math for each orientation:
        //   6 = 90° CW:  translate(0, pageH), rotate -90°
        //   8 = 90° CCW: translate(pageW, 0), rotate +90°
        //   3 = 180°:    translate(pageW, pageH), rotate 180°
        if (orientation === 6) {
          page.drawImage(image, {
            x: 0, y: rawW,   // = pageH
            width: rawW, height: rawH,
            rotate: degrees(-90),
          });
        } else if (orientation === 8) {
          page.drawImage(image, {
            x: rawH, y: 0,   // = pageW
            width: rawW, height: rawH,
            rotate: degrees(90),
          });
        } else if (orientation === 3) {
          page.drawImage(image, {
            x: rawW, y: rawH,
            width: rawW, height: rawH,
            rotate: degrees(180),
          });
        } else {
          page.drawImage(image, {
            x: 0, y: 0,
            width: rawW, height: rawH,
          });
        }
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
