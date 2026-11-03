"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { importQuestionsAction, type QuestionImportResult } from "./question-import-actions";

const MAX_BYTES = 2 * 1024 * 1024;

export function QuestionImport() {
  const t = useTranslations("admin.questionImport");
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = useState<QuestionImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = t as unknown as (k: string, v?: Record<string, string | number>) => string;

  async function pick(f: File | undefined) {
    setResult(null); setProblem(null); setCsv(null);
    if (!f) return;
    if (f.size > MAX_BYTES) return setProblem(label("errors.TOO_BIG"));
    if (!/\.(csv|txt)$/i.test(f.name)) return setProblem(label("errors.NOT_CSV"));
    const text = await f.text();
    setCsv({ name: f.name, text });
    start(async () => setResult(await importQuestionsAction({ csv: text, dryRun: true })));
  }
  /** Codes are "required", "invalidChoice", "min:10", "max:600", "range:1:100" (form rules) or our own row codes. */
  const rowError = (code: string) => { const base = code.split(":")[0]!; return label(`rowErrors.${base}`) + (code.includes(":") ? ` (${code.split(":").slice(1).join("–")})` : ""); };
  const run = () => csv && start(async () => setResult(await importQuestionsAction({ csv: csv.text, dryRun: false })));
  const ok = result?.ok ? result : null;

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="type-h4">{t("stepsTitle")}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>{t("step1")}</li><li>{t("step2")}</li><li>{t("step3")}</li>
        </ol>
        <p className="type-caption text-muted-foreground">{t("columns")}</p>
        <Button asChild variant="outline" size="sm"><a href="/templates/questions-template.csv" download><Download aria-hidden />{t("template")}</a></Button>
      </section>

      <section className="space-y-3">
        <input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" aria-label={t("choose")} onChange={(e) => void pick(e.target.files?.[0])} />
        <Button type="button" variant="outline" className="w-full justify-center border-dashed py-6" onClick={() => input.current?.click()} loading={pending && !csv}>
          <FileUp aria-hidden />{csv ? csv.name : t("choose")}
        </Button>
        {problem ? <Alert variant="destructive">{problem}</Alert> : null}
        {result && !result.ok ? (
          <Alert variant="destructive">{label(`errors.${result.code}`)}{result.missing?.length ? ` ${result.missing.join(", ")}` : ""}</Alert>
        ) : null}
        {ok ? (
          <div className="space-y-3" aria-live="polite">
            <Alert variant={ok.dryRun ? (ok.errors.length ? "warning" : "info") : "success"}>
              {ok.dryRun
                ? label("checked", { rows: ok.rows, valid: ok.valid, errors: ok.errors.length, duplicates: ok.duplicates.length })
                : label("done", { imported: ok.imported, errors: ok.errors.length })}
            </Alert>
            {ok.errors.length ? (
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left"><tr><th className="p-2">{t("line")}</th><th className="p-2">{t("column")}</th><th className="p-2">{t("problem")}</th></tr></thead>
                  <tbody>
                    {ok.errors.map((e, i) => (
                      <tr key={i} className="border-t border-border"><td className="p-2 tabular-nums">{e.line}</td><td className="p-2">{e.column ?? ""}</td><td className="p-2">{rowError(e.code)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {ok.duplicates.length ? <p className="type-caption text-muted-foreground">{label("duplicates", { lines: ok.duplicates.slice(0, 20).join(", ") })}</p> : null}
            {ok.dryRun && ok.valid > 0 ? <Button type="button" size="lg" loading={pending} onClick={run}>{label("importCta", { valid: ok.valid })}</Button> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
