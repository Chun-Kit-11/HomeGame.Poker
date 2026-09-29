/** Minimal stroke icon set (24px grid, currentColor). */
type P = { className?: string };
const base = (className = 'h-5 w-5') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const ChevronLeft = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const Copy = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </svg>
);
export const Volume = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
  </svg>
);
export const VolumeOff = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </svg>
);
export const Chat = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
  </svg>
);
export const History = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </svg>
);
export const Wallet = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M20 7H5a2 2 0 010-4h13v4" />
    <path d="M3 5v14a2 2 0 002 2h15V7" />
    <circle cx="16" cy="14" r="1.2" fill="currentColor" />
  </svg>
);
export const Shield = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const Chart = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
export const Download = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </svg>
);
export const Logout = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M15 17l5-5-5-5M20 12H9M11 21H5a2 2 0 01-2-2V5a2 2 0 012-2h6" />
  </svg>
);
export const Plus = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Users = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6" />
  </svg>
);
export const Crown = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
  </svg>
);
export const Settings = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
);
export const ArrowRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const Close = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
export const Lock = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);
export const Share = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
  </svg>
);
export const Incognito = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 11h18M5.5 11l1.8-5.4A1.5 1.5 0 018.7 4.5h6.6a1.5 1.5 0 011.4 1.1L18.5 11" />
    <circle cx="7.5" cy="16.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
    <path d="M10 16.5c1.3-.8 2.7-.8 4 0" />
  </svg>
);
export const SkipBack = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 5v14M18 6l-8 6 8 6" />
  </svg>
);
export const SkipForward = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M18 5v14M6 6l8 6-8 6" />
  </svg>
);
export const ChevronRight = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);
