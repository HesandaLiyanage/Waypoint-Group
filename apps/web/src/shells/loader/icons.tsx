import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warn: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  truck: <><path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4 6.5l1 1 2-2M4 12l1 1 2-2M4 17.5l1 1 2-2" />,
  flag: <path d="M5 21V4M5 4.5h12l-2.5 4 2.5 4H5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.3" /></>,
  send: <path d="M21 3L10 14M21 3l-6.5 18-4-7-7-4z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></>,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />,
  box: <path d="M12 3l8.5 4.5v9L12 21l-8.5-4.5v-9zM3.5 7.5L12 12l8.5-4.5M12 12v9" />,
  xcircle: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  lines: <path d="M5 7h14M5 12h9M5 17h5" />,
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
