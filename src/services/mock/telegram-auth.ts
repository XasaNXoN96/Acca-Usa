import "server-only";
import type { TelegramAuthService } from "../contracts";

/** Demo mode has no Telegram: nothing can be linked and no code is ever issued. */
export const telegramAuthService: TelegramAuthService = {
  async status() { return { linked: false }; },
  async beginLink() { return { ok: false, code: "UNAVAILABLE" }; },
  async completeLink() { return { ok: false }; },
  async unlink() { return { ok: false, code: "NOT_FOUND" }; },
  async chatOf() { return null; },
  async issueLoginCode() { return { ok: false, code: "NOT_LINKED" }; },
};
