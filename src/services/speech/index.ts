import "server-only";
import type { SpeechToTextProvider } from "./contracts";
import { OpenAiCompatibleStt } from "./openai-compatible";

/** The configured provider, or null = NOT CONNECTED (the UI says so; nothing is simulated). */
export function getSpeechProvider(): SpeechToTextProvider | null {
  if (process.env.STT_PROVIDER !== "openai-compatible") return null;
  const apiKey = process.env.STT_API_KEY;
  if (!apiKey) return null;
  return new OpenAiCompatibleStt({ baseUrl: process.env.STT_API_URL || "https://api.openai.com/v1", apiKey, model: process.env.STT_MODEL || "whisper-1" });
}

export const speechConnected = () => getSpeechProvider() !== null;
export type { SpeechToTextProvider } from "./contracts";
