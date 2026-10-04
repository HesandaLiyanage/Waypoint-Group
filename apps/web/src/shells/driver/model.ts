export type StopStatus = 'pending' | 'arrived' | 'delivered' | 'received_with_discrepancy';
export type CargoItem = { sku: string; name: string; expected: number; temperature: 'Chilled' | 'Ambient' };
export type DriverStop = { id: string; outletId: string; name: string; district: string; window: string; access: string; dock: string; plannedArrival: string; items: CargoItem[] };
export type DriverTrip = { id: string; vehicleId: string; vehicleType: string; depot: string; date: string; planVersion: number; weightCapacity: number; volumeCapacity: number; stops: DriverStop[] };
export type Issue = { id: string; stopId: string; category: string; note: string; photo?: File; createdAt: string };
export type Receipt = { stopId: string; recipient: string; quantities: Record<string, number>; note: string; outcome: 'delivered' | 'received_with_discrepancy'; recordedAt: string };
export function validQuantities(items: CargoItem[], quantities: Record<string, number>) {
  return items.every(item => Number.isInteger(quantities[item.sku]) && quantities[item.sku] >= 0 && quantities[item.sku] <= item.expected);
}
export function receiptOutcome(items: CargoItem[], quantities: Record<string, number>): Receipt['outcome'] {
  return items.some(item => quantities[item.sku] !== item.expected) ? 'received_with_discrepancy' : 'delivered';
}
