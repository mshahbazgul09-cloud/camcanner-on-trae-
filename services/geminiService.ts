
// AI Service - Using OpenAI GPT-4o Vision API

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const getApiKey = (): string => {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API Key not found. Please set OPENAI_API_KEY in your .env file.");
  }
  return OPENAI_API_KEY;
};

// Convert Blob URL to base64 data URL
const blobUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Generic OpenAI Vision API call
const callOpenAI = async (base64DataUrl: string, prompt: string): Promise<string> => {
  const apiKey = getApiKey();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: base64DataUrl,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("OpenAI API Error:", errorData);
    throw new Error(`OpenAI API Error: ${response.status} - ${errorData?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

export const performOCR = async (imageUrl: string): Promise<string> => {
  try {
    const base64DataUrl = await blobUrlToBase64(imageUrl);
    const text = await callOpenAI(
      base64DataUrl,
      "Extract all visible text from this document image. Preserve the structure as much as possible. Return only the extracted text, no commentary."
    );
    return text || "No text detected.";
  } catch (error) {
    console.error("OCR Error:", error);
    throw error;
  }
};

export const generateSmartTitle = async (imageUrl: string): Promise<string> => {
  try {
    const base64DataUrl = await blobUrlToBase64(imageUrl);
    const title = await callOpenAI(
      base64DataUrl,
      "Analyze this image. Suggest a short, concise filename (max 5 words) based on its content (e.g., 'Walmart Receipt', 'Rental Contract', 'Business Card - John Doe'). Return ONLY the title, no quotes, no extra text."
    );
    return title?.trim() || "Scanned Document";
  } catch (error) {
    console.warn("Smart Title Error:", error);
    return "Scanned Document";
  }
};

export const analyzeDocumentType = async (imageUrl: string): Promise<string> => {
  try {
    const base64DataUrl = await blobUrlToBase64(imageUrl);
    const docType = await callOpenAI(
      base64DataUrl,
      "Identify the type of document (e.g., Receipt, Invoice, ID Card, Handwritten Note, Whiteboard). Return just the type, nothing else."
    );
    return docType?.trim() || "Unknown";
  } catch (error) {
    console.warn("Analysis Error:", error);
    return "Unknown";
  }
};

export const solveMathProblem = async (imageUrl: string): Promise<string> => {
  try {
    const base64DataUrl = await blobUrlToBase64(imageUrl);
    const solution = await callOpenAI(
      base64DataUrl,
      "Solve this math problem. 1. State the problem clearly. 2. Show the step-by-step solution. 3. Provide the final answer."
    );
    return solution || "Could not solve the problem.";
  } catch (error) {
    console.error("Math Solver Error:", error);
    throw error;
  }
};
