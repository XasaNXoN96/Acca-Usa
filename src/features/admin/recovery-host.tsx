"use client";

import { createContext, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const Ctx = createContext<(codes: string[]) => void>(() => {});
export const useShowRecoveryCodes = () => useContext(Ctx);

/**
 * Lives in the admin layout so the one-time recovery codes SURVIVE the router refresh that follows the re-issued session
 * cookie (the enrolment screen itself disappears the moment MFA turns on). Held only in memory; gone on reload or "continue".
 */
export function RecoveryHost({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.security");
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <Ctx.Provider value={setCodes}>
      {codes ? (
        <section role="status" aria-labelledby="recovery-title" className="mb-6 space-y-3 rounded-xl border border-border bg-card p-5">
          <Alert variant="success">{t("confirmed")}</Alert>
          <h2 id="recovery-title" className="type-h3">{t("recoveryTitle")}</h2>
          <p className="type-small text-muted-foreground">{t("recoveryText")}</p>
          <ul className="type-small grid grid-cols-2 gap-2 font-mono" data-testid="recovery-codes">
            {codes.map((c) => <li key={c} className="rounded bg-muted px-2 py-1">{c}</li>)}
          </ul>
          <Button onClick={() => setCodes(null)}>{t("savedContinue")}</Button>
        </section>
      ) : null}
      {children}
    </Ctx.Provider>
  );
}
