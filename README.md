# CamScannerX

**The Intelligent Document Scanner for the Web**

CamScannerX is a responsive, mobile-first web application that turns your device into a powerful document scanner. It features auto-cropping, image enhancement filters, AI-powered OCR (Optical Character Recognition), and a suite of PDF tools.

## Features

- **Smart Capture**: Camera integration with auto-focus and flash support.
- **Intelligent Editing**: Auto-perspective correction (dewarping), brightness/contrast adjustment, and B&W/Grayscale filters.
- **Hybrid OCR**: Extract text from images using server-side processing for accuracy or client-side fallback for privacy/offline use.
- **PDF Tools**: Merge multiple PDFs, split documents by page range, and compress files.
- **Privacy Focused**: Image processing happens locally in the browser whenever possible.

## Project Structure

- **Frontend**: React 19, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Express, Multer (file uploads), Tesseract.js (OCR), PDF-lib.
- **Services**:
  - `imageUtils.ts`: Canvas-based image processing (Homography, filters).
  - `ocrService.ts`: Hybrid OCR logic.
  - `pdfService.ts`: Client-side PDF generation (jsPDF).
  - `geminiService.ts`: AI powered smart titling.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Start Development Server**
    This command runs both the backend API and the frontend Vite server concurrently.
    ```bash
    npm start
    ```

3.  **Access the App**
    Open `http://localhost:5173` in your browser.
    The backend API runs on `http://localhost:3001`.

## Deployment

### Docker

A Dockerfile is provided for containerized deployment.

1.  **Build the Image**
    ```bash
    docker build -t camscannerx .
    ```

2.  **Run the Container**
    ```bash
    docker run -p 3000:3000 -e PORT=3000 camscannerx
    ```

### Manual Build

1.  **Build Frontend**
    ```bash
    npm run build
    ```
    This generates static files in the `dist/` directory.

2.  **Serve**
    Set up your Node.js server to serve the static files from `dist/` along with the API routes.

## Marketing Copy

**Short Description:**
Turn your device into a powerful scanner with AI-enhanced clarity. Capture, crop, and extract text from documents instantly, all while keeping your data secure with offline-first processing.

**Long Description:**
Say goodbye to bulky hardware and hello to CamScannerX, the privacy-focused document tool built for the modern web. Whether you're digitizing receipts, saving contracts, or capturing whiteboard notes, CamScannerX transforms your mobile device or laptop into a powerful production studio. Our intelligent edge detection and auto-enhancement filters ensure your scans look crisp and professional every time.

We believe your data belongs to you. That's why CamScannerX offers a robust offline mode, processing your crop and filter edits locally to ensure lightning-fast performance and total privacy. Need to extract text? Our advanced hybrid OCR runs directly in your browser for quick tasks or utilizes our secure server for heavy-duty extraction.

Productivity doesn't stop at scanning. With a full suite of PDF tools built right in, you can merge reports into a single file, split large documents, and compress files for easy sharing—all without leaving the app. Accessible from any browser and fully responsive, CamScannerX is the lightweight, versatile tool that keeps your paperwork moving.