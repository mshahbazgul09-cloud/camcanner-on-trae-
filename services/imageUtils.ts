
import { Point } from '../types';

/**
 * Loads an image from a URL into an HTMLImageElement.
 */
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

/**
 * Helper to sort corners in TL, TR, BR, BL order.
 * Ensures the polygon is wound correctly for homography.
 */
export const sortCorners = (pts: Point[]): Point[] => {
    // Sort by Y to separate top from bottom
    const sortedY = [...pts].sort((a, b) => a.y - b.y);
    const top = sortedY.slice(0, 2).sort((a, b) => a.x - b.x); // Top: Left, Right
    const bottom = sortedY.slice(2, 4).sort((a, b) => b.x - a.x); // Bottom: Right, Left (to wind CW? No, standard is TL, TR, BR, BL)
    // Actually standard Homography usually expects TL, TR, BR, BL or TL, TR, BL, BR depending on impl.
    // Our homography function maps to (0,0), (w,0), (w,h), (0,h).
    // So we want: TL, TR, BR, BL.
    
    // Bottom sorted by X descending means bottom[0] is BR, bottom[1] is BL.
    // So [TL, TR, BR, BL]
    return [top[0], top[1], bottom[0], bottom[1]];
};

/**
 * Solves for the Homography Matrix (3x3) mapping src points to dst points.
 * Returns the 8 coefficients (h33 is 1).
 * Maps dst -> src (inverse mapping) to ensure no holes in output.
 */
const getHomographyMatrix = (src: Point[], dst: Point[]): number[] => {
  let A: number[][] = [];
  let B: number[] = [];

  for (let i = 0; i < 4; i++) {
    let s = src[i];
    let d = dst[i];
    A.push([d.x, d.y, 1, 0, 0, 0, -d.x * s.x, -d.y * s.x]);
    A.push([0, 0, 0, d.x, d.y, 1, -d.x * s.y, -d.y * s.y]);
    B.push(s.x);
    B.push(s.y);
  }

  // Gaussian elimination to solve Ax = B
  const n = 8;
  for (let i = 0; i < n; i++) {
    // Pivot
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    // Swap
    for (let k = i; k < n; k++) {
      let tmp = A[maxRow][k];
      A[maxRow][k] = A[i][k];
      A[i][k] = tmp;
    }
    let tmp = B[maxRow];
    B[maxRow] = B[i];
    B[i] = tmp;

    // Zero out below
    for (let k = i + 1; k < n; k++) {
      let c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      B[k] += c * B[i];
    }
  }

  // Back substitution
  let x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * x[j];
    }
    x[i] = (B[i] - sum) / A[i][i];
  }

  return x; // [h00, h01, h02, h10, h11, h12, h20, h21]
};

/**
 * Applies a perspective transform to an image based on 4 corner points.
 * @param imageUrl Source image URL
 * @param corners Array of 4 points {x, y} in order: TL, TR, BR, BL
 */
export const warpPerspective = async (imageUrl: string, corners: Point[]): Promise<string> => {
  const img = await loadImage(imageUrl);

  // Ensure corners are sorted (TL, TR, BR, BL)
  const sortedCorners = sortCorners(corners);

  // 1. Calculate dimensions of the destination (flattened) image
  // Width = max(distance(TL, TR), distance(BL, BR))
  const dist = (p1: Point, p2: Point) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  const widthTop = dist(sortedCorners[0], sortedCorners[1]);
  const widthBottom = dist(sortedCorners[3], sortedCorners[2]);
  const heightLeft = dist(sortedCorners[0], sortedCorners[3]);
  const heightRight = dist(sortedCorners[1], sortedCorners[2]);

  const dstWidth = Math.max(widthTop, widthBottom);
  const dstHeight = Math.max(heightLeft, heightRight);

  // 2. Define Destination Points (Rectangular)
  const dstPoints: Point[] = [
    { x: 0, y: 0 },
    { x: dstWidth, y: 0 },
    { x: dstWidth, y: dstHeight },
    { x: 0, y: dstHeight }
  ];

  // 3. Get Homography Matrix
  const H = getHomographyMatrix(sortedCorners, dstPoints);

  // 4. Create Canvas and Warp
  const canvas = document.createElement('canvas');
  canvas.width = dstWidth;
  canvas.height = dstHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get context");

  // Draw source image to temp canvas to access pixel data
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error("Could not get src context");
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
  const dstData = ctx.createImageData(dstWidth, dstHeight);

  // 5. Inverse Mapping Loop (Iterate over Destination Pixels)
  const data = dstData.data;
  const srcPixels = srcData.data;
  const sw = img.width;
  const sh = img.height;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      // Apply Homography to (x, y) to find (u, v) in source
      const denominator = H[6] * x + H[7] * y + 1;
      const u = (H[0] * x + H[1] * y + H[2]) / denominator;
      const v = (H[3] * x + H[4] * y + H[5]) / denominator;

      // Nearest Neighbor (or Bilinear Interpolation for better quality)
      const srcX = Math.round(u);
      const srcY = Math.round(v);

      const dstIdx = (y * dstWidth + x) * 4;

      if (srcX >= 0 && srcX < sw && srcY >= 0 && srcY < sh) {
        const srcIdx = (srcY * sw + srcX) * 4;
        data[dstIdx] = srcPixels[srcIdx];       // R
        data[dstIdx + 1] = srcPixels[srcIdx + 1]; // G
        data[dstIdx + 2] = srcPixels[srcIdx + 2]; // B
        data[dstIdx + 3] = 255;                   // Alpha
      } else {
        data[dstIdx + 3] = 0; // Transparent if out of bounds
      }
    }
  }

  ctx.putImageData(dstData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : imageUrl), 'image/jpeg', 0.95);
  });
};

