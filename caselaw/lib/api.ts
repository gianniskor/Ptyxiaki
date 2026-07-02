import type { FacetItem, Facets } from './types';

function sortByNumPrefix(a: FacetItem, b: FacetItem): number {
  const parse = (s: string) => {
    const m = s.match(/^(\d+)\.?(\d*)/);
    return m ? [parseInt(m[1]), parseInt(m[2] || '0')] : [Infinity, 0];
  };
  const [a1, a2] = parse(a.value);
  const [b1, b2] = parse(b.value);
  return a1 !== b1 ? a1 - b1 : a2 - b2;
}

export function parseFacets(raw: Record<string, any[]>): Facets {
  const parse = (arr: any[] = []): FacetItem[] => {
    const items: FacetItem[] = [];
    for (let i = 0; i < arr.length; i += 2) {
      if (arr[i + 1] > 0) {
        items.push({ value: String(arr[i]), count: arr[i + 1] });
      }
    }
    return items;
  };
  return {
    katigoria:    parse(raw.katigoria).sort(sortByNumPrefix),
    ypokatigoria: parse(raw.ypokatigoria).sort((a, b) => b.count - a.count),
    organismos:   parse(raw.organismos).sort((a, b) => b.count - a.count),
  };
}

export function buildPdfUrl(pdfPath: string, _katigoria: string[], query: string): string {
  const encoded = pdfPath.split('/').map(encodeURIComponent).join('/');
  const base = `http://localhost:8000/pdf/${encoded}`;
  // Append the PDF Open Parameter `#search=` so the browser's native PDF viewer
  // jumps to and highlights the first occurrence of the search term automatically.
  const term = (query || '').trim();
  if (term && term !== '*') {
    return `${base}#search=${encodeURIComponent(term)}`;
  }
  return base;
}

export const truncateAtDots = (name: string): string =>
  name.replace(/\s*\.{2,}.*$/, '').trim();

export async function fetchHierarchy(): Promise<Record<string, string[]>> {
  try {
    const res = await fetch('http://localhost:8000/api/hierarchy');
    return res.ok ? res.json() : {};
  } catch {
    return {};
  }
}

/**
 * Fetch the full, unfiltered set of facet values (master list). Used so that
 * facet options never disappear when filters are applied — only their counts change.
 */
export async function fetchGlobalFacets(): Promise<Facets> {
  const empty: Facets = { katigoria: [], ypokatigoria: [], organismos: [] };
  try {
    const res = await fetch('http://localhost:8000/api/facets');
    if (!res.ok) return empty;
    const data = await res.json();
    const toItems = (obj: Record<string, number> = {}): FacetItem[] =>
      Object.entries(obj).map(([value, count]) => ({ value, count: Number(count) }));
    return {
      katigoria:    toItems(data.katigoria).sort(sortByNumPrefix),
      ypokatigoria: toItems(data.ypokatigoria).sort((a, b) => b.count - a.count),
      organismos:   toItems(data.organismos).sort((a, b) => b.count - a.count),
    };
  } catch {
    return empty;
  }
}

/**
 * Merge a master (full) facet list with the live counts from the current search,
 * so every option stays visible. Options absent from the live results show count 0.
 */
export function mergeFacetCounts(master: FacetItem[], live: FacetItem[]): FacetItem[] {
  const liveMap = new Map(live.map(i => [i.value, i.count]));
  return master.map(i => ({ value: i.value, count: liveMap.get(i.value) ?? 0 }));
}
