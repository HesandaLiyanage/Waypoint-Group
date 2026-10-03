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

const item = (id: string, name: string, detail: string, sku: string, temp: Temp, expected: number, unit: string, state: ItemState = 'loaded'): LoadItem =>
  ({ id, name, detail, sku, temp, expected, unit, state });

const milk: LoadItem = {
  ...item('i-milk', 'Whole milk, 12 × 1L', '6 crates · DA-1102', 'DA-1102', 'chilled', 6, 'crates', 'flagged'),
  flag: { kind: 'short', found: 4, sentAt: '5:52 PM' },
};

const veh014: Stop[] = [
  { seq: 6, outlet: 'OUT091', name: 'Maharagama', dock: 'Rear dock', window: '5:40 AM', items: [
    item('a1', 'Fresh eggs, 30 tray', '3 cartons · EG-3001', 'EG-3001', 'ambient', 3, 'cartons'),
    item('a2', 'Cooking oil, 5L', '4 cans · OL-2201', 'OL-2201', 'ambient', 4, 'cans'),
    item('a3', 'Butter, 500g', '2 crates · DA-1150', 'DA-1150', 'chilled', 2, 'crates')] },
  { seq: 5, outlet: 'OUT047', name: 'Kotte', dock: 'Rear-middle', window: '5:15 to 5:45 AM', items: [
    milk,
    item('i-yog', 'Yoghurt cups, 24 pack', '4 crates · DA-2040', 'DA-2040', 'chilled', 4, 'crates'),
    item('i-rice', 'Basmati rice, 25 kg', '10 bags · GR-3011', 'GR-3011', 'ambient', 10, 'bags')] },
  { seq: 4, outlet: 'OUT033', name: 'Nugegoda', dock: 'Street', window: '5:00 to 5:30 AM', items: [
    item('b1', 'Curd, 400g', '3 crates · DA-1300', 'DA-1300', 'chilled', 3, 'crates'),
    item('b2', 'Sugar, 1 kg', '12 packs · GR-1020', 'GR-1020', 'ambient', 12, 'packs')] },
  { seq: 3, outlet: 'OUT058', name: 'Dehiwala', dock: 'Rear dock', window: '4:40 to 5:10 AM', items: [
    item('c1', 'Dhal, 1 kg', '10 packs · GR-1105', 'GR-1105', 'ambient', 10, 'packs'),
    item('c2', 'Tea packets, 400g', '8 boxes · GR-4400', 'GR-4400', 'ambient', 8, 'boxes')] },
  { seq: 2, outlet: 'OUT012', name: 'Bambalapitiya', dock: 'Street', window: '4:20 to 4:50 AM', items: [
    item('d1', 'Fresh milk, 1L', '5 crates · DA-1101', 'DA-1101', 'chilled', 5, 'crates'),
    item('d2', 'Bread, sliced', '6 trays · BK-0101', 'BK-0101', 'ambient', 6, 'trays')] },
  { seq: 1, outlet: 'OUT004', name: 'Colombo Fort', dock: 'Rear dock', window: '4:00 to 4:30 AM', items: [
    item('e1', 'Cheese slices', '2 crates · DA-1500', 'DA-1500', 'chilled', 2, 'crates'),
    item('e2', 'Flour, 1 kg', '8 packs · GR-1300', 'GR-1300', 'ambient', 8, 'packs')] },
];

const mk = (prefix: string, rows: [string, string, string, number, string][], seqStart: number, state: ItemState): Stop[] =>
  rows.map((r, i) => ({
    seq: seqStart - i, outlet: r[0], name: r[1], dock: r[2], window: '',
    items: Array.from({ length: r[3] }, (_, k) => item(`${prefix}${i}${k}`, `${r[4]} ${k + 1}`, `${r[4]} · ${prefix.toUpperCase()}-${100 + i * 10 + k}`, `${prefix.toUpperCase()}-${100 + i * 10 + k}`, 'ambient', 1, 'units', state)),
  }));

export const initialTrips = (): Trip[] => [
  { id: 'VEH014', brand: 'Fresh', district: 'Colombo North', depart: '5:40 AM', vehicle: 'WP-CAD-8219', bay: 'Bay 03A', extra: 'Reefer +2.2°C',
    tags: [{ label: 'Chilled + ambient', tone: 'info' }], planUpdated: '6:12 PM', stops: veh014 },
  { id: 'VEH022', brand: 'Fresh', district: 'Gampaha', depart: '6:10 AM', vehicle: 'WP-NC-1044', bay: 'Bay 03B', extra: 'Reefer target +4°C',
    tags: [{ label: 'Chilled + ambient', tone: 'info' }],
    stops: mk('f', [['OUT071', 'Gampaha', 'Rear dock', 5, 'Grocery case'], ['OUT072', 'Ja-Ela', 'Street', 4, 'Grocery case'], ['OUT073', 'Wattala', 'Rear dock', 4, 'Grocery case'], ['OUT074', 'Kiribathgoda', 'Street', 4, 'Grocery case'], ['OUT075', 'Kelaniya', 'Rear dock', 4, 'Grocery case']], 5, 'pending') },
  { id: 'VEH027', brand: 'Style', district: 'Kandy', depart: '6:30 AM', vehicle: 'WP-ST-2107', bay: 'Bay 05B', extra: 'Mall dock 10:00 AM',
    tags: [{ label: 'Hanging rails', tone: 'warning' }, { label: 'Fragile', tone: 'warning' }],
    stops: mk('s', [['OUT101', 'Kandy City Centre', 'Mall bay', 5, 'Garment carton'], ['OUT102', 'Peradeniya', 'Mall bay', 4, 'Garment carton'], ['OUT103', 'Katugastota', 'Street', 5, 'Garment carton'], ['OUT104', 'Gampola', 'Street', 4, 'Garment carton']], 4, 'loaded') },
  { id: 'VEH031', brand: 'Tech', district: 'Galle', depart: '7:00 AM', vehicle: 'WP-TC-3310', bay: 'Bay 06A', extra: 'Sealed cage',
    tags: [{ label: 'High value', tone: 'danger' }, { label: 'Serial scan required', tone: 'info' }],
    stops: mk('t', [['OUT111', 'Galle', 'Rear dock', 2, 'Appliance'], ['OUT112', 'Hikkaduwa', 'Street', 2, 'Appliance'], ['OUT113', 'Ambalangoda', 'Street', 2, 'Appliance']], 3, 'pending') },
];
