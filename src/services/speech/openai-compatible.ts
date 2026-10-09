import "server-only";
import { openAsBlob } from "node:fs";
import type { TranscriptSegment } from "../contracts";
import { SttError, type SpeechToTextProvider } from "./contracts";

/**
 * Adapter for any service that implements the OpenAI-style `POST {baseUrl}/audio/transcriptions`
 * (response_format=verbose_json → segments with start / end / text). Configure with STT_API_URL, STT_API_KEY, STT_MODEL.
 * The API key stays on the server and is never logged. Verified against a local fake endpoint only (parsing / errors);
 * NOT verified against a real vendor — see docs/SPEECH_TO_TEXT.md.
 */
export class OpenAiCompatibleStt implements SpeechToTextProvider {
  readonly name = "openai-compatible";
  constructor(private readonly cfg: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number }) {}

  async transcribe({ audioPath, language }: { audioPath: string; language: string }): Promise<TranscriptSegment[]> {
    const form = new FormData();
    form.set("file", new File([await openAsBlob(audioPath)], "audio.mp3", { type: "audio/mpeg" }));
    form.set("model", this.cfg.model);
    form.set("language", language);
    form.set("response_format", "verbose_json");
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
        method: "POST", headers: { Authorization: `Bearer ${this.cfg.apiKey}` }, body: form, signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 10 * 60_000),
      });
    } catch (e) {
      throw new SttError((e as Error).name === "TimeoutError" ? "STT_TIMEOUT" : "STT_REQUEST_FAILED");
    }
    if (!res.ok) throw new SttError("STT_REQUEST_FAILED");
    const j = (await res.json().catch(() => null)) as { segments?: { start?: number; end?: number; text?: string }[] } | null;
    const segments = (j?.segments ?? [])
      .filter((s) => typeof s.start === "number" && typeof s.end === "number" && typeof s.text === "string" && s.text.trim())
      .map((s) => ({ start: s.start!, end: s.end!, text: s.text!.trim() }));
    if (!segments.length) throw new SttError("STT_BAD_RESPONSE");
    return segments;
  }
}
