import { Point } from '../types';

declare const cv: any;

export const isOpenCvReady = (): boolean => {
  return typeof cv !== 'undefined' && cv.Mat;
};

/**
 * Detects document corners from a video element.
 * Returns normalized points (0-100 percentage) if a document is found.
 */
export const findDocumentCorners = (video: HTMLVideoElement): Point[] | null => {
  if (!isOpenCvReady()) return null;

  try {
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    // Performance: Process a smaller image
    const scale = 0.2; // Downscale factor
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    // Create Mats
    let src = new cv.Mat(height, width, cv.CV_8UC4);
    let dst = new cv.Mat(h, w, cv.CV_8UC1);
    let cap = new cv.VideoCapture(video);
    
    cap.read(src);
    
    // Pre-processing
    cv.resize(src, dst, new cv.Size(w, h));
    cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(dst, dst, new cv.Size(5, 5), 0);
    cv.Canny(dst, dst, 75, 200);

    // Find Contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestContour = null;

    // Find largest quadrilateral
    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);
      
      if (area > 1000) { // Minimum area filter
        let peri = cv.arcLength(cnt, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        
        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          bestContour = approx; // Keep reference to Mat
        } else {
            approx.delete();
        }
      }
    }

    let points: Point[] | null = null;

    if (bestContour) {
      // Extract points and scale back up
      const data = bestContour.data32S; // Int32Array
      const rawPoints = [
        { x: data[0], y: data[1] },
        { x: data[2], y: data[3] },
        { x: data[4], y: data[5] },
        { x: data[6], y: data[7] }
      ];

      // Sort corners: TL, TR, BR, BL
      // We do this by sum (x+y) and diff (y-x)
      // TL: min(sum), BR: max(sum)
      // TR: min(diff), BL: max(diff)
      // However, we need to be careful with coordinate systems.
      // Simple sort:
      rawPoints.sort((a, b) => a.y - b.y); // Sort by Y
      const top = rawPoints.slice(0, 2).sort((a, b) => a.x - b.x); // Top 2 sorted by X
      const bottom = rawPoints.slice(2, 4).sort((a, b) => b.x - a.x); // Bottom 2 sorted by X descending (BR, BL)

      // Order: TL, TR, BR, BL
      const ordered = [top[0], top[1], bottom[0], bottom[1]];

      // Normalize to percentage
      points = ordered.map(p => ({
        x: (p.x / w) * 100,
        y: (p.y / h) * 100
      }));

      bestContour.delete();
    }

    // Cleanup
    src.delete();
    dst.delete();
    contours.delete();
    hierarchy.delete();

    return points;
  } catch (e) {
    console.error("OpenCV processing error:", e);
    return null;
  }
};