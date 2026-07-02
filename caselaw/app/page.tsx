"use client";

import React, { useState, useEffect } from 'react';
import { Card } from '@heroui/react';
import { useRouter } from 'next/navigation';
import {
  Search, Command, X,
  Clock,
  Scale, Filter,
  ArrowRight, Building2, Tag as TagIcon,
  Loader
} from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { PdfViewer } from '@/components/PdfViewer';
import { AuthButton } from '@/components/AuthButton';
import { AdminNavLink } from '@/components/AdminNavLink';
import { FileTypeIcon, getFileTypeStyle, stripFileExtension } from '@/components/FileTypeIcon';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';
import { FacetSection, SubcategorySection } from '@/components/Facets';
import { useKeyboardShortcuts, usePdfViewer, useRecentSearches } from '@/lib/hooks';
import { buildPdfUrl, truncateAtDots, fetchHierarchy, parseFacets, fetchGlobalFacets, mergeFacetCounts } from '@/lib/api';
import type { SearchResult, Facets } from '@/lib/types';

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
  const [activeFilters, setActiveFilters] = useState<{ katigoria: string[]; ypokatigoria: string[]; organismos: string[] }>({ katigoria: [], ypokatigoria: [], organismos: [] });
  const [facets, setFacets] = useState<Facets>({ katigoria: [], ypokatigoria: [], organismos: [] });
  const [globalFacets, setGlobalFacets] = useState<Facets>({ katigoria: [], ypokatigoria: [], organismos: [] });
  const [hierarchy, setHierarchy] = useState<Record<string, string[]>>({});

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

  const toggleFilter = (group: 'katigoria' | 'ypokatigoria' | 'organismos', value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [group]: prev[group].includes(value) ? prev[group].filter(f => f !== value) : [...prev[group], value]
    }));
  };

  const hasActiveFilters = activeFilters.katigoria.length > 0 || activeFilters.ypokatigoria.length > 0 || activeFilters.organismos.length > 0;

  // Fetch the master (unfiltered) facet list once on mount.
  useEffect(() => {
    fetchGlobalFacets().then(setGlobalFacets).catch(() => {});
    fetchHierarchy().then(setHierarchy).catch(() => {});
  }, []);

  // Η συνάρτηση που ρωτάει το FastAPI
  const handleSearch = async (searchQuery: string) => {
    setQuery(searchQuery);
    const hasFilters = activeFilters.katigoria.length > 0 || activeFilters.ypokatigoria.length > 0 || activeFilters.organismos.length > 0;
    if (!searchQuery.trim() && !hasFilters) {
      setResults([]);
      setFacets({ katigoria: [], ypokatigoria: [], organismos: [] });
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('q', searchQuery.trim() || '*');
      params.set('rows', '10');
      activeFilters.katigoria.forEach(k => params.append('katigoria', k));
      activeFilters.ypokatigoria.forEach(y => params.append('ypokatigoria', y));
      activeFilters.organismos.forEach(o => params.append('organismos', o));

      const res = await fetch(`http://localhost:8000/api/search?${params.toString()}`);
      const data = await res.json();
      setResults(data.results || []);

      // Live facet counts from the current search results.
      setFacets(parseFacets(data.facets || {}));
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
    const hasFilters = activeFilters.katigoria.length > 0 || activeFilters.ypokatigoria.length > 0 || activeFilters.organismos.length > 0;
    if (query.trim() || hasFilters) handleSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters]);

  // Όταν κάνει κλικ σε αποτέλεσμα
  const handleResultClick = (pdfPath: string, titlos: string, arithmos: string, katigoria: string[]) => {
    setIsSearchOpen(false);
    openPdf(buildPdfUrl(pdfPath, katigoria, query), titlos);
  };

  // --- Facet derivation (mirrors the /results page rules) ---
  const filterKatigoria = activeFilters.katigoria;
  const filterYpokatigoria = activeFilters.ypokatigoria;
  const filterOrganismos = activeFilters.organismos;

  // Counts refresh to reflect filtered results only when a subcategory or an
  // organisation is selected; otherwise the master counts are kept.
  const useLiveCounts = filterYpokatigoria.length > 0 || filterOrganismos.length > 0;
  // When a category is picked, organisations and subcategories refresh their
  // counts to reflect the category-filtered results.
  const catPicked = filterKatigoria.length > 0;

  const katigoriaItems = (useLiveCounts
    ? mergeFacetCounts(globalFacets.katigoria, facets.katigoria)
    : globalFacets.katigoria).filter(i => i.count > 0);
  let organismosItems = (useLiveCounts || catPicked
    ? mergeFacetCounts(globalFacets.organismos, facets.organismos)
    : globalFacets.organismos).filter(i => i.count > 0);

  // When a category is picked, only show organisations associated with the
  // selected categories (present in the category-filtered results).
  if (catPicked) {
    const associatedOrgs = new Set(facets.organismos.filter(i => i.count > 0).map(i => i.value));
    organismosItems = organismosItems.filter(i => associatedOrgs.has(i.value));
  }

  // Subcategories grouped by parent category, ordered by the proper category order.
  const ypoCountMap = new Map(
    (useLiveCounts || catPicked ? facets.ypokatigoria : globalFacets.ypokatigoria).map(i => [i.value, i.count])
  );
  const catOrder = globalFacets.katigoria.length
    ? globalFacets.katigoria.map(c => c.value)
    : Object.keys(hierarchy);
  const catsToShow = filterKatigoria.length > 0
    ? catOrder.filter(c => filterKatigoria.includes(c))
    : catOrder;
  const subGroups = catsToShow
    .map(cat => ({
      cat,
      subs: (hierarchy[cat] || [])
        .map(s => ({ value: s, count: ypoCountMap.get(s) ?? 0 }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count),
    }))
    .filter(g => g.subs.length > 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden text-white font-sans relative selection:bg-yellow-500/30">

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
            <button onClick={() => router.push('/chatbot')} className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">AI Chatbot</button>
            <AdminNavLink />
          </div>

          <div className="flex-1 flex items-center justify-end gap-6">
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <main className="relative z-10 flex flex-1 min-h-0 flex-col px-4 max-w-7xl mx-auto w-full">
        {/* Centered hero block (title + search) */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
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
        </div>

        {/* --- CATEGORY CAROUSEL (lower half of the viewport) --- */}
        <div className="w-full max-w-5xl mx-auto mt-4 mb-8 px-12">
          <Carousel
            opts={{ align: 'start', loop: false, dragFree: true }}
            className="w-full"
          >
            <CarouselContent className="-ml-3">
              {katigoriaItems.map((cat) => (
                <CarouselItem
                  key={cat.value}
                  className="pl-3 basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5"
                >
                  <button
                    onClick={() => router.push(`/results?katigoria=${encodeURIComponent(cat.value)}`)}
                    className="group flex h-40 w-full flex-col items-center justify-center gap-4 rounded-2xl border border-gray-700/50 bg-[#151518]/80 p-5 text-center backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-yellow-500/50 hover:bg-[#1a1a1c] hover:shadow-[0_0_30px_rgba(234,179,8,0.15)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#222] transition-colors group-hover:bg-yellow-500/10">
                      <Scale className="h-6 w-6 text-gray-400 transition-colors group-hover:text-yellow-500" />
                    </div>
                    <span className="line-clamp-2 text-base font-semibold text-gray-200 transition-colors group-hover:text-white">
                      {cat.value}
                    </span>
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>
            {katigoriaItems.length > 0 && (
              <>
                <CarouselPrevious className="text-white border-gray-700 bg-[#151518]/80 hover:bg-[#1a1a1c] hover:text-yellow-500" />
                <CarouselNext className="text-white border-gray-700 bg-[#151518]/80 hover:bg-[#1a1a1c] hover:text-yellow-500" />
              </>
            )}
          </Carousel>
        </div>
      </main>

      {/* --- SEARCH MODAL --- */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center pt-[14vh] px-4 backdrop-blur-sm bg-black/50 modal-backdrop-enter">
          <div className="absolute inset-0" onClick={() => { setShowModalBody(false); setIsSearchOpen(false); }}></div>

          {/* Search Bar */}
          <div className="relative w-full max-w-4xl bg-[#1e1e1e] border border-gray-800/60 rounded-2xl shadow-2xl overflow-hidden text-gray-200 search-bar-enter" onClick={e => e.stopPropagation()}>
            <div className="flex items-center px-6 py-5">
              <Search className="w-6 h-6 text-yellow-500/80 mr-4 shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const hasFilters = activeFilters.katigoria.length > 0 || activeFilters.ypokatigoria.length > 0 || activeFilters.organismos.length > 0;
                    if (query.trim() || hasFilters) {
                      if (query.trim()) addRecentSearch(query);
                      setIsSearchOpen(false);
                      const p = new URLSearchParams();
                      if (query.trim()) p.set('q', query);
                      activeFilters.katigoria.forEach(k => p.append('katigoria', k));
                      activeFilters.ypokatigoria.forEach(y => p.append('ypokatigoria', y));
                      activeFilters.organismos.forEach(o => p.append('organismos', o));
                      router.push(`/results?${p.toString()}`);
                    }
                  }
                }}
                placeholder="Αναζήτηση για αποφάσεις, θέματα..."
                className="flex-1 bg-transparent border-none outline-none text-xl text-white placeholder-gray-500"
              />
              <div className="ml-3 flex items-center gap-1 text-gray-400 text-sm px-2.5 py-1 bg-[#2a2a2c] rounded-md border border-gray-700/50">
                Esc
              </div>
            </div>
          </div>

          <div className="h-3" />

          {/* Results Body */}
        <div
            className={`relative w-full max-w-4xl bg-[#1e1e1e] border border-gray-800/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-gray-200 transition-all duration-300 ease-out ${
              showModalBody ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
            onClick={e => e.stopPropagation()}
            data-theme="dark"
          >

            <div className="flex min-h-0">

            {/* Filters Sidebar */}
            <aside className="w-72 shrink-0 flex flex-col gap-3 px-4 py-4 border-r border-gray-800/60 bg-[#1a1a1c] overflow-y-auto max-h-[60vh] custom-scrollbar" data-theme="dark">
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-wider">
                  <Filter className="w-4 h-4" /> Φίλτρα
                </span>
                {hasActiveFilters && (
                  <button
                    onClick={() => setActiveFilters({ katigoria: [], ypokatigoria: [], organismos: [] })}
                    className="text-xs text-yellow-500 hover:text-yellow-400 underline"
                  >
                    Καθαρισμός
                  </button>
                )}
              </div>
              <FacetSection
                title="Κατηγορία"
                icon={<TagIcon className="w-4 h-4 text-yellow-500/70" />}
                items={katigoriaItems}
                selectedValues={activeFilters.katigoria}
                onToggle={(v) => toggleFilter('katigoria', v)}
                displayTransform={truncateAtDots}
              />
              <SubcategorySection
                groups={subGroups}
                selectedValues={activeFilters.ypokatigoria}
                onToggle={(v) => toggleFilter('ypokatigoria', v)}
              />
              <FacetSection
                title="Οργανισμός"
                icon={<Building2 className="w-4 h-4 text-yellow-500/70" />}
                items={organismosItems}
                selectedValues={activeFilters.organismos}
                onToggle={(v) => toggleFilter('organismos', v)}
              />
            </aside>

            {/* Results */}
            <div className="flex-1 min-w-0 px-5 pb-4 pt-4 overflow-y-auto max-h-[60vh] custom-scrollbar min-h-[320px]">

              {loading && (
                <div className="flex justify-center items-center py-10 text-gray-500 text-base">
                  <Loader className="w-5 h-5 animate-pulse mr-2" /> Αναζήτηση...
                </div>
              )}

              {/* Static UI when no query and no filters */}
              {!query && !loading && !hasActiveFilters && (
                <div className="space-y-5">
                  {/* Recent Searches */}
                  {recentSearches.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-500 mb-2 px-1 flex items-center gap-1.5">
                        <Clock className="w-4 h-4" /> Πρόσφατες αναζητήσεις
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {recentSearches.map((term) => (
                          <div
                            key={term}
                            onClick={() => {
                              handleSearch(term);
                            }}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#2a2a2c] cursor-pointer group transition-colors"
                          >
                            <Clock className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
                            <span className="text-base text-gray-400 group-hover:text-gray-200">{term}</span>
                            <ArrowRight className="w-4 h-4 text-gray-700 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {recentSearches.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center text-gray-600 py-20 gap-3">
                      <Search className="w-9 h-9 opacity-40" />
                      <p className="text-base">Ξεκινήστε να πληκτρολογείτε ή επιλέξτε μια κατηγορία</p>
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic results Solr */}
              {(query || hasActiveFilters) && !loading && results.length > 0 && (
                <div>
                  <p className="text-sm text-gray-500 mb-2 px-1">
                    Αποτελέσματα <span className="text-gray-600 ml-1">
                      {results.length}
                    </span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {results.map((item) => {
                      const fileColor = getFileTypeStyle(item.pdf_path).color;
                      return (
                      <Card
                        key={item.id}
                        className="cursor-pointer group hover:bg-surface-hover transition-colors border border-transparent hover:[border-color:var(--file-color)]"
                        style={{ ['--file-color' as string]: fileColor } as React.CSSProperties}
                        onClick={() => handleResultClick(item.pdf_path, item.titlos, item.arithmos, item.katigoria)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileTypeIcon fileName={item.pdf_path} className="w-4 h-4" boxClassName="p-1 rounded-md shrink-0" />
                            <span className="text-base font-bold text-foreground">{stripFileExtension(item.arithmos)}</span>
                          </div>
                            {item.katigoria?.length > 0 && (
                            <div className="flex flex-wrap gap-1 shrink-0">
                              {item.katigoria.map(cat => (
                                <span
                                  key={cat}
                                  className="text-xs px-2 py-0.5 rounded-full font-medium border"
                                  style={{
                                    backgroundColor: 'oklch(20.5% 0 0)',
                                    borderColor: 'oklch(26.9% 0 0)',
                                    color: 'oklch(70.8% 0 0)',
                                  }}
                                >{cat}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p
                          className="text-sm text-muted line-clamp-2"
                          dangerouslySetInnerHTML={{ __html: item.snippet || item.titlos }}
                        />
                      </Card>
                      );
                    })}
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
                      activeFilters.ypokatigoria.forEach(y => p.append('ypokatigoria', y));
                      activeFilters.organismos.forEach(o => p.append('organismos', o));
                      router.push(`/results?${p.toString()}`);
                    }}
                    className="text-sm text-yellow-500 hover:text-yellow-400 hover:underline transition-colors"
                  >
                    Δείτε όλα τα αποτελέσματα{query ? <> για &ldquo;{query}&rdquo;</> : ''}
                  </button>
                </div>
              )}

              {(query || hasActiveFilters) && !loading && results.length === 0 && (
                <div className="text-center text-gray-500 py-10 text-base">
                  {query ? <>Δεν βρέθηκαν αποφάσεις για &ldquo;{query}&rdquo;</> : 'Δεν βρέθηκαν αποφάσεις με τα επιλεγμένα φίλτρα'}
                </div>
              )}

            </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-800/60 bg-[#1a1a1c] text-sm text-gray-500 flex justify-between">
              <span className="text-gray-600">{hasActiveFilters ? `${activeFilters.katigoria.length + activeFilters.ypokatigoria.length + activeFilters.organismos.length} φίλτρα ενεργά` : ''}</span>
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