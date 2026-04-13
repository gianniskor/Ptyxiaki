import type { FacetItem, Facets } from './types';

export function parseFacets(raw: Record<string, any[]>): Facets {
  const parse = (arr: any[] = []): FacetItem[] => {
    const items: FacetItem[] = [];
    for (let i = 0; i < arr.length; i += 2) {
      if (arr[i + 1] > 0) {
        items.push({ value: String(arr[i]), count: arr[i + 1] });
      }
    }
    return items.sort((a, b) => b.count - a.count);
  };
  return {
    dikastirio: parse(raw.dikastirio),
    etos: parse(raw.etos),
    katigoria: parse(raw.katigoria),
  };
}

export function buildPdfUrl(pdfPath: string, katigoria: string[], query: string): string {
  const primaryCategory = katigoria?.[0] || 'Άγνωστο';
  return `http://localhost:8000/pdf/${primaryCategory}/${pdfPath}#search=${query}`;
}
