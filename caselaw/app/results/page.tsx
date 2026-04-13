"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, FileText, X, Scale, Filter, ChevronDown,
  ArrowLeft, Landmark, Calendar, Tag
} from 'lucide-react';
import { PdfViewer } from '@/components/PdfViewer';
import { buildPdfUrl, parseFacets } from '@/lib/api';
import type { SearchResult, FacetItem, Facets } from '@/lib/types';

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets>({ dikastirio: [], etos: [], katigoria: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(Number(searchParams.get('page')) || 0);
  const rows = 10;

  // Active filters
  const [filterDikastirio, setFilterDikastirio] = useState<string | null>(searchParams.get('dikastirio'));
  const [filterEtos, setFilterEtos] = useState<string | null>(searchParams.get('etos'));
  const [filterKatigoria, setFilterKatigoria] = useState<string | null>(searchParams.get('katigoria'));

  // PDF viewer
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string | null>(null);

  // Collapsed facet sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, rows: String(rows), page: String(page) });
      if (filterDikastirio) params.set('dikastirio', filterDikastirio);
      if (filterEtos) params.set('etos', filterEtos);
      if (filterKatigoria) params.set('katigoria', filterKatigoria);

      const res = await fetch(`http://localhost:8000/api/search?${params}`);
      const data = await res.json();

      // Merge highlights into results
      const highlights = data.highlights || {};
      const enrichedResults = (data.results || []).map((doc: any) => {
        const hl = highlights[doc.id];
        const snippet = hl?.periexomeno?.join(' ... ') || '';
        return { ...doc, snippet };
      });

      setResults(enrichedResults);
      setTotal(data.total || 0);
      setFacets(parseFacets(data.facets || {}));
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  }, [query, page, filterDikastirio, filterEtos, filterKatigoria]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filterDikastirio) params.set('dikastirio', filterDikastirio);
    if (filterEtos) params.set('etos', filterEtos);
    if (filterKatigoria) params.set('katigoria', filterKatigoria);
    if (page > 0) params.set('page', String(page));
    router.replace(`/results?${params.toString()}`, { scroll: false });
  }, [query, filterDikastirio, filterEtos, filterKatigoria, page, router]);

  // Escape to close PDF
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activePdfUrl) {
        setActivePdfUrl(null);
        setActivePdfTitle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePdfUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(inputValue);
    setPage(0);
  };

  const handleResultClick = (result: SearchResult) => {
    const url = buildPdfUrl(result.pdf_path, result.katigoria, query);
    setActivePdfUrl(url);
    setActivePdfTitle(result.titlos);
  };

  const toggleFilter = (type: 'dikastirio' | 'etos' | 'katigoria', value: string) => {
    setPage(0);
    if (type === 'dikastirio') {
      setFilterDikastirio(prev => prev === value ? null : value);
    } else if (type === 'etos') {
      setFilterEtos(prev => prev === value ? null : value);
    } else {
      setFilterKatigoria(prev => prev === value ? null : value);
    }
  };

  const clearAllFilters = () => {
    setFilterDikastirio(null);
    setFilterEtos(null);
    setFilterKatigoria(null);
    setPage(0);
  };

  const hasActiveFilters = filterDikastirio || filterEtos || filterKatigoria;
  const totalPages = Math.ceil(total / rows);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const renderFacetSection = (
    title: string,
    icon: React.ReactNode,
    items: FacetItem[],
    type: 'dikastirio' | 'etos' | 'katigoria',
    activeValue: string | null
  ) => {
    const isCollapsed = collapsedSections[type];
    const displayItems = isCollapsed ? [] : items.slice(0, 8);

    return (
      <div className="mb-1">
        <button
          onClick={() => toggleSection(type)}
          className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-[#2a2a2c] rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            {icon}
            {title}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
        </button>
        {!isCollapsed && (
          <div className="mt-1 space-y-0.5 px-1">
            {displayItems.map(item => (
              <button
                key={item.value}
                onClick={() => toggleFilter(type, item.value)}
                className={`flex items-center justify-between w-full px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  activeValue === item.value
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'text-gray-400 hover:bg-[#2a2a2c] hover:text-gray-200'
                }`}
              >
                <span className="truncate">{item.value}</span>
                <span className={`text-xs ml-2 shrink-0 ${
                  activeValue === item.value ? 'text-yellow-500' : 'text-gray-600'
                }`}>
                  {item.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white font-sans">
      {/* Top Search Bar */}
      <div className="sticky top-0 z-30 bg-[#0d0d0f]/95 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => router.push('/')} className="p-2 hover:bg-[#2a2a2c] rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <Scale className="w-6 h-6 text-white" />
            <span className="text-lg font-bold tracking-wider hidden sm:inline">PLACEHOLDER</span>
          </div>
          <form onSubmit={handleSubmit} className="flex-1 max-w-2xl">
            <div className="flex items-center bg-[#1a1a1c] border border-gray-800 rounded-full px-4 py-2.5 focus-within:border-yellow-500/50 transition-colors">
              <Search className="w-4 h-4 text-yellow-500/80 mr-3 shrink-0" />
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Αναζήτηση αποφάσεων..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500"
              />
              {inputValue && (
                <button type="button" onClick={() => { setInputValue(''); setQuery(''); setResults([]); }} className="p-1 hover:bg-[#333] rounded-full">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Results info & active filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-gray-400">
              {loading ? 'Αναζήτηση...' : (
                total > 0
                  ? <><span className="text-white font-bold">{total}</span> αποτελέσματα για «<span className="text-yellow-400">{query}</span>»</>
                  : query ? `Δεν βρέθηκαν αποτελέσματα για «${query}»` : ''
              )}
            </p>
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="text-xs text-yellow-500 hover:text-yellow-400 underline">
                Καθαρισμός φίλτρων
              </button>
            )}
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filterDikastirio && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Landmark className="w-3 h-3" /> {filterDikastirio}
                <button onClick={() => setFilterDikastirio(null)}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterKatigoria && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Tag className="w-3 h-3" /> {filterKatigoria}
                <button onClick={() => setFilterKatigoria(null)}><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterEtos && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Calendar className="w-3 h-3" /> {filterEtos}
                <button onClick={() => setFilterEtos(null)}><X className="w-3 h-3" /></button>
              </span>
            )}
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar - Facets */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-[76px] bg-[#151518] border border-gray-800/60 rounded-2xl p-3 space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5" /> Φίλτρα
              </div>
              {renderFacetSection('Κατηγορία', <Tag className="w-4 h-4 text-yellow-500/70" />, facets.katigoria, 'katigoria', filterKatigoria)}
              {renderFacetSection('Δικαστήριο', <Landmark className="w-4 h-4 text-yellow-500/70" />, facets.dikastirio, 'dikastirio', filterDikastirio)}
              {renderFacetSection('Έτος', <Calendar className="w-4 h-4 text-yellow-500/70" />, facets.etos, 'etos', filterEtos)}
            </div>
          </aside>

          {/* Results List */}
          <main className="flex-1 min-w-0">
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-[#151518] border border-gray-800/40 rounded-xl p-5 animate-pulse">
                    <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
                    <div className="h-3 bg-gray-800/60 rounded w-full mb-2" />
                    <div className="h-3 bg-gray-800/60 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleResultClick(item)}
                    className="group bg-[#151518] border border-gray-800/40 hover:border-yellow-500/40 rounded-xl p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-yellow-500/5"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-yellow-500/10 rounded-lg">
                          <FileText className="w-4 h-4 text-yellow-500" />
                        </div>
                        <div>
                          <span className="text-base font-bold text-white group-hover:text-yellow-400 transition-colors">
                            {item.arithmos}
                          </span>
                          <p className="text-xs text-gray-500 mt-0.5">{item.dikastirio} • {item.etos}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {item.katigoria?.map(cat => (
                          <span key={cat} className="text-[10px] px-2 py-0.5 bg-[#2a2a2c] text-gray-400 rounded-md border border-gray-700/50">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Title */}
                    <p className="text-sm text-gray-300 mb-2 line-clamp-1">{item.titlos}</p>

                    {/* Snippet with highlights */}
                    {item.snippet && (
                      <p
                        className="text-sm text-gray-500 line-clamp-3 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: item.snippet }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8 pb-8">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 text-sm bg-[#1a1a1c] border border-gray-800 rounded-lg hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Προηγούμενη
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i;
                    } else if (page < 3) {
                      pageNum = i;
                    } else if (page > totalPages - 4) {
                      pageNum = totalPages - 7 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-9 h-9 text-sm rounded-lg transition-colors ${
                          page === pageNum
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                            : 'bg-[#1a1a1c] border border-gray-800 hover:border-gray-600 text-gray-400'
                        }`}
                      >
                        {pageNum + 1}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 text-sm bg-[#1a1a1c] border border-gray-800 rounded-lg hover:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Επόμενη
                </button>
              </div>
            )}

            {/* No results */}
            {!loading && results.length === 0 && query && (
              <div className="text-center py-20">
                <Scale className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                <p className="text-lg text-gray-400 mb-2">Δεν βρέθηκαν αποτελέσματα</p>
                <p className="text-sm text-gray-600">Δοκιμάστε διαφορετικούς όρους αναζήτησης ή αφαιρέστε κάποια φίλτρα</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* PDF Viewer Overlay */}
      {activePdfUrl && (
        <PdfViewer
          url={activePdfUrl}
          title={activePdfTitle}
          onClose={() => { setActivePdfUrl(null); setActivePdfTitle(null); }}
        />
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d0d0f] flex items-center justify-center">
        <div className="text-gray-500">Φόρτωση...</div>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
