import type { Locale } from "@/types";
import type { TranscriptSegment } from "../contracts";

/**
 * Speech-to-text. There is NO demo implementation on purpose: a transcript is either produced by a real provider or
 * written by an administrator (provider "manual"). Without configuration the feature reports NOT CONNECTED.
 */
export interface SpeechToTextProvider {
  readonly name: string;
  /** audio = path of a temp file (mono mp3) prepared by the pipeline */
  transcribe(input: { audioPath: string; language: Locale }): Promise<TranscriptSegment[]>;
}

export type SttFailure = "STT_REQUEST_FAILED" | "STT_BAD_RESPONSE" | "STT_TIMEOUT";
export class SttError extends Error {
  constructor(readonly code: SttFailure) { super(code); }
}
