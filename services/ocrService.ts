
import Tesseract from 'tesseract.js';

const SERVER_API_URL = '/api/ocr';

/**
 * Guidance on Client vs Server OCR:
 * 
 * SERVER-SIDE:
 * - PROS: Consistent performance, handles large files better, keeps logic hidden, no large model downloads on client.
 * - CONS: Requires internet, server costs, latency due to upload.
 * - WHEN TO USE: Default choice for most web apps, especially for high-quality results or batch processing.
 * 
 * CLIENT-SIDE (FALLBACK):
 * - PROS: Works offline, better privacy (data never leaves device), free (no server compute).
 * - CONS: Heavy initial download (worker + language data), slower on mobile devices, drains battery.
 * - WHEN TO USE: When offline, server is down, or for privacy-sensitive mode.
 */

export interface OcrResult {
  text: string;
  confidence: number;
}

/**
 * Extracts text from an image URL. 
 * Tries the Node.js server first, then falls back to browser-side Tesseract.js.
 */
export const extractText = async (blobUrl: string): Promise<OcrResult> => {
  try {
    // 1. Try Server-side OCR
    return await extractTextServer(blobUrl);
  } catch (serverError) {
    console.warn("Server OCR failed or unreachable. Falling back to client-side OCR.", serverError);
    
    // 2. Client-side Fallback
    try {
      return await extractTextClient(blobUrl);
    } catch (clientError) {
      console.error("Client OCR also failed.", clientError);
      throw new Error("Failed to extract text from image.");
    }
  }
};

const extractTextServer = async (blobUrl: string): Promise<OcrResult> => {
  const blob = await fetch(blobUrl).then(r => r.blob());
  const formData = new FormData();
  formData.append('image', blob, 'scan.jpg');

  // We set a timeout to fail fast if server is not responding
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const response = await fetch(SERVER_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();
    return {
      text: data.text || "",
      confidence: data.confidence || 0
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const extractTextClient = async (blobUrl: string): Promise<OcrResult> => {
  console.log("Initializing Client-side Tesseract Worker...");
  
  // Tesseract.js v5 standard usage via default import for CDN compatibility
  const worker = await Tesseract.createWorker('eng');
  
  // Recognize
  const ret = await worker.recognize(blobUrl);
  
  // Clean up
  await worker.terminate();

  return {
    text: ret.data.text,
    confidence: ret.data.confidence
  };
};
