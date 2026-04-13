"use client";

import { FileText, X } from 'lucide-react';

interface PdfViewerProps {
  url: string;
  title: string | null;
  onClose: () => void;
}

export function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm bg-black/60">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-full max-h-[90vh] bg-[#1a1a1c] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#151518] shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-yellow-500" />
            <span className="font-medium">{title ?? 'Προβολή Εγγράφου'}</span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <iframe src={url} className="w-full h-full bg-white" />
        </div>
      </div>
    </div>
  );
}
