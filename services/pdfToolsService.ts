
/**
 * Service for interacting with Server-side PDF Tools.
 * Each function returns a Blob URL that can be used to display or download the file.
 */

const API_BASE = '/api/pdf';

export const mergePdfs = async (files: File[]): Promise<string> => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));

  const response = await fetch(`${API_BASE}/merge`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error('Failed to merge PDFs');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const splitPdf = async (file: File, range: string): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('range', range); // Format example: "1-3, 5"

  const response = await fetch(`${API_BASE}/split`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error('Failed to split PDF');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

export const compressPdf = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/compress`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) throw new Error('Failed to compress PDF');
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

/**
 * Helper to trigger a download for the resulting Blob URL
 */
export const downloadBlobUrl = (url: string, filename: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url); // Cleanup
};
