"use client";

import { X, Download, Loader2, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getFileTypeStyle } from '@/components/FileTypeIcon';

// PDF.js based viewer is loaded only on the client (no SSR).
const PdfSearchView = dynamic(() => import('@/components/PdfSearchView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full text-gray-200 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      <span className="text-sm">Φόρτωση εγγράφου…</span>
    </div>
  ),
});

interface PdfViewerProps {
  url: string;
  title: string | null;
  onClose: () => void;
}

// Extract the `#search=...` term (added by buildPdfUrl) from the document URL.
function getSearchTerm(url: string): string {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) return '';
  const params = new URLSearchParams(url.slice(hashIdx + 1));
  return params.get('search') ?? '';
}

function getExtension(url: string): string {
  const clean = url.split('#')[0].split('?')[0];
  const lastDot = clean.lastIndexOf('.');
  const lastSlash = clean.lastIndexOf('/');
  if (lastDot === -1 || lastDot < lastSlash) return '';
  return clean.slice(lastDot + 1).toLowerCase();
}

function downloadName(title: string | null, url: string): string {
  const clean = url.split('#')[0].split('?')[0];
  const fromUrl = decodeURIComponent(clean.slice(clean.lastIndexOf('/') + 1));
  return fromUrl || title || 'document';
}

export function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const ext = getExtension(url);
  const isPdf = ext === 'pdf' || ext === '';
  const searchTerm = getSearchTerm(url);
  const fileUrl = url.split('#')[0];
  const isDocx = ext === 'docx';
  const isLegacyDoc = ext === 'doc';

  const { Icon: FileTypeIconComp, color: fileColor } = getFileTypeStyle(url);

  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDocx) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocxHtml(null);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const mammoth = await import('mammoth/mammoth.browser');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setDocxHtml(result.value || '<p>(Κενό έγγραφο)</p>');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Σφάλμα φόρτωσης εγγράφου');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, isDocx]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm bg-black/60">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-[#1a1a1c] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#151518] shrink-0">
          <div className="flex items-center gap-3">
            <FileTypeIconComp className="w-6 h-6" style={{ color: fileColor }} />
            <span className="font-medium">{title ?? 'Προβολή Εγγράφου'}</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {isPdf && (
            searchTerm
              ? <PdfSearchView url={fileUrl} searchTerm={searchTerm} />
              : <iframe src={url} className="w-full h-full bg-white" />
          )}

          {isDocx && (
            <div className="w-full h-full overflow-auto bg-white">
              {loading && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
                  <span className="text-sm">Φόρτωση εγγράφου…</span>
                </div>
              )}
              {error && (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3 px-6 text-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                  <span className="text-sm">Αποτυχία φόρτωσης του εγγράφου: {error}</span>
                </div>
              )}
              {docxHtml && (
                <article
                  className="docx-content mx-auto max-w-3xl px-10 py-10 text-black"
                  dangerouslySetInnerHTML={{ __html: docxHtml }}
                />
              )}
            </div>
          )}

          {isLegacyDoc && (
            <div className="flex flex-col items-center justify-center h-full bg-[#1a1a1c] text-gray-300 gap-4 px-6 text-center">
              <FileTypeIconComp className="w-12 h-12" style={{ color: fileColor }} />
              <div className="max-w-md">
                <p className="font-medium mb-1">Προεπισκόπηση μη διαθέσιμη</p>
                <p className="text-sm text-gray-400">
                  Δεν υποστηρίζεται η προβολή αρχείων <code>.doc</code> στον browser.
                  Κατεβάστε το αρχείο για να το ανοίξετε.
                </p>
              </div>
              <a
                href={url.split('#')[0]}
                download={downloadName(title, url)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-yellow-500 text-black text-sm font-medium hover:bg-yellow-400 transition"
              >
                <Download className="w-4 h-4" />
                Λήψη αρχείου
              </a>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .docx-content { line-height: 1.6; font-size: 0.95rem; }
        .docx-content h1 { font-size: 1.5rem; font-weight: 700; margin: 1.2rem 0 0.6rem; }
        .docx-content h2 { font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .docx-content h3 { font-size: 1.1rem; font-weight: 600; margin: 0.9rem 0 0.4rem; }
        .docx-content p { margin: 0.5rem 0; }
        .docx-content ul, .docx-content ol { margin: 0.5rem 0 0.5rem 1.5rem; list-style: revert; }
        .docx-content table { border-collapse: collapse; margin: 0.8rem 0; width: 100%; }
        .docx-content td, .docx-content th { border: 1px solid #d1d5db; padding: 0.4rem 0.6rem; }
        .docx-content a { color: #2563eb; text-decoration: underline; }
        .docx-content img { max-width: 100%; height: auto; }
      `}</style>
    </div>
  );
}
