import { GoogleGenAI, Type } from "@google/genai";
import { LatLng } from "../types";

export const analyzeImageLocation = async (base64Image: string): Promise<{ location: LatLng | null; reasoning: string }> => {
  try {
    // Initialize inside the function to ensure process.env is ready and avoid top-level crashes in some builds
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
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
            text: "Analyze this image and guess its geographic location (latitude and longitude). Look for street signs, vegetation, architecture, license plates, and other visual clues. Provide the estimated coordinates and a brief reasoning in Chinese."
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
        reasoning: json.reasoning || "AI 识别到了一些潜在的地标。"
      };
    }
    
    return { location: null, reasoning: "AI 无法从图片中提取足够的位置信息。" };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { location: null, reasoning: "连接 AI 服务失败，请检查网络或 API Key。" };
  }
};