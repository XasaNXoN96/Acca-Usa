"use client";

import { useEffect, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { beginTelegramLinkAction, sendTelegramTestAction, telegramStateAction, unlinkTelegramAction, type TelegramLinkState } from "./security-actions";

/** Admin → Security: connect a Telegram chat as a second factor (next to the authenticator app). */
export function TelegramCard() {
  const t = useTranslations("admin.security.telegram");
  const [state, setState] = useState<TelegramLinkState | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => telegramStateAction().then(setState);
  useEffect(() => { void refresh(); }, []);
  // After "Connect": the bot answers when the administrator opens the link and presses Start — poll until it shows up.
  useEffect(() => {
    if (!link || state?.linked) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [link, state?.linked]);

  if (!state) return null;
  const shownLink = state.linked ? null : link; // once the bot confirmed, the pending link is no longer shown
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5" aria-labelledby="tg-title" data-telegram-card>
      <h2 id="tg-title" className="type-h3">{t("title")}</h2>
      <p className="type-small text-muted-foreground">{t("description")}</p>
      {!state.configured ? <Alert variant="info">{t("notConfigured")}</Alert> : state.linked ? (
        <div className="space-y-3">
          <Alert variant="success">{state.username ? t("connectedAs", { name: `@${state.username}` }) : t("connected")}</Alert>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" loading={pending} onClick={() => start(async () => { const r = await sendTelegramTestAction(); setNote(r.ok ? t("testSent") : r.code === "RATE_LIMITED" ? t("limited") : t("testFailed")); })}><Send aria-hidden />{t("test")}</Button>
            <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => start(async () => { await unlinkTelegramAction(); setNote(t("removed")); await refresh(); })}>{t("disconnect")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button type="button" loading={pending} onClick={() => start(async () => {
            const r = await beginTelegramLinkAction();
            if (r.ok) { setLink(r.url); setNote(null); window.open(r.url, "_blank", "noopener,noreferrer"); } else setNote(r.code === "RATE_LIMITED" ? t("limited") : t("linkFailed"));
          })}><Send aria-hidden />{t("connect")}</Button>
          {shownLink ? (
            <div className="space-y-1" aria-live="polite">
              <p className="type-small">{t("openAndStart")}</p>
              <a href={shownLink} target="_blank" rel="noopener noreferrer" className="type-small break-all font-semibold text-primary underline-offset-2 hover:underline">{shownLink.replace(/\?start=.*/, "")}</a>
              <p className="type-caption text-muted-foreground">{t("waiting")}</p>
            </div>
          ) : null}
        </div>
      )}
      {note ? <p role="status" className="type-caption text-muted-foreground">{note}</p> : null}
    </section>
  );
}
