// Mock data for the Store manager screens (matches the Figma design).
// TODO: replace with the real order, schedule and receipt endpoints.
export type ConsignmentStatus = 'in_transit' | 'deferred' | 'delivered';
export interface Sku { name: string; sku: string; crates: number; qty: string; telemetry: string; target: string; temp: string }
export interface Consignment {
  id: string;
  status: ConsignmentStatus;
  window: string;
  summary: string;
  crates: number;
  vehicle?: string;
  eta?: string;
  note: string;
  skus: Sku[];
}

export const consignments = (): Consignment[] => [
  { id: 'ORD0092308', status: 'in_transit', window: 'Today, 6:40 AM – 7:10 AM', summary: 'Dairy & Farm Produce', crates: 18, vehicle: 'VEH014 (Refrig 4T)', eta: '~18 mins away', note: 'Peliyagoda Central Cold Hub · Morning Replenishment Batch #COL-047-92308',
    skus: [
      { name: 'Organic Farm Fresh Whole Milk', sku: 'SKU-MK-0182', crates: 6, qty: '72 Liters', telemetry: '+3.2°C Active', target: '+2°C to +4°C', temp: 'chilled' },
      { name: 'Highland Curd Clay Pots', sku: 'SKU-CD-0914', crates: 4, qty: '60 Pots', telemetry: '+4.0°C Active', target: '+2°C to +4°C', temp: 'chilled' },
      { name: 'Grade A Farm Eggs', sku: 'SKU-EG-4401', crates: 5, qty: '150 Trays', telemetry: '18.0°C Buffer', target: 'Ambient (<20°C)', temp: 'ambient' },
      { name: 'Hydroponic Salad Greens', sku: 'SKU-VEG-8802', crates: 3, qty: '30 Bundles', telemetry: '+2.0°C Active', target: '+1°C to +3°C', temp: 'chilled' },
    ] },
  { id: 'ORD0092144', status: 'deferred', window: 'Rescheduled: Tomorrow morning (05:30 AM)', summary: 'Frozen Poultry & Chilled Dairy Line', crates: 12, note: 'Peliyagoda Central Cold Hub · Reallocated from Run #COL-047-92144',
    skus: [
      { name: 'Farm Fresh Frozen Whole Chicken', sku: 'POUL-FRZ-0081', crates: 4, qty: '48 Packs', telemetry: '-18.0°C Frozen Safe', target: '-18°C', temp: 'chilled' },
      { name: 'Highland Pasteurised Butter & Cheese', sku: 'DAIR-PAS-0422', crates: 5, qty: '60 Blocks', telemetry: '+3.0°C Chill Guard', target: '+3°C', temp: 'chilled' },
      { name: 'Farm Fresh Buffalo Curd Clay Pots', sku: 'DAIR-CRD-0199', crates: 3, qty: '45 Pots', telemetry: '+4.0°C Chill Guard', target: '+4°C', temp: 'chilled' },
    ] },
  { id: 'ORD0091880', status: 'delivered', window: 'Delivered yesterday at 7:05 AM', summary: 'Fresh Milk & Fruits', crates: 22, note: 'Manifest signed (OUT047)', skus: [] },
];

export const catalog = [
  { id: 'milk', name: 'Organic Farm Fresh Whole Milk (12 × 1L Crates)', sku: '#WPT-4402', title: 'Fresh Organic Dairy Crate Batch', blurb: 'Standardized 12-pack high-density distribution crates engineered for rapid dock intake and sensor tracking.', tag: 'Fresh Dairy', chill: '+3.2°C Chill Guard' },
  { id: 'curd', name: 'Highland Curd Clay Pots (15 × 400g Crates)', sku: '#WPT-4411', title: 'Highland Curd Pot Crate', blurb: 'Traditional clay-pot curd, packed 15 per crate for chilled transport.', tag: 'Fresh Dairy', chill: '+4.0°C Chill Guard' },
  { id: 'eggs', name: 'Grade A Farm Eggs (30 Tray Crates)', sku: '#WPT-4425', title: 'Farm Egg Tray Crate', blurb: 'Protected 30-egg trays, ambient buffer under 20°C.', tag: 'Fresh Produce', chill: '18.0°C Buffer' },
];

export const notificationsSeed = () => [
  { id: 'n1', icon: 'snow', title: 'Chilled order confirmed for tomorrow', body: 'Waypoint DC-2 verified stock allocations for dairy, produce, and deli racks.', ago: '18m ago', unread: true },
  { id: 'n2', icon: 'truck', title: 'Dry order dispatch scheduled', body: 'Vehicle loaded at Colombo Logistics Center; dock clearance active.', ago: '1h ago', unread: false },
];
export type Notice = ReturnType<typeof notificationsSeed>[number];
