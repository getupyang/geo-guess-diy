import { GoogleGenAI, Type } from "@google/genai";
import { LatLng } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeImageLocation = async (base64Image: string): Promise<{ location: LatLng | null; reasoning: string }> => {
  try {
    // Remove header if present (data:image/jpeg;base64,)
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64
            }
          },
          {
            text: "Analyze this image and guess its geographic location (latitude and longitude). Look for street signs, vegetation, architecture, license plates, and other visual clues. Provide the estimated coordinates and a brief reasoning."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            latitude: { type: Type.NUMBER },
            longitude: { type: Type.NUMBER },
            reasoning: { type: Type.STRING },
          },
          required: ["latitude", "longitude", "reasoning"]
        }
      }
    });

    const json = JSON.parse(response.text || "{}");
    
    if (json.latitude && json.longitude) {
      return {
        location: { lat: json.latitude, lng: json.longitude },
        reasoning: json.reasoning || "AI identified potential landmarks."
      };
    }
    
    return { location: null, reasoning: "Could not identify location." };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { location: null, reasoning: "Error connecting to AI service." };
  }
};
