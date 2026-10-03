import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  plus: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  box: <path d="M12 3l8.5 4.5v9L12 21l-8.5-4.5v-9zM3.5 7.5L12 12l8.5-4.5M12 12v9" />,
  archive: <><rect x="3.5" y="4" width="17" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />,
  truck: <><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  bell: <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 004 0" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.3 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkc: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z" />,
  print: <path d="M7 9V3.5h10V9M7 17H4.5v-8h15v8H17M7 14h10v6.5H7z" />,
  download: <path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14" />,
  lock: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></>,
  alert: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  route: <><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8 18h7a3 3 0 000-6H9a3 3 0 010-6h7" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5" />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2" />,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
