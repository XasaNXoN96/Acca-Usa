"use client";

/**
 * Last-resort boundary: it replaces the ROOT layout, so no providers (next-intl, theme) exist here. The language is read from
 * the locale cookie; the text is static and the page shows only the opaque error digest — never a message or a stack trace.
 */
const text = {
  en: { title: "Something went wrong", body: "An unexpected error occurred. You can try again.", retry: "Try again" },
  ru: { title: "Что-то пошло не так", body: "Произошла непредвиденная ошибка. Попробуйте ещё раз.", retry: "Повторить" },
  uz: { title: "Xatolik yuz berdi", body: "Kutilmagan xatolik yuz berdi. Qayta urinib ko‘ring.", retry: "Qayta urinish" },
} as const;

function currentLocale(): keyof typeof text {
  const m = typeof document !== "undefined" ? /(?:^|; )NEXT_LOCALE=(en|ru|uz)/.exec(document.cookie) : null;
  return (m?.[1] as keyof typeof text | undefined) ?? "en";
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = currentLocale();
  const t = text[locale];
  return (
    <html lang={locale}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#ffffff", color: "#0f1d3a" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 440 }}>
            <p style={{ fontWeight: 800, fontSize: 22, margin: "0 0 16px" }}>ACCA <span style={{ color: "#c8102e" }}>USA</span></p>
            <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>{t.title}</h1>
            <p style={{ margin: "0 0 20px", color: "#4b5a78" }}>{t.body}</p>
            <button type="button" onClick={reset} style={{ background: "#0f1d3a", color: "#fff", border: 0, borderRadius: 8, padding: "12px 22px", fontSize: 16, fontWeight: 600, cursor: "pointer", minHeight: 44 }}>{t.retry}</button>
            {error.digest ? <p style={{ marginTop: 16, fontSize: 12, color: "#4b5a78" }}>ID: {error.digest}</p> : null}
          </div>
        </main>
      </body>
    </html>
  );
}
