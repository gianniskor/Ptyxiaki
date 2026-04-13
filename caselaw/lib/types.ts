export interface SearchResult {
  id: string;
  arithmos: string;
  dikastirio: string;
  etos: number;
  titlos: string;
  katigoria: string[];
  snippet?: string;
  pdf_path: string;
}

export interface FacetItem {
  value: string;
  count: number;
}

export interface Facets {
  dikastirio: FacetItem[];
  etos: FacetItem[];
  katigoria: FacetItem[];
}
