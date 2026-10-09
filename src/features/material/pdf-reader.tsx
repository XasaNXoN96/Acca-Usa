"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> };
type PdfPage = { getViewport(o: { scale: number }): { width: number; height: number }; render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void>; cancel(): void } };

/**
 * Controlled, page-by-page PDF reader (pdf.js) for protected material: no browser PDF toolbar, so no download / print /
 * "open original" buttons; pages are drawn on a canvas with the personal watermark burnt into every page. The bytes come
 * from /api/files/[id] after the server's access checks. This is a deterrent, not DRM — a determined user can still
 * capture the screen or the network response (docs/MEDIA.md, docs/SECURITY_AUDIT.md).
 */
export function PdfReader({ id, title, watermark }: { id: string; title: string; watermark: string | null }) {
  const t = useTranslations("material.pdf");
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const doc = useRef<PdfDoc | null>(null);
  const task = useRef<{ cancel(): void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const loaded = (await pdfjs.getDocument({ url: `/api/files/${encodeURIComponent(id)}`, withCredentials: true }).promise) as unknown as PdfDoc;
        if (cancelled) return void loaded.destroy();
        doc.current = loaded;
        setPages(loaded.numPages);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      task.current?.cancel();
      void doc.current?.destroy();
      doc.current = null;
    };
  }, [id]);

  const draw = useCallback(async () => {
    const d = doc.current; const c = canvas.current; const box = holder.current;
    if (!d || !c || !box) return;
    const p = await d.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const fit = Math.min(Math.max(box.clientWidth - 2, 200) / base.width, 2.2);
    const scale = fit * zoom;
    const ratio = window.devicePixelRatio || 1;
    const vp = p.getViewport({ scale: scale * ratio });
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    c.style.width = `${Math.floor(vp.width / ratio)}px`; c.style.height = `${Math.floor(vp.height / ratio)}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    task.current?.cancel();
    const t0 = p.render({ canvasContext: ctx, viewport: vp });
    task.current = t0;
    try { await t0.promise; } catch { return; } // a newer render replaced this one
    if (watermark) {
      ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = "#0f1d3a"; ctx.font = `600 ${Math.round(18 * ratio)}px sans-serif`; ctx.rotate(-Math.PI / 7);
      for (let y = -c.height; y < c.height * 1.4; y += 150 * ratio) for (let x = -c.width; x < c.width * 1.4; x += 330 * ratio) ctx.fillText(watermark, x + ((y / (150 * ratio)) % 2) * 120 * ratio, y);
      ctx.restore();
    }
  }, [page, zoom, watermark]);

  useEffect(() => { if (state === "ready") void draw(); }, [state, draw]);
  // Notes jump to a page through this event (see NotesPanel).
  useEffect(() => {
    const goto = (e: Event) => setPage((p) => Math.min(Math.max(Number((e as CustomEvent<number>).detail) || p, 1), pages || 1));
    window.addEventListener("acca:pdf-goto", goto);
    return () => window.removeEventListener("acca:pdf-goto", goto);
  }, [pages]);
  useEffect(() => {
    const box = holder.current; if (!box || state !== "ready") return;
    const ro = new ResizeObserver(() => void draw()); ro.observe(box);
    return () => ro.disconnect();
  }, [state, draw]);

  const go = (n: number) => setPage(Math.min(Math.max(n, 1), pages || 1));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(page + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(page - 1); }
  };

  if (state === "error") return <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">{t("error")}</p>;
  return (
    <div className="space-y-3" data-protected data-pdf-reader data-src={`/api/files/${encodeURIComponent(id)}`} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t("toolbar")}>
        <Button type="button" variant="outline" size="icon" aria-label={t("previous")} disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft aria-hidden /></Button>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">{t("page")}</span>
          <input
            type="number" min={1} max={pages || 1} value={page} onChange={(e) => go(Number(e.target.value) || 1)}
            className="h-10 w-16 rounded-lg border border-input bg-background px-2 text-center tabular-nums"
          />
          <span className="text-muted-foreground" aria-hidden>/ {pages || "—"}</span>
          <span className="sr-only">{t("of", { total: pages })}</span>
        </label>
        <Button type="button" variant="outline" size="icon" aria-label={t("next")} disabled={page >= pages} onClick={() => go(page + 1)}><ChevronRight aria-hidden /></Button>
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
        <Button type="button" variant="outline" size="icon" aria-label={t("zoomOut")} disabled={zoom <= 0.6} onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}><Minus aria-hidden /></Button>
        <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <Button type="button" variant="outline" size="icon" aria-label={t("zoomIn")} disabled={zoom >= 2.4} onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))}><Plus aria-hidden /></Button>
      </div>
      <div
        ref={holder} data-page={page} tabIndex={0} onKeyDown={onKey} role="document" aria-label={`${title} — ${t("pageOf", { page, total: pages })}`}
        className="relative max-h-[78dvh] min-h-[20rem] overflow-auto rounded-xl border border-border bg-muted p-1 focus-visible:outline-2"
      >
        {state === "loading" ? <Skeleton className="absolute inset-1 rounded-lg" /> : null}
        <canvas ref={canvas} className="mx-auto block max-w-none select-none bg-white" aria-hidden />
      </div>
      <p className="type-small text-muted-foreground">{t("viewOnly")}</p>
    </div>
  );
}
