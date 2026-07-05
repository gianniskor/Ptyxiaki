"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

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

const RECENT_SEARCHES_MAX = 5;
const GUEST_RECENT_SEARCHES_KEY = 'recentSearches';

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchesRef = useRef<string[]>([]);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const userIdRef = useRef<string | null>(null);

  // Keep state and ref in sync so `addRecentSearch` can read the latest value.
  const apply = useCallback((next: string[]) => {
    searchesRef.current = next;
    setRecentSearches(next);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;
    let active = true;

    const loadGuest = () => {
      try {
        const stored = localStorage.getItem(GUEST_RECENT_SEARCHES_KEY);
        apply(stored ? JSON.parse(stored) : []);
      } catch { apply([]); }
    };

    // Load the correct history for whoever is currently signed in (or guest).
    const sync = async () => {
      if (!supabase) { loadGuest(); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      userIdRef.current = user?.id ?? null;

      if (user) {
        const { data, error } = await supabase
          .from('recent_searches')
          .select('term')
          .order('created_at', { ascending: false })
          .limit(RECENT_SEARCHES_MAX);
        if (!active) return;
        apply(error ? [] : (data ?? []).map((row) => row.term as string));
      } else {
        loadGuest();
      }
    };

    sync();

    // Reload when the user logs in/out so the list never leaks across accounts.
    const sub = supabase?.auth.onAuthStateChange(() => { sync(); });
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [apply]);

  const addRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    const updated = [trimmed, ...searchesRef.current.filter((s) => s !== trimmed)].slice(0, RECENT_SEARCHES_MAX);
    apply(updated);

    const supabase = supabaseRef.current;
    const uid = userIdRef.current;
    if (supabase && uid) {
      void supabase
        .from('recent_searches')
        .upsert(
          { user_id: uid, term: trimmed, created_at: new Date().toISOString() },
          { onConflict: 'user_id,term' },
        )
        .then(({ error }) => {
          if (error) console.error('Failed to save recent search:', error);
        });
    } else {
      try { localStorage.setItem(GUEST_RECENT_SEARCHES_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    }
  }, [apply]);

  const clearRecentSearches = useCallback(() => {
    apply([]);

    const supabase = supabaseRef.current;
    const uid = userIdRef.current;
    if (supabase && uid) {
      void supabase.from('recent_searches').delete().eq('user_id', uid)
        .then(({ error }) => {
          if (error) console.error('Failed to clear recent searches:', error);
        });
    } else {
      try { localStorage.removeItem(GUEST_RECENT_SEARCHES_KEY); } catch { /* ignore */ }
    }
  }, [apply]);

  return { recentSearches, addRecentSearch, clearRecentSearches };
}
