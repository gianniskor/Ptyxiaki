"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Card } from '@heroui/react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search, X, Scale, Filter,
  Landmark, Tag as TagIcon, Building2
} from 'lucide-react';
import { PdfViewer } from '@/components/PdfViewer';
import { AuthButton } from '@/components/AuthButton';
import { AdminNavLink } from '@/components/AdminNavLink';
import { FileTypeIcon, getFileTypeStyle, stripFileExtension } from '@/components/FileTypeIcon';
import { BackgroundGradientAnimation } from '@/components/ui/background-gradient-animation';
import { buildPdfUrl, parseFacets, truncateAtDots, fetchHierarchy, fetchGlobalFacets, mergeFacetCounts } from '@/lib/api';
import { API_BASE_URL } from '@/lib/constants';
import { FacetSection, SubcategorySection } from '@/components/Facets';
import type { SearchResult, Facets } from '@/lib/types';

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialQuery = searchParams.get('q') || '';

  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets>({ katigoria: [], ypokatigoria: [], organismos: [] });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(Number(searchParams.get('page')) || 0);
  const rows = 10;

  // Active filters
  const [filterYpokatigoria, setFilterYpokatigoria] = useState<string[]>(searchParams.getAll('ypokatigoria'));
  const [filterOrganismos, setFilterOrganismos] = useState<string[]>(searchParams.getAll('organismos'));
  const [filterKatigoria, setFilterKatigoria] = useState<string[]>(searchParams.getAll('katigoria'));
  const [hierarchy, setHierarchy] = useState<Record<string, string[]>>({});
  const [globalFacets, setGlobalFacets] = useState<Facets>({ katigoria: [], ypokatigoria: [], organismos: [] });

  // PDF viewer
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePdfTitle, setActivePdfTitle] = useState<string | null>(null);



  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query.trim() || '*', rows: String(rows), page: String(page) });
      filterYpokatigoria.forEach(y => params.append('ypokatigoria', y));
      filterOrganismos.forEach(o => params.append('organismos', o));
      filterKatigoria.forEach(k => params.append('katigoria', k));

      const res = await fetch(`${API_BASE_URL}/api/search?${params}`);
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
  }, [query, page, filterYpokatigoria, filterOrganismos, filterKatigoria]);

  useEffect(() => {
    doSearch();
  }, [doSearch]);

  useEffect(() => {
    fetchHierarchy().then(setHierarchy).catch(() => {});
  }, []);

  useEffect(() => {
    fetchGlobalFacets().then(setGlobalFacets).catch(() => {});
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    filterYpokatigoria.forEach(y => params.append('ypokatigoria', y));
    filterOrganismos.forEach(o => params.append('organismos', o));
    filterKatigoria.forEach(k => params.append('katigoria', k));
    if (page > 0) params.set('page', String(page));
    router.replace(`/results?${params.toString()}`, { scroll: false });
  }, [query, filterYpokatigoria, filterOrganismos, filterKatigoria, page, router]);

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

  const toggleFilter = (type: 'ypokatigoria' | 'organismos' | 'katigoria', value: string) => {
    setPage(0);
    if (type === 'ypokatigoria') {
      setFilterYpokatigoria(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    } else if (type === 'organismos') {
      setFilterOrganismos(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    } else {
      setFilterKatigoria(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    }
  };

  const clearAllFilters = () => {
    setFilterYpokatigoria([]);
    setFilterOrganismos([]);
    setFilterKatigoria([]);
    setPage(0);
  };

  const hasActiveFilters = filterYpokatigoria.length > 0 || filterOrganismos.length > 0 || filterKatigoria.length > 0;
  const totalPages = Math.ceil(total / rows);

  // Facet counts only refresh to reflect the filtered results when a subcategory
  // or an organisation is selected, otherwise they keep the full master counts.
  const useLiveCounts = filterYpokatigoria.length > 0 || filterOrganismos.length > 0;
  // When a category is picked, the organisations and subcategories also refresh
  // their counts to reflect the category-filtered results.
  const catPicked = filterKatigoria.length > 0;

  // Facet options always reflect the full master list (so they never disappear),
  // with counts taken from the current search results (only when useLiveCounts).
  const katigoriaItems = (useLiveCounts
    ? mergeFacetCounts(globalFacets.katigoria, facets.katigoria)
    : globalFacets.katigoria).filter(i => i.count > 0);
  let organismosItems = (useLiveCounts || catPicked
    ? mergeFacetCounts(globalFacets.organismos, facets.organismos)
    : globalFacets.organismos).filter(i => i.count > 0);

  // When a category is picked, only show organisations associated with the
  // selected categories (i.e. those present in the category-filtered results).
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
    <div className="min-h-screen text-white font-sans relative selection:bg-yellow-500/30" data-theme="dark">
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
            <button onClick={() => router.push('/chatbot')} className="px-6 py-2.5 rounded-full text-gray-400 hover:text-white transition text-sm font-medium">AI Chatbot</button>
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
          <div className="flex items-center bg-[#151518] border border-gray-700/50 hover:border-yellow-500/50 focus-within:border-yellow-500/50 rounded-full px-6 py-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all duration-300">
            <Search className="w-6 h-6 mr-4 text-yellow-500/80" />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Αναζήτηση αποφάσεων, δικαστήρια, θέματα..."
              className="flex-1 bg-transparent border-none outline-none text-xl text-white placeholder-gray-500"
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
            {filterYpokatigoria.map(y => (
              <span key={y} className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Landmark className="w-3 h-3" /> {truncateAtDots(y)}
                <button onClick={() => setFilterYpokatigoria(prev => prev.filter(v => v !== y))}><X className="w-3 h-3" /></button>
              </span>
            ))}
            {filterKatigoria.map(k => (
              <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <TagIcon className="w-3 h-3" /> {truncateAtDots(k)}
                <button onClick={() => setFilterKatigoria(prev => prev.filter(v => v !== k))}><X className="w-3 h-3" /></button>
              </span>
            ))}
            {filterOrganismos.map(o => (
              <span key={o} className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/15 text-yellow-400 rounded-full text-xs border border-yellow-500/30">
                <Building2 className="w-3 h-3" /> {o}
                <button onClick={() => setFilterOrganismos(prev => prev.filter(v => v !== o))}><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-6">
          {/* Sidebar - Facets */}
          <aside className="hidden lg:block w-72 shrink-0" data-theme="dark">
            <div className="sticky top-[90px] space-y-3">
              <div className="flex items-center gap-2 px-1 text-sm font-bold text-gray-400 uppercase tracking-wider">
                <Filter className="w-4 h-4" /> Φίλτρα
              </div>
              <FacetSection
                title="Κατηγορία"
                icon={<TagIcon className="w-4 h-4 text-yellow-500/70" />}
                items={katigoriaItems}
                selectedValues={filterKatigoria}
                onToggle={(v) => toggleFilter('katigoria', v)}
                displayTransform={truncateAtDots}
              />
              <SubcategorySection
                groups={subGroups}
                selectedValues={filterYpokatigoria}
                onToggle={(v) => toggleFilter('ypokatigoria', v)}
              />
              <FacetSection
                title="Οργανισμός"
                icon={<Building2 className="w-4 h-4 text-yellow-500/70" />}
                items={organismosItems}
                selectedValues={filterOrganismos}
                onToggle={(v) => toggleFilter('organismos', v)}
              />
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
                {results.map((item) => {
                  const fileColor = getFileTypeStyle(item.pdf_path).color;
                  return (
                  <Card
                    key={item.id}
                    className="cursor-pointer group hover:bg-surface-hover transition-colors border border-transparent hover:[border-color:var(--file-color)]"
                    style={{ ['--file-color' as string]: fileColor } as React.CSSProperties}
                    onClick={() => handleResultClick(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <FileTypeIcon fileName={item.pdf_path} className="w-4 h-4" />
                        <div>
                          <span className="text-base font-bold text-foreground transition-colors">
                            {stripFileExtension(item.arithmos)}
                          </span>
                          {item.organismos && item.organismos.length > 0 && (
                            <p className="text-xs text-muted mt-0.5">{item.organismos.join(', ')}</p>
                          )}
                        </div>
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
                  );
                })}
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
