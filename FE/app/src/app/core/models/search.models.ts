export interface GlobalSearchItem {
  id: string;
  category: 'phone' | 'accessory' | 'customer' | 'sale' | 'supplier';
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'success' | 'warning' | 'danger' | 'primary' | 'secondary' | 'info';
  price?: number;
  route: string;
  queryParams?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface GlobalSearchResults {
  phones: GlobalSearchItem[];
  accessories: GlobalSearchItem[];
  customers: GlobalSearchItem[];
  sales: GlobalSearchItem[];
  suppliers: GlobalSearchItem[];
  totalCount: number;
}
