// Renders a PDF with pdf.js and overlays highlights on text that matches any of
// the given terms (computed from the text-content positions, so it works without
// the fragile text-layer). Scrolls to the first match. Used to evidence-link a
// flagged reference to where it appears in the paper.

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a hashed URL for the pdf.js worker.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Safari doesn't implement async iteration on ReadableStream, which pdf.js uses
// internally (e.g. getTextContent) → "undefined is not a function (near
// '...value of readableStream...')". Polyfill it from the reader.
(() => {
  const proto: any = typeof ReadableStream !== "undefined" ? ReadableStream.prototype : null;
  if (proto && !proto[Symbol.asyncIterator]) {
    proto[Symbol.asyncIterator] = function () {
      const reader = this.getReader();
      return {
        next() { return reader.read(); },
        return() { try { reader.releaseLock(); } catch { /* noop */ } return Promise.resolve({ done: true, value: undefined }); },
        [Symbol.asyncIterator]() { return this; },
      };
    };
    if (!proto.values) proto.values = function () { return this[Symbol.asyncIterator](); };
  }
})();

export function PdfHighlightViewer({ url, terms, scale = 1.35 }: { url: string; terms: string[]; scale?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState("");
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    setStatus("loading"); setErr(""); setMatchCount(0);
    const lowTerms = terms.map((t) => (t || "").toLowerCase().trim()).filter((t) => t.length >= 3);

    (async () => {
      let matches = 0;
      try {
        // Fetch the bytes ourselves and pass an in-memory buffer — pdf.js's
        // URL/stream path uses ReadableStream async iteration, which Safari
        // doesn't support ("...value of readableStream...").
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Could not load PDF (${resp.status})`);
        const data = new Uint8Array(await resp.arrayBuffer());
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        let firstHl: HTMLElement | null = null;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale });
          const pageDiv = document.createElement("div");
          pageDiv.style.cssText = `position:relative;margin:0 auto 12px;width:${viewport.width}px;height:${viewport.height}px;box-shadow:0 1px 4px rgba(0,0,0,.15)`;
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height; canvas.style.display = "block";
          pageDiv.appendChild(canvas);
          container.appendChild(pageDiv);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelled) return;

          if (lowTerms.length) {
            try {
              const tc = await page.getTextContent();
              for (const item of tc.items as any[]) {
                const str = (item.str || "").toLowerCase();
                if (str.length < 2 || !lowTerms.some((t) => str.includes(t))) continue;
                const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
                const fontH = Math.hypot(m[2], m[3]) || 10;
                const w = (item.width || 0) * scale || item.str.length * fontH * 0.5;
                const hl = document.createElement("div");
                hl.style.cssText = `position:absolute;left:${m[4]}px;top:${m[5] - fontH}px;width:${w}px;height:${fontH * 1.25}px;background:rgba(250,204,21,.45);border-radius:2px;pointer-events:none`;
                pageDiv.appendChild(hl);
                matches++;
                if (!firstHl) firstHl = hl;
              }
            } catch { /* text extraction failed on this page — keep rendering */ }
          }
        }
        if (cancelled) return;
        setMatchCount(matches);
        setStatus("ready");
        if (firstHl) setTimeout(() => firstHl!.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
      } catch (e: any) {
        if (!cancelled) { setErr(e?.message || "Failed to render PDF"); setStatus("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [url, terms.join("|"), scale]);

  return (
    <div className="space-y-2">
      {status === "loading" && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Rendering PDF…</div>}
      {status === "error" && <div className="text-sm text-red-600">Couldn't render PDF: {err}</div>}
      {status === "ready" && (
        <div className="text-xs text-muted-foreground">
          {matchCount > 0 ? `${matchCount} highlighted match${matchCount === 1 ? "" : "es"} — scrolled to the first.` : "No matching text found to highlight in the PDF."}
        </div>
      )}
      <div ref={containerRef} className="overflow-auto max-h-[72vh] bg-muted/30 rounded p-2" />
    </div>
  );
}
