/** Logo mark + wordmark. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <div className={`${className} grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#f3dc9c] via-[#d8b25f] to-[#9c7630] shadow-[0_8px_24px_-10px_rgba(227,193,115,0.8)] ring-1 ring-inset ring-white/40`}>
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%] fill-[#15110a]">
        <path d="M12 2C9 6 4 8.5 4 13a4 4 0 007 2.6L10 20h4l-1-4.4A4 4 0 0020 13c0-4.5-5-7-8-11z" />
      </svg>
    </div>
  );
}

export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark className={size === 'lg' ? 'h-12 w-12' : 'h-9 w-9'} />
      <div className="leading-none">
        <div className={`font-display font-extrabold tracking-tight ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>Home Game</div>
        <div className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold/80 ${size === 'md' ? 'hidden sm:block' : ''}`}>Private poker club</div>
      </div>
    </div>
  );
}
