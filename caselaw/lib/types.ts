export interface SearchResult {
  id: string;
  arithmos: string;
  titlos: string;
  katigoria: string[];
  ypokatigoria?: string[];
  organismos?: string[];
  snippet?: string;
  pdf_path: string;
  dikastirio?: string;
  etos?: number;
}

export interface FacetItem {
  value: string;
  count: number;
}

export interface Facets {
  katigoria: FacetItem[];
  ypokatigoria: FacetItem[];
  organismos: FacetItem[];
}
