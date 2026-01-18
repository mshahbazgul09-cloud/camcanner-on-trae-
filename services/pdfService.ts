
import { jsPDF } from 'jspdf';
import { ScannedPage } from '../types';

/**
 * Generates a PDF Blob from a list of scanned pages.
 * Handles different aspect ratios and fits images to A4 pages.
 */
export const generatePDFBlob = async (title: string, pages: ScannedPage[]): Promise<Blob> => {
  if (pages.length === 0) throw new Error("No pages to generate PDF");

  // Initialize PDF (default A4 portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210; // A4 width mm
  const pageHeight = 297; // A4 height mm

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    
    // Add new page for subsequent images
    if (i > 0) doc.addPage();

    try {
      // 1. Fetch the processed image blob
      const response = await fetch(page.processedUrl);
      const blob = await response.blob();
      
      // 2. Get image dimensions
      const imgBitmap = await createImageBitmap(blob);
      const imgW = imgBitmap.width;
      const imgH = imgBitmap.height;
      const ratio = imgW / imgH;

      // 3. Determine Orientation
      // If image is landscape, we can rotate the page or fit it into portrait.
      // Standard scanner behavior: Auto-rotate page to match image best
      const isLandscape = ratio > 1;
      doc.setPage(i + 1); 
      
      // Calculate dimensions to fit within margins (e.g., 10mm margin)
      const margin = 10;
      const maxW = pageWidth - (margin * 2);
      const maxH = pageHeight - (margin * 2);

      let finalW = maxW;
      let finalH = finalW / ratio;

      if (finalH > maxH) {
        finalH = maxH;
        finalW = finalH * ratio;
      }

      // Center the image
      const x = (pageWidth - finalW) / 2;
      const y = (pageHeight - finalH) / 2;

      // 4. Convert to Base64 (jsPDF requires it or Uint8Array)
      const buffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      doc.addImage(uint8, 'JPEG', x, y, finalW, finalH, undefined, 'FAST');

    } catch (e) {
      console.error(`Failed to add page ${i} to PDF`, e);
      doc.text(`Error loading page ${i + 1}`, 20, 20);
    }
  }

  return doc.output('blob');
};

/**
 * Generates and downloads the PDF to the user's local storage.
 */
export const generatePDF = async (title: string, pages: ScannedPage[]): Promise<void> => {
  const blob = await generatePDFBlob(title, pages);
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'document';
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Exports extracted OCR text as a .txt file.
 */
export const downloadText = (title: string, text: string) => {
  const element = document.createElement("a");
  const file = new Blob([text], {type: 'text/plain;charset=utf-8'});
  element.href = URL.createObjectURL(file);
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'document';
  element.download = `${safeTitle}.txt`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};
