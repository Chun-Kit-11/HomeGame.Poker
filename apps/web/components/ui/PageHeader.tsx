import Link from 'next/link';
import { ChevronLeft } from './Icons';

/** Consistent page header with back button, title and actions. */
export function PageHeader({ back, title, subtitle, actions }: { back?: string; title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 pb-2">
      {back && (
        <Link href={back} className="icon-btn" aria-label="Back">
          <ChevronLeft />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold">{title}</h1>
        {subtitle && <p className="truncate text-sm text-white/50">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center">
      <div className="flex items-center gap-3 text-sm text-white/50">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-gold" />
        {label}…
      </div>
    </main>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl bg-black/25 p-3 ring-1 ring-inset ring-white/[0.06]">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold tabular ${tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-red-400' : ''}`}>{value}</div>
    </div>
  );
}
