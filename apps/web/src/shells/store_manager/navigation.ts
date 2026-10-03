import { useEffect, useState } from 'react';
import { roleNavigation, type NavigationItem } from '../../components/common';

// Hash routes for the Store manager: #/store_manager/<route>
export type StoreRoute = 'home' | 'new-order' | 'inbound' | 'deferral' | 'track' | 'confirmed' | 'audits' | 'receipt' | 'report' | 'reported' | 'telemetry' | 'received';
const known: StoreRoute[] = ['home', 'new-order', 'inbound', 'deferral', 'track', 'confirmed', 'audits', 'receipt', 'report', 'reported', 'telemetry', 'received'];

const parse = (): StoreRoute => {
  const m = window.location.hash.match(/^#\/store_manager\/([\w-]+)/);
  return m && (known as string[]).includes(m[1]) ? (m[1] as StoreRoute) : 'home';
};
export function useStoreRoute(): StoreRoute {
  const [route, setRoute] = useState<StoreRoute>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
export const go = (route: StoreRoute) => { window.location.hash = `#/store_manager/${route}`; };

// The four header tabs live in components/common/navigation.ts (single source for the whole app).
export const storeNavigation: NavigationItem[] = roleNavigation.store_manager;
// The highlighted tab follows the page (her Figma left it on "Receiving Manifest" everywhere).
export const storeActiveId = (route: StoreRoute): string => {
  switch (route) {
    case 'track': case 'telemetry': return 'telemetry';
    case 'deferral': case 'report': case 'reported': return 'exceptions';
    case 'audits': return 'audits';
    default: return 'receiving'; // home, new-order, inbound, receipt, confirmed, received
  }
};
