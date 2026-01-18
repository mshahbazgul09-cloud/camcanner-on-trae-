
export interface ScannedPage {
  id: string;
  originalUrl: string; // Blob URL
  processedUrl: string; // Blob URL after filters/crop
  filter: 'original' | 'grayscale' | 'bw' | 'magic';
  rotation: number; // 0, 90, 180, 270
  ocrText?: string;
  ocrConfidence?: number;
}

export interface ScannedDoc {
  id: string;
  title: string;
  createdAt: number;
  pages: ScannedPage[];
  thumbnailUrl?: string;
}

export interface User {
  id: string;
  email: string;
}

export enum AppView {
  HOME = 'HOME',
  FILES = 'FILES',
  CAMERA = 'CAMERA',
  EDIT_DOC = 'EDIT_DOC',
  PAGE_DETAIL = 'PAGE_DETAIL',
  TOOLS = 'TOOLS',
  SETTINGS = 'SETTINGS'
}

export interface ProcessingOptions {
  autoCrop: boolean;
  enhance: boolean;
}

export interface Point {
  x: number;
  y: number;
}