/**
 * Adjusts Brightness and Contrast of an image.
 * @param contrast 1.0 is normal. < 1 is low contrast, > 1 is high.
 * @param brightness 0 is normal. +/- 255.
 */
export const adjustImage = async (imageUrl: string, contrast: number = 1.0, brightness: number = 0): Promise<string> => {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("No context");

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // R
    data[i] = contrast * (data[i] - 128) + 128 + brightness;
    // G
    data[i + 1] = contrast * (data[i + 1] - 128) + 128 + brightness;
    // B
    data[i + 2] = contrast * (data[i + 2] - 128) + 128 + brightness;
  }

  ctx.putImageData(imageData, 0, 0);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : imageUrl), 'image/jpeg', 0.9);
  });
};

/**
 * Converts image to Black and White using a threshold.
 * @param threshold 0-255. Default 128.
 */
export const binarizeImage = async (imageUrl: string, threshold: number = 128): Promise<string> => {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("No context");

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const val = gray > threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
  
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : imageUrl), 'image/jpeg', 0.9);
  });
};

/**
 * Main processing function used by the UI.
 * Connects the 'filter' enum to the low-level functions.
 */
export const applyImageProcessing = async (
  imageUrl: string,
  filter: 'original' | 'grayscale' | 'bw' | 'magic',
  rotation: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No canvas context");

      // Handle Rotation Dimensions
      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      // Rotate
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      // Get Data for Filters
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Apply Filters Pixel-wise
      if (filter === 'grayscale') {
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
      } else if (filter === 'bw') {
         for (let i = 0; i < data.length; i += 4) {
           const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
           const val = gray > 128 ? 255 : 0;
           data[i] = val;
           data[i + 1] = val;
           data[i + 2] = val;
         }
         ctx.putImageData(imageData, 0, 0);
      } else if (filter === 'magic') {
         // High Contrast + Slight Brightness boost
         const contrast = 1.3;
         const brightness = 15;
         for (let i = 0; i < data.length; i += 4) {
           const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
           const val = contrast * (gray - 128) + 128 + brightness;
           const clamped = Math.max(0, Math.min(255, val));
           data[i] = clamped;
           data[i + 1] = clamped;
           data[i + 2] = clamped;
         }
         ctx.putImageData(imageData, 0, 0);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject("Canvas export failed");
        }
      }, 'image/jpeg', 0.9);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};

export const createThumbnail = async (imageUrl: string): Promise<string> => {
   const img = await loadImage(imageUrl);
   const canvas = document.createElement('canvas');
   const MAX = 300;
   let w = img.width; 
   let h = img.height;
   if(w > h) { if(w > MAX) { h *= MAX/w; w = MAX; }}
   else { if(h > MAX) { w *= MAX/h; h = MAX; }}
   
   canvas.width = w;
   canvas.height = h;
   canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
   return canvas.toDataURL('image/jpeg', 0.7);
};

// Legacy crop (Rectangular) - kept for backward compatibility if needed
export const cropImage = async (
    imageUrl: string,
    crop: { x: number, y: number, width: number, height: number }
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = crop.width;
        canvas.height = crop.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject("No context");
  
        ctx.drawImage(
          img,
          crop.x, crop.y, crop.width, crop.height, 
          0, 0, crop.width, crop.height 
        );
  
        canvas.toBlob((blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject("Crop failed");
        }, 'image/jpeg', 0.95);
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  };
