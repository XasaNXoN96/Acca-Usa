"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Option } from "./record-form";

const tone = { easy: "success", medium: "warning", hard: "destructive" } as const;

/**
 * Test-builder question list: ordered selection (move up / down / remove) plus a searchable picker dialog over the
 * published questions of the chosen subject. The order of the value IS the order of the test.
 */
export function QuestionPicker({ id, label, required, hint, error, options, value, onChange }: {
  id: string; label: string; required?: boolean; hint?: string; error?: string; options: Option[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const t = useTranslations("admin.picker");
  const d = useTranslations("admin.difficulty");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [topic, setTopic] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  const byId = useMemo(() => new Map(options.map((o) => [o.id ?? o.value, o])), [options]);
  const selected = value.map((v) => byId.get(v)).filter((o): o is Option => !!o);
  const points = selected.reduce((s, o) => s + (o.meta?.points ?? 0), 0);
  const topics = useMemo(() => [...new Set(options.map((o) => o.meta?.topic).filter((x): x is string => !!x))], [options]);

  const available = options.filter((o) => {
    if (value.includes(o.value)) return false;
    const m = o.meta;
    if (difficulty && m?.difficulty !== difficulty) return false;
    if (topic && m?.topic !== topic) return false;
    const q = query.trim().toLowerCase();
    return !q || `${m?.text ?? o.label} ${m?.tags ?? ""}`.toLowerCase().includes(q);
  });

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const openPicker = () => { setChosen([]); setQuery(""); setDifficulty(""); setTopic(""); setOpen(true); };

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <div id={id} role="group" aria-label={label} aria-describedby={error ? `${id}-error` : undefined} className={cn("space-y-3 rounded-lg border bg-background p-3", error ? "border-destructive" : "border-input")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="type-small font-semibold" aria-live="polite">{t("total", { count: selected.length, points })}</p>
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={options.length === 0}><Plus aria-hidden />{t("add")}</Button>
        </div>
        {options.length === 0 ? <p className="type-small text-muted-foreground">{t("noneForSubject")}</p> : null}
        {selected.length === 0 && options.length > 0 ? <p className="type-small text-muted-foreground">{t("empty")}</p> : null}
        <ol className="space-y-1.5">
          {selected.map((o, i) => (
            <li key={o.value} data-picked-question="" className="flex items-start gap-2 rounded-lg border border-border bg-card p-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs font-bold tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                <span className="line-clamp-2">{o.meta?.text ?? o.label}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {o.meta ? <Badge variant={tone[o.meta.difficulty as keyof typeof tone]}>{d(o.meta.difficulty as "easy")}</Badge> : null}
                  <span className="type-caption text-muted-foreground">{t("points", { points: o.meta?.points ?? 0 })}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" aria-label={`${t("moveUp")}: ${i + 1}`} onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`${t("moveDown")}: ${i + 1}`} onClick={() => move(i, 1)} disabled={i === selected.length - 1}><ArrowDown className="size-4" aria-hidden /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`${t("remove")}: ${i + 1}`} onClick={() => onChange(value.filter((x) => x !== o.value))}><Trash2 className="size-4 text-destructive" aria-hidden /></Button>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("addTitle")}</DialogTitle>
            <DialogDescription>{t("addText")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="qp-search" className="sr-only">{t("search")}</label>
            <Input id="qp-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} />
            <label htmlFor="qp-difficulty" className="sr-only">{t("difficulty")}</label>
            <Select id="qp-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="sm:w-40">
              <option value="">{t("difficulty")}: {t("all")}</option>
              {(["easy", "medium", "hard"] as const).map((x) => <option key={x} value={x}>{d(x)}</option>)}
            </Select>
            {topics.length ? (
              <>
                <label htmlFor="qp-topic" className="sr-only">{t("topic")}</label>
                <Select id="qp-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="sm:w-48">
                  <option value="">{t("topic")}: {t("all")}</option>
                  {topics.map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
              </>
            ) : null}
          </div>
          <ul className="max-h-[50dvh] space-y-1 overflow-y-auto" aria-label={t("addTitle")}>
            {available.length === 0 ? <li className="type-small p-3 text-muted-foreground">{t("nothingToAdd")}</li> : null}
            {available.map((o) => (
              <li key={o.value}>
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                  <Checkbox checked={chosen.includes(o.value)} onCheckedChange={() => setChosen((c) => (c.includes(o.value) ? c.filter((x) => x !== o.value) : [...c, o.value]))} className="mt-0.5" />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="line-clamp-2">{o.meta?.text ?? o.label}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {o.meta ? <Badge variant={tone[o.meta.difficulty as keyof typeof tone]}>{d(o.meta.difficulty as "easy")}</Badge> : null}
                      <span className="type-caption text-muted-foreground">{t("points", { points: o.meta?.points ?? 0 })}</span>
                      {o.meta?.topic ? <span className="type-caption text-muted-foreground">· {o.meta.topic}</span> : null}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="button" disabled={chosen.length === 0} onClick={() => { onChange([...value, ...chosen]); setOpen(false); }}>{t("addSelected", { count: chosen.length })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}
