"use client";

import { useState, useEffect } from 'react';

export function useKeyboardShortcuts({
  onEscape,
  onCtrlK,
}: {
  onEscape?: () => void;
  onCtrlK?: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) onEscape();
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && onCtrlK) {
        e.preventDefault();
        onCtrlK();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscape, onCtrlK]);
}

export function usePdfViewer() {
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string | null>(null);

  const openPdf = (url: string, title: string) => {
    setActivePdfUrl(url);
    setActivePdfTitle(title);
  };

  const closePdf = () => {
    setActivePdfUrl(null);
    setActivePdfTitle(null);
  };

  return { activePdfUrl, activePdfTitle, openPdf, closePdf };
}

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recentSearches');
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const addRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, 5);
    setRecentSearches(updated);
    try { localStorage.setItem('recentSearches', JSON.stringify(updated)); } catch { /* ignore */ }
  };

  return { recentSearches, addRecentSearch };
}
