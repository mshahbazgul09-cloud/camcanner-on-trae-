
import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found. Please set the API Key.");
  }
  return new GoogleGenAI({ apiKey });
};

// Convert Blob URL to base64
const blobUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data:image/jpeg;base64, prefix
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const performOCR = async (imageUrl: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = await blobUrlToBase64(imageUrl);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "Extract all visible text from this document image. Preserve the structure as much as possible. Return only the text."
          }
        ]
      }
    });

    return response.text || "No text detected.";
  } catch (error) {
    console.error("OCR Error:", error);
    throw error;
  }
};

export const generateSmartTitle = async (imageUrl: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = await blobUrlToBase64(imageUrl);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "Analyze this image. Suggest a short, concise filename (max 5 words) based on its content (e.g., 'Walmart Receipt', 'Rental Contract', 'Business Card - John Doe'). Return ONLY the title, no quotes."
          }
        ]
      }
    });

    return response.text?.trim() || "Scanned Document";
  } catch (error) {
    console.warn("Smart Title Error:", error);
    return "Scanned Document";
  }
};

export const analyzeDocumentType = async (imageUrl: string): Promise<string> => {
    try {
      const ai = getAiClient();
      const base64Data = await blobUrlToBase64(imageUrl);
  
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data
              }
            },
            {
              text: "Identify the type of document (e.g., Receipt, Invoice, ID Card, Handwritten Note, Whiteboard). Return just the type."
            }
          ]
        }
      });
  
      return response.text?.trim() || "Unknown";
    } catch (error) {
      console.warn("Analysis Error:", error);
      return "Unknown";
    }
  };

export const solveMathProblem = async (imageUrl: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const base64Data = await blobUrlToBase64(imageUrl);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: "Solve this math problem. 1. State the problem clearly. 2. Show the step-by-step solution. 3. Provide the final answer."
          }
        ]
      }
    });

    return response.text || "Could not solve the problem.";
  } catch (error) {
    console.error("Math Solver Error:", error);
    throw error;
  }
};
