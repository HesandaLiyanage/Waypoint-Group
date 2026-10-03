import { useEffect, useState } from 'react';
import type { NavigationItem } from '../../components/common';

// Hash routes for the Store manager: #/store_manager/<route>
export type StoreRoute = 'home' | 'new-order' | 'inbound' | 'deferral' | 'track' | 'confirmed' | 'audits' | 'receipt' | 'report' | 'reported';
const known: StoreRoute[] = ['home', 'new-order', 'inbound', 'deferral', 'track', 'confirmed', 'audits', 'receipt', 'report', 'reported'];

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

// Her four header tabs (Figma). Home, order, inbound and confirmation live under "Receiving Manifest".
export const storeNavigation: NavigationItem[] = [
  { id: 'receiving', href: '#/store_manager/home', label: { en: 'Receiving Manifest', si: 'ලැබීමේ මැනිෆෙස්ට්', ta: 'பெறுதல் மேனிஃபெஸ்ட்' } },
  { id: 'telemetry', href: '#/store_manager/track', label: { en: 'Cold Chain Telemetry', si: 'ශීත දාම ටෙලිමෙට්‍රි', ta: 'குளிர் சங்கிலி டெலிமெட்ரி' } },
  { id: 'exceptions', href: '#/store_manager/deferral', label: { en: 'Exceptions & Shortages', si: 'ව්‍යතිරේක සහ හිඟකම්', ta: 'விதிவிலக்குகள் & பற்றாக்குறைகள்' } },
  { id: 'audits', href: '#/store_manager/audits', label: { en: 'Stock Audits', si: 'තොග විගණන', ta: 'இருப்பு தணிக்கைகள்' } },
];
export const storeActiveId = (route: StoreRoute): string =>
  route === 'track' ? 'telemetry' : route === 'deferral' || route === 'report' || route === 'reported' ? 'exceptions' : route === 'audits' ? 'audits' : 'receiving';
