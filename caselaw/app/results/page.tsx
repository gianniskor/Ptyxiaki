"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { ListBox, Surface, Label, Description, Card } from '@heroui/react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, FileText, X, Scale, Filter,
  Landmark, Calendar, Tag as TagIcon
} from 'lucide-react';
import { PdfViewer } from '@/components/PdfViewer';
import { AuthButton } from '@/components/AuthButton';
import { AdminNavLink } from '@/components/AdminNavLink';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';
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
  const [filterDikastirio, setFilterDikastirio] = useState<string[]>(searchParams.getAll('dikastirio'));
  const [filterEtos, setFilterEtos] = useState<string[]>(searchParams.getAll('etos'));
  const [filterKatigoria, setFilterKatigoria] = useState<string[]>(searchParams.getAll('katigoria'));

  // PDF viewer
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string | null>(null);



  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query.trim() || '*', rows: String(rows), page: String(page) });
      filterDikastirio.forEach(d => params.append('dikastirio', d));
      filterEtos.forEach(e => params.append('etos', e));
      filterKatigoria.forEach(k => params.append('katigoria', k));

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
    filterDikastirio.forEach(d => params.append('dikastirio', d));
    filterEtos.forEach(e => params.append('etos', e));
    filterKatigoria.forEach(k => params.append('katigoria', k));
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
      setFilterDikastirio(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    } else if (type === 'etos') {
      setFilterEtos(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    } else {
      setFilterKatigoria(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    }
  };

  const clearAllFilters = () => {
    setFilterDikastirio([]);
    setFilterEtos([]);
    setFilterKatigoria([]);
    setPage(0);
  };

  const hasActiveFilters = filterDikastirio.length > 0 || filterEtos.length > 0 || filterKatigoria.length > 0;
  const totalPages = Math.ceil(total / rows);

  const categoryChipClass = (_cat: string) => 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'

  const renderFacetSection = (
    title: string,
    icon: React.ReactNode,
    items: FacetItem[],
    selectedValues: string[],
    onSelectionChange: (values: string[]) => void
  ) => (
    <Surface className="rounded-2xl p-3">
      <div className="flex items-center gap-2 px-2 pb-2 text-sm font-semibold text-gray-300">
        {icon}
        {title}
      </div>
      <ListBox
        aria-label={title}
        selectionMode="multiple"
        selectedKeys={new Set(selectedValues)}
        onSelectionChange={(keys) => {
          if (keys !== 'all') onSelectionChange([...keys] as string[])
        }}
      >
        {items.slice(0, 12).map(item => (
          <ListBox.Item key={item.value} id={item.value} textValue={item.value}>
            <div className="flex items-center justify-between w-full min-w-0 gap-2">
              <Label className="truncate">{item.value}</Label>
              <Description className="shrink-0">{item.count}</Description>
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        ))}
      </ListBox>
    </Surface>
  );

  return (
    <div className="min-h-screen text-white font-sans relative overflow-x-hidden selection:bg-yellow-500/30" data-theme="dark">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <BackgroundGradientAnimation interactive />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* --- NAVBAR --- */}
      <nav className="sticky top-0 z-30 backdrop-blur-md ">
        <div className="flex items-center px-8 py-6 max-w-7xl mx-auto">
          <div className="flex-1 flex items-center gap-3">
            <Scale className="w-8 h-8 text-white" />
            <span className="text-xl font-bold tracking-wider">PLACEHOLDER</span>
          </div>

          <div className="hidden md:flex bg-[#1a1a1c]/80 backdrop-blur-sm border border-gray-800 rounded-full shadow-lg p-1">
            <button onClick={() => router.push('/')} className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">Αρχική</button>
            <button className="px-6 py-2.5 rounded-full bg-white text-black text-sm font-medium">Αρχείο</button>
            <button className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">AI Chatbot</button>
            <AdminNavLink />
          </div>

          <div className="flex-1 flex items-center justify-end gap-6">
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* Search Bar */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-8 pb-4">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center bg-[#151518] border border-gray-700/50 hover:border-yellow-500/50 focus-within:border-yellow-500/50 rounded-full px-6 py-3.5 shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300">
            <Search className="w-5 h-5 mr-4 text-yellow-500/80" />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Αναζήτηση αποφάσεων, δικαστήρια, θέματα..."
              className="flex-1 bg-transparent border-none outline-none text-lg text-white placeholder-gray-500"
            />
            {inputValue && (
              <button type="button" onClick={() => { setInputValue(''); setQuery(''); }} className="p-1 hover:bg-[#333] rounded-full">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {/* Results info & active filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-gray-400">
              {loading ? 'Αναζήτηση...' : (
                total > 0
                  ? <><span className="text-white font-bold">{total}</span> αποτελέσματα{query ? <> για «<span className="text-yellow-400">{query}</span>»</> : ''}</>
                  : (query || hasActiveFilters) ? `Δεν βρέθηκαν αποτελέσματα${query ? ` για «${query}»` : ''}` : ''
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
            {filterDikastirio.map(d => (
              <span key={d} className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Landmark className="w-3 h-3" /> {d}
                <button onClick={() => setFilterDikastirio(prev => prev.filter(v => v !== d))}><X className="w-3 h-3" /></button>
              </span>
            ))}
            {filterKatigoria.map(k => (
              <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <TagIcon className="w-3 h-3" /> {k}
                <button onClick={() => setFilterKatigoria(prev => prev.filter(v => v !== k))}><X className="w-3 h-3" /></button>
              </span>
            ))}
            {filterEtos.map(e => (
              <span key={e} className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Calendar className="w-3 h-3" /> {e}
                <button onClick={() => setFilterEtos(prev => prev.filter(v => v !== e))}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar - Facets */}
          <aside className="hidden lg:block w-64 shrink-0" data-theme="dark">
            <div className="sticky top-[90px] space-y-3">
              <div className="flex items-center gap-2 px-1 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <Filter className="w-3.5 h-3.5" /> Φίλτρα
              </div>
              {renderFacetSection('Κατηγορία', <TagIcon className="w-4 h-4 text-yellow-500/70" />, facets.katigoria, filterKatigoria, (v) => { setPage(0); setFilterKatigoria(v) })}
              {renderFacetSection('Δικαστήριο', <Landmark className="w-4 h-4 text-yellow-500/70" />, facets.dikastirio, filterDikastirio, (v) => { setPage(0); setFilterDikastirio(v) })}
              {renderFacetSection('Έτος', <Calendar className="w-4 h-4 text-yellow-500/70" />, facets.etos, filterEtos, (v) => { setPage(0); setFilterEtos(v) })}
            </div>
          </aside>

          {/* Results List */}
          <main className="flex-1 min-w-0">
            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <div className="h-4 bg-white/10 rounded-lg w-1/3 mb-2" />
                    <div className="h-3 bg-white/5 rounded-lg w-full mb-1" />
                    <div className="h-3 bg-white/5 rounded-lg w-2/3" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer group hover:bg-surface-hover transition-colors"
                    onClick={() => handleResultClick(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-yellow-500/10 rounded-lg shrink-0">
                          <FileText className="w-4 h-4 text-yellow-500" />
                        </div>
                        <div>
                          <span className="text-base font-bold text-foreground group-hover:text-yellow-400 transition-colors">
                            {item.arithmos}
                          </span>
                          <p className="text-xs text-muted mt-0.5">{item.dikastirio} • {item.etos}</p>
                        </div>
                      </div>
                      {item.katigoria?.length > 0 && (
                        <div className="flex flex-wrap gap-1 shrink-0">
                          {item.katigoria.map(cat => (
                            <span key={cat} className={`text-xs px-2 py-0.5 rounded-full font-medium border ${categoryChipClass(cat)}`}>{cat}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Card.Header>
                      <Card.Title className="text-gray-300 line-clamp-1 font-normal">{item.titlos}</Card.Title>
                      {item.snippet && (
                        <p
                          className="text-sm text-muted line-clamp-3 leading-relaxed mt-1"
                          dangerouslySetInnerHTML={{ __html: item.snippet }}
                        />
                      )}
                    </Card.Header>
                  </Card>
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
            {!loading && results.length === 0 && (query || hasActiveFilters) && (
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Φόρτωση...</div>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
