import type { Locale } from '@waypoint/i18n';

// Operational menu configuration; each role's screens are implemented separately.
export type OperationalRole = 'dispatcher' | 'loader' | 'driver' | 'store_manager';
export interface NavigationItem {
  id: string;
  href: string;
  label: Record<Locale, string>;
}
const item = (role: OperationalRole, id: string, en: string, si: string, ta: string): NavigationItem => ({
  id, href: `#/${role}/${id}`, label: { en, si, ta },
});
export const roleNavigation: Record<OperationalRole, NavigationItem[]> = {
  dispatcher: [
    item('dispatcher', 'home', 'Home', 'මුල් පිටුව', 'முகப்பு'),
    item('dispatcher', 'orders', 'Order Queue', 'ඇණවුම් පෝලිම', 'ஆர்டர் வரிசை'),
    item('dispatcher', 'allocation', 'Allocation Plan', 'වෙන්කිරීමේ සැලැස්ම', 'ஒதுக்கீட்டுத் திட்டம்'),
    item('dispatcher', 'deferrals', 'Deferral Review', 'කල්දැමීම් සමාලෝචනය', 'ஒத்திவைப்பு ஆய்வு'),
    item('dispatcher', 'tracking', 'Live Tracking', 'සජීවී ලුහුබැඳීම', 'நேரடிக் கண்காணிப்பு'),
    item('dispatcher', 'capacity', 'Capacity Planning', 'ධාරිතා සැලසුම්කරණය', 'கொள்ளளவுத் திட்டம்'),
  ],
  loader: [item('loader', 'trips', 'Trips', 'ගමන් වාර', 'பயணங்கள்'), item('loader', 'loading', 'Loading', 'පැටවීම', 'ஏற்றுதல்'), item('loader', 'issues', 'Issues', 'ගැටලු', 'சிக்கல்கள்')],
  driver: [item('driver', 'route', 'My Route', 'මගේ මාර්ගය', 'எனது பாதை'), item('driver', 'stop', 'Current Stop', 'වත්මන් නැවතුම', 'தற்போதைய நிறுத்தம்'), item('driver', 'issues', 'Issues', 'ගැටලු', 'சிக்கல்கள்')],
  // Store manager header: four tabs. Telemetry opens live delivery tracking; Exceptions opens the deferral notice.
  store_manager: [
    { id: 'receiving', href: '#/store_manager/home', label: { en: 'Receiving Manifest', si: 'ලැබීමේ මැනිෆෙස්ට්', ta: 'பெறுதல் மேனிஃபெஸ்ட்' } },
    { id: 'telemetry', href: '#/store_manager/track', label: { en: 'Cold Chain Telemetry', si: 'ශීත දාම ටෙලිමෙට්‍රි', ta: 'குளிர் சங்கிலி டெலிமெட்ரி' } },
    { id: 'exceptions', href: '#/store_manager/deferral', label: { en: 'Exceptions & Shortages', si: 'ව්‍යතිරේක සහ හිඟකම්', ta: 'விதிவிலக்குகள் & பற்றாக்குறைகள்' } },
    { id: 'audits', href: '#/store_manager/audits', label: { en: 'Stock Audits', si: 'තොග විගණන', ta: 'இருப்பு தணிக்கைகள்' } },
  ],
};
