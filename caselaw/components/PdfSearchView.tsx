"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// PDF.js worker (version-matched, served from CDN).
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface PdfSearchViewProps {
  url: string;
  searchTerm: string;
}

/**
 * Renders a PDF with PDF.js (react-pdf), highlights every occurrence of
 * `searchTerm` and auto-scrolls to the first match once it is rendered.
 */
export default function PdfSearchView({ url, searchTerm }: PdfSearchViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(800);
  const scrolledRef = useRef(false);

  // Reset the "already scrolled" flag whenever the document or term changes.
  useEffect(() => {
    scrolledRef.current = false;
  }, [url, searchTerm]);

  // Keep the page width in sync with the available container width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setPageWidth(Math.min(el.clientWidth - 32, 1000));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build a single case-insensitive pattern that matches any of the search
  // tokens (the term may contain several space-separated keywords).
  const pattern = useMemo(() => {
    const tokens = searchTerm
      .trim()
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .map(escapeRegExp);
    if (tokens.length === 0) return null;
    return new RegExp(`(${tokens.join('|')})`, 'gi');
  }, [searchTerm]);

  // Wrap matches in <mark> inside the (transparent) text layer.
  const textRenderer = useCallback(
    (textItem: { str: string }): string => {
      if (!pattern) return textItem.str;
      pattern.lastIndex = 0;
      return textItem.str.replace(pattern, '<mark class="pdf-search-hl">$1</mark>');
    },
    [pattern],
  );

  // After a page's text layer renders, jump to the first highlighted match.
  const scrollToFirstMatch = useCallback(() => {
    if (scrolledRef.current) return;
    const mark = containerRef.current?.querySelector('mark.pdf-search-hl');
    if (mark) {
      scrolledRef.current = true;
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto bg-[#525659] flex flex-col items-center gap-4 py-4"
    >
      <Document
        file={url}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={
          <div className="flex flex-col items-center justify-center text-gray-200 gap-3 py-20">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
            <span className="text-sm">Φόρτωση εγγράφου…</span>
          </div>
        }
        error={
          <div className="flex flex-col items-center justify-center text-gray-200 gap-3 py-20 px-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <span className="text-sm">Αποτυχία φόρτωσης του PDF</span>
          </div>
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={pageWidth}
            customTextRenderer={textRenderer}
            onRenderTextLayerSuccess={scrollToFirstMatch}
            renderAnnotationLayer={false}
            className="shadow-lg"
          />
        ))}
      </Document>

      <style>{`
        /* Keep the matched text itself transparent (the real glyphs come from
           the canvas underneath) and show only a translucent highlight, so the
           words are not re-drawn in yellow on top of the page. */
        .pdf-search-hl {
          color: transparent !important;
          background-color: rgba(250, 204, 21, 0.4);
          border-radius: 2px;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
