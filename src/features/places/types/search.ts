export interface SearchIntent {
  query: string;
  intent: 'search' | 'filter' | 'recommend';
  categories?: string[];
  location?: string;
  preferences?: string[];
  priceRange?: string;
}
