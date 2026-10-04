export type ItemState = 'pending' | 'loaded' | 'flagged';
export type Temp = 'chilled' | 'ambient';
export type FlagKind = 'missing' | 'damaged' | 'short';

export interface LoadItem {
  id: string;
  name: string;
  detail: string;
  sku: string;
  temp: Temp;
  expected: number;
  unit: string;
  state: ItemState;
  flag?: { kind: FlagKind; found: number; sentAt: string };
}
export interface Stop {
  seq: number;
  outlet: string;
  name: string;
  dock: string;
  window: string;
  items: LoadItem[];
}
export interface Tag { label: string; tone: 'info' | 'warning' | 'danger' | 'neutral' }
export interface Trip {
  id: string;
  label: string; // vehicle id shown to the loader
  brand: 'Fresh' | 'Style' | 'Tech';
  district: string;
  depart: string;
  vehicle: string;
  bay: string;
  extra: string;
  tags: Tag[];
  planUpdated?: string;
  stops: Stop[];
}
