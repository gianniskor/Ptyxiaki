"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@heroui/react';
import { useRouter } from 'next/navigation';
import {
  Search, Command, X,
  Clock, FileText,
  Scale, Filter, ChevronDown,
  ArrowRight, Calendar, Building2,
  Loader
} from 'lucide-react';
import { InteractiveProductCard } from '@/components/ui/card-7';
import { PdfViewer } from '@/components/PdfViewer';
import { AuthButton } from '@/components/AuthButton';
import { AdminNavLink } from '@/components/AdminNavLink';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';
import { useKeyboardShortcuts, usePdfViewer, useRecentSearches } from '@/lib/hooks';
import { buildPdfUrl } from '@/lib/api';
import type { SearchResult } from '@/lib/types';

export default function App() {
  const router = useRouter();

  // UI States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showModalBody, setShowModalBody] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  // Data States
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ katigoria: string[]; dikastirio: string[]; etos: string[] }>({ katigoria: [], dikastirio: [], etos: [] });
  const [facets, setFacets] = useState<{ katigoria: Record<string, number>; dikastirio: Record<string, number>; etos: Record<string, number> }>({ katigoria: {}, dikastirio: {}, etos: {} });
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Shared hooks
  const { activePdfUrl, activePdfTitle, openPdf, closePdf } = usePdfViewer();
  const { recentSearches, addRecentSearch } = useRecentSearches();

  useKeyboardShortcuts({
    onEscape: () => {
      setShowModalBody(false);
      setIsSearchOpen(false);
      closePdf();
    },
    onCtrlK: () => setIsSearchOpen(true),
  });

  const toggleFilter = (group: 'katigoria' | 'dikastirio' | 'etos', value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [group]: prev[group].includes(value) ? prev[group].filter(f => f !== value) : [...prev[group], value]
    }));
  };

  const hasActiveFilters = activeFilters.katigoria.length > 0 || activeFilters.dikastirio.length > 0 || activeFilters.etos.length > 0;

  // Fetch available facets from backend
  useEffect(() => {
    fetch('http://localhost:8000/api/facets')
      .then(r => r.json())
      .then(data => setFacets(data))
      .catch(() => { /* ignore */ });
  }, []);

  // Η συνάρτηση που ρωτάει το FastAPI
  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    const hasFilters = activeFilters.katigoria.length > 0 || activeFilters.dikastirio.length > 0 || activeFilters.etos.length > 0;
    if (!searchQuery.trim() && !hasFilters) {
      setResults([]);
      // Reset facets to global
      fetch('http://localhost:8000/api/facets')
        .then(r => r.json())
        .then(data => setFacets(data))
        .catch(() => {});
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('q', searchQuery.trim() || '*');
      params.set('rows', '10');
      activeFilters.katigoria.forEach(k => params.append('katigoria', k));
      activeFilters.dikastirio.forEach(d => params.append('dikastirio', d));
      activeFilters.etos.forEach(e => params.append('etos', e));

      const res = await fetch(`http://localhost:8000/api/search?${params.toString()}`);
      const data = await res.json();
      setResults(data.results || []);

      // Only update facet counts dynamically when there's a text query
      if (searchQuery.trim() && data.facets) {
        const parsePairs = (flat: any[]) => {
          const result: Record<string, number> = {};
          for (let i = 0; i < flat.length; i += 2) {
            if (flat[i + 1] > 0) result[flat[i]] = flat[i + 1];
          }
          return result;
        };
        setFacets({
          katigoria: parsePairs(data.facets.katigoria || []),
          dikastirio: parsePairs(data.facets.dikastirio || []),
          etos: parsePairs(data.facets.etos || []),
        });
      }
    } catch (error) {
      console.error("Σφάλμα αναζήτησης:", error);
    } finally {
      setLoading(false);
    }
  };

  // Stagger modal body after search bar opens
  useEffect(() => {
    if (isSearchOpen) {
      const timer = setTimeout(() => setShowModalBody(true), 150);
      return () => clearTimeout(timer);
    } else {
      setShowModalBody(false);
    }
  }, [isSearchOpen]);

  // Re-run search when filters change
  useEffect(() => {
    const hasFilters = activeFilters.katigoria.length > 0 || activeFilters.dikastirio.length > 0 || activeFilters.etos.length > 0;
    if (query.trim() || hasFilters) handleSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters]);

  // Όταν κάνει κλικ σε αποτέλεσμα
  const handleResultClick = (pdfPath: string, titlos: string, arithmos: string, katigoria: string[]) => {
    setIsSearchOpen(false);
    openPdf(buildPdfUrl(pdfPath, katigoria, query), titlos);
  };

  const categoryChipClass = (_cat: string) => 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'

  return (
    <div className="min-h-screen text-white font-sans relative overflow-x-hidden selection:bg-yellow-500/30">

      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* --- NAVBAR --- */}
      <nav className="relative z-10">
        <div className="flex items-center px-8 py-6 max-w-7xl mx-auto">
          <div className="flex-1 flex items-center gap-3">
            <Scale className="w-8 h-8 text-white" />
            <span className="text-xl font-bold tracking-wider">PLACEHOLDER</span>
          </div>

          <div className="hidden md:flex bg-[#1a1a1c]/80 backdrop-blur-sm border border-gray-800 rounded-full shadow-lg p-1">
            <button className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-medium">Αρχική</button>
            <button onClick={() => router.push('/results')} className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">Αρχείο</button>
            <button className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium" onClick={() => setShowChatbot(true)}>AI Chatbot</button>
            <AdminNavLink />
          </div>

          <div className="flex-1 flex items-center justify-end gap-6">
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <main className="relative z-10 flex flex-col items-center justify-center mt-20 px-4 max-w-7xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl font-black mb-4 tracking-tight"
          style={{ background: 'linear-gradient(to right, #a78bfa, #fcd34d, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          PLACEHOLDER TEXT SOMETHING
        </h1>
        <h2 className="text-xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-8 style-outline">
          lorum ipsum dolor sit amet, consectetur adipiscing elit. Donec vel
        </h2>

        <div
          onClick={() => setIsSearchOpen(true)}
          className="group flex items-center bg-[#151518] border border-gray-700/50 hover:border-yellow-500/50 rounded-full px-6 py-4 cursor-pointer w-full max-w-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300"
        >
          <Search className="w-5 h-5 mr-4 text-yellow-500/80 group-hover:text-yellow-400" />
          <span className="text-gray-400 group-hover:text-gray-200 transition-colors text-lg">
            Αναζήτηση αποφάσεων...
          </span>
          <div className="ml-auto flex items-center gap-1 bg-[#222] border border-gray-700 text-gray-400 text-xs px-3 py-1.5 rounded-full">
            <Command className="w-3 h-3" />
            <span>/ Ctrl + K</span>
          </div>
        </div>

        {/* --- CARDS --- */}
        <div className="flex flex-wrap justify-center gap-12 mt-24 mb-16 w-full">
          <InteractiveProductCard
            title="Αστικό Δίκαιο"
            imageUrl="/AstikoLogo.png"
            className="w-48"
            onClick={() => router.push('/results?katigoria=Αστικό&q=Αστικό')}
          />
          <InteractiveProductCard
            title="Ποινικό Δίκαιο"
            imageUrl="/PoinikoLogo.png"
            className="w-48 translate-y-4"
            onClick={() => router.push('/results?katigoria=Ποινικό&q=Ποινικό')}
          />
          <InteractiveProductCard
            title="Διοικητικό Δίκαιο"
            imageUrl="/DioikitikoLogo.png"
            className="w-48"
            onClick={() => router.push('/results?katigoria=Διοικητικό&q=Διοικητικό')}
          />
        </div>
      </main>

      {/* --- SEARCH MODAL --- */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center pt-[30vh] px-4 backdrop-blur-sm bg-black/40 modal-backdrop-enter">
          <div className="absolute inset-0" onClick={() => { setShowModalBody(false); setIsSearchOpen(false); }}></div>

          {/* Search Bar */}
          <div className="relative w-full max-w-2xl bg-[#1e1e1e] border border-gray-800/60 rounded-full shadow-2xl overflow-hidden text-gray-200 search-bar-enter" onClick={e => e.stopPropagation()}>
            <div className="flex items-center px-5 py-4">
              <Search className="w-5 h-5 text-yellow-500/80 mr-3 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const hasFilters = activeFilters.katigoria.length > 0 || activeFilters.dikastirio.length > 0 || activeFilters.etos.length > 0;
                    if (query.trim() || hasFilters) {
                      if (query.trim()) addRecentSearch(query);
                      setIsSearchOpen(false);
                      const p = new URLSearchParams();
                      if (query.trim()) p.set('q', query);
                      activeFilters.katigoria.forEach(k => p.append('katigoria', k));
                      activeFilters.dikastirio.forEach(d => p.append('dikastirio', d));
                      activeFilters.etos.forEach(e => p.append('etos', e));
                      router.push(`/results?${p.toString()}`);
                    }
                  }
                }}
                placeholder="Αναζήτηση για αποφάσεις, δικαστήρια, θέματα..."
                className="flex-1 bg-transparent border-none outline-none text-lg text-white placeholder-gray-500"
              />
              <div className="ml-3 flex items-center gap-1 text-gray-500 text-xs px-2 py-1 bg-[#2a2a2c] rounded border border-gray-700/50">
                Esc
              </div>
            </div>
          </div>

          <div className="h-3" />

          {/* Results Body */}
        <div
            className={`relative w-full max-w-2xl bg-[#1e1e1e] border border-gray-800/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-gray-200 transition-all duration-300 ease-out ${
              showModalBody ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
            onClick={e => e.stopPropagation()}
            data-theme="dark"
          >

            {/* Filter Chips */}
            <div className="flex flex-col gap-2 px-5 pt-4 pb-2">
              {/* Row 1 */}
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => setActiveFilters({ katigoria: [], dikastirio: [], etos: [] })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                    !hasActiveFilters
                      ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                      : 'bg-[#2a2a2c] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  Όλα
                </button>
                <span className="text-gray-600 text-[10px]">|</span>
                <Scale className="w-3 h-3 text-gray-500 shrink-0" />
                {Object.keys(facets.katigoria).map((k) => (
                  <button
                    key={k}
                    onClick={() => toggleFilter('katigoria', k)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                      activeFilters.katigoria.includes(k)
                        ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                        : 'bg-[#2a2a2c] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                  >
                    {k}
                    <span className="text-[10px] opacity-60">{facets.katigoria[k]}</span>
                  </button>
                ))}
              </div>

              {/* Row 2 (collapsible) */}
              {showMoreFilters && (
                <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                  {Object.keys(facets.dikastirio).length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto">
                      <Building2 className="w-3 h-3 text-gray-500 shrink-0" />
                      {Object.keys(facets.dikastirio).map((d) => (
                        <button
                          key={d}
                          onClick={() => toggleFilter('dikastirio', d)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                            activeFilters.dikastirio.includes(d)
                              ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                              : 'bg-[#2a2a2c] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                          }`}
                        >
                          {d}
                          <span className="text-[10px] opacity-60">{facets.dikastirio[d]}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {Object.keys(facets.etos).length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto">
                      <Calendar className="w-3 h-3 text-gray-500 shrink-0" />
                      {Object.keys(facets.etos).sort((a, b) => Number(b) - Number(a)).map((y) => (
                        <button
                          key={y}
                          onClick={() => toggleFilter('etos', y)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                            activeFilters.etos.includes(y)
                              ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                              : 'bg-[#2a2a2c] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                          }`}
                        >
                          {y}
                          <span className="text-[10px] opacity-60">{facets.etos[y]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Toggle more filters */}
              {(Object.keys(facets.dikastirio).length > 0 || Object.keys(facets.etos).length > 0) && (
                <button
                  onClick={() => setShowMoreFilters(!showMoreFilters)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors self-start"
                >
                  <Filter className="w-3 h-3" />
                  {showMoreFilters ? 'Λιγότερα φίλτρα' : 'Περισσότερα φίλτρα'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="px-4 pb-4 pt-2 overflow-y-auto max-h-[55vh] custom-scrollbar min-h-[200px]">

              {loading && (
                <div className="flex justify-center items-center py-10 text-gray-500">
                  <Loader className="w-5 h-5 animate-pulse mr-2" /> Αναζήτηση...
                </div>
              )}

              {/* Static UI when no query and no filters */}
              {!query && !loading && !hasActiveFilters && (
                <div className="space-y-5">
                  {/* Recent Searches */}
                  {recentSearches.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2 px-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Πρόσφατες αναζητήσεις
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {recentSearches.map((term) => (
                          <div
                            key={term}
                            onClick={() => {
                              handleSearch(term);
                            }}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#2a2a2c] cursor-pointer group transition-colors"
                          >
                            <Clock className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
                            <span className="text-sm text-gray-400 group-hover:text-gray-200">{term}</span>
                            <ArrowRight className="w-3 h-3 text-gray-700 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* TODO will revisit this part later. */}
                  {/* Popular Categories */}
                  {/* <div>
                    <p className="text-xs text-gray-500 mb-2 px-1 flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" /> Δημοφιλείς κατηγορίες
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Αστικό Δίκαιο', icon: Scale, q: 'Αστικό' },
                        { label: 'Ποινικό Δίκαιο', icon: Gavel, q: 'Ποινικό' },
                        { label: 'Διοικητικό Δίκαιο', icon: Landmark, q: 'Διοικητικό' },
                        { label: 'Συνταγματικό Δίκαιο', icon: Shield, q: 'Συνταγματικό' },
                      ].map((cat) => (
                        <div
                          key={cat.label}
                          onClick={() => {
                            addRecentSearch(cat.q);
                            setIsSearchOpen(false);
                            router.push(`/results?katigoria=${cat.q}&q=${cat.q}`);
                          }}
                          className="flex items-center gap-3 px-3 py-3 rounded-xl bg-[#2a2a2c] border border-gray-700/50 hover:border-yellow-500/40 cursor-pointer transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#333] flex items-center justify-center group-hover:bg-yellow-500/10 transition-colors">
                            <cat.icon className="w-4 h-4 text-gray-400 group-hover:text-yellow-500 transition-colors" />
                          </div>
                          <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{cat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div> */}

                  {/* Quick Action */}
                  {/* <div>
                    <p className="text-xs text-gray-500 mb-2 px-1">Άμεσες ενέργειες</p>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[#2a2a2c] cursor-pointer transition-colors" onClick={() => { setIsSearchOpen(false); setShowChatbot(true); }}>
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#333]"><Sparkles className="w-4 h-4 text-yellow-500" /></div>
                          <span className="text-sm text-gray-300">Άνοιγμα AI Assistant</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
                      </div>
                    </div>
                  </div> */}
                </div>
              )}

              {/* Dynamic results Solr */}
              {(query || hasActiveFilters) && !loading && results.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 px-1">
                    Αποτελέσματα <span className="text-gray-600 ml-1">
                      {results.length}
                    </span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {results.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer group hover:bg-surface-hover transition-colors"
                        onClick={() => handleResultClick(item.pdf_path, item.titlos, item.arithmos, item.katigoria)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-yellow-500/80 shrink-0" />
                            <span className="text-sm font-bold text-foreground">{item.arithmos}</span>
                          </div>
                            {item.katigoria?.length > 0 && (
                            <div className="flex flex-wrap gap-1 shrink-0">
                              {item.katigoria.map(cat => (
                                <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryChipClass(cat)}`}>{cat}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p
                          className="text-xs text-muted line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: item.snippet || item.titlos }}
                        />
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {(query || hasActiveFilters) && !loading && results.length > 0 && (
                <div className="mt-3 text-center">
                  <button
                    onClick={() => {
                      if (query.trim()) addRecentSearch(query);
                      setIsSearchOpen(false);
                      const p = new URLSearchParams();
                      if (query.trim()) p.set('q', query);
                      activeFilters.katigoria.forEach(k => p.append('katigoria', k));
                      activeFilters.dikastirio.forEach(d => p.append('dikastirio', d));
                      activeFilters.etos.forEach(e => p.append('etos', e));
                      router.push(`/results?${p.toString()}`);
                    }}
                    className="text-xs text-yellow-500 hover:text-yellow-400 hover:underline transition-colors"
                  >
                    Δείτε όλα τα αποτελέσματα{query ? <> για &ldquo;{query}&rdquo;</> : ''}
                  </button>
                </div>
              )}

              {(query || hasActiveFilters) && !loading && results.length === 0 && (
                <div className="text-center text-gray-500 py-10 text-sm">
                  {query ? <>Δεν βρέθηκαν αποφάσεις για &ldquo;{query}&rdquo;</> : 'Δεν βρέθηκαν αποφάσεις με τα επιλεγμένα φίλτρα'}
                </div>
              )}

            </div>

            <div className="px-4 py-2.5 border-t border-gray-800/60 bg-[#1a1a1c] text-xs text-gray-500 flex justify-between">
              <span></span>
              <span>Enter για αναζήτηση</span>
            </div>
          </div>
        </div>
      )}

      {/* --- PDF VIEWER OVERLAY --- */}
      {activePdfUrl && (
        <PdfViewer url={activePdfUrl} title={activePdfTitle} onClose={closePdf} />
      )}
    </div>
  );
}