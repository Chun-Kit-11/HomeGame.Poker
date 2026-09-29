'use client';
import { useId } from 'react';
import type { TableTheme } from '@/lib/display';

/**
 * The rail and felt of a table design: rail finish and trim, printed felt pattern,
 * betting line and a crest in the middle. `pad` is the rail thickness in px.
 * The caller positions it with `className` (e.g. "absolute inset-x-[5%] ...").
 */
export function TableSurface({ theme, pad, crestPx, className = '' }: { theme: TableTheme; pad: number; crestPx: number; className?: string }) {
  const trim = Math.max(1, Math.round(pad / 6));
  return (
    <div className={`rounded-full shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] ${className}`} style={{ background: theme.rail, padding: pad }}>
      {/* Rail sheen: light from above */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_22%,transparent_78%,rgba(0,0,0,0.35))] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_4px_rgba(0,0,0,0.5)]" />
      <RailTrim theme={theme} pad={pad} trim={trim} />

      <div className="relative h-full w-full overflow-hidden rounded-full shadow-[inset_0_0_70px_rgba(0,0,0,0.6),inset_0_0_0_2px_rgba(0,0,0,0.45)]" style={{ background: theme.felt }}>
        {/* Printed pattern, fading towards the middle so the board stays clean */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: theme.pattern,
            backgroundSize: theme.patternSize,
            opacity: theme.patternOpacity,
            maskImage: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.35) 20%, #000 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.35) 20%, #000 75%)',
          }}
        />
        {/* Betting line */}
        <div
          className="absolute inset-[5%] rounded-full"
          style={{ borderColor: theme.line, borderStyle: theme.lineStyle, borderWidth: theme.lineStyle === 'double' ? 4 : 2 }}
        />
        {/* Crest in the centre (behind the board) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: crestPx, height: crestPx }}>
          <Crest color={theme.crest} />
        </div>
        {/* Felt grain + a soft spotlight */}
        <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:3px_3px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(255,255,255,0.07),transparent_60%)]" />
      </div>
    </div>
  );
}

function RailTrim({ theme, pad, trim }: { theme: TableTheme; pad: number; trim: number }) {
  const c = theme.railDetailColor;
  if (theme.railDetail === 'studs') {
    // A ring of round studs along the middle of the rail
    const size = Math.max(2, Math.round(pad * 0.32));
    return (
      <div
        className="pointer-events-none absolute rounded-full"
        style={{ inset: pad / 2 - size / 2, border: `${size}px dotted ${c}`, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}
      />
    );
  }
  if (theme.railDetail === 'stitch') {
    return (
      <>
        <div className="pointer-events-none absolute rounded-full" style={{ inset: pad * 0.22, border: `${trim}px dashed ${c}` }} />
        <div className="pointer-events-none absolute rounded-full" style={{ inset: pad * 0.78 - trim, border: `${trim}px dashed ${c}` }} />
      </>
    );
  }
  if (theme.railDetail === 'chrome') {
    // A bright inlaid strip where the rail meets the felt
    return (
      <div
        className="pointer-events-none absolute rounded-full"
        style={{ inset: pad * 0.72, border: `${Math.max(1, trim)}px solid ${c}`, boxShadow: `0 0 ${pad * 0.6}px ${c}, inset 0 0 ${pad * 0.4}px ${c}` }}
      />
    );
  }
  // Plain: a thin polished edge on both sides
  return (
    <>
      <div className="pointer-events-none absolute inset-[1px] rounded-full" style={{ border: `1px solid ${c}`, opacity: 0.6 }} />
      <div className="pointer-events-none absolute rounded-full" style={{ inset: pad - 2, border: `1px solid ${c}`, opacity: 0.5 }} />
    </>
  );
}

/** Round "HOME GAME" crest with a spade, printed faintly on the felt. */
function Crest({ color }: { color: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" style={{ opacity: 0.13 }} aria-hidden>
      <defs>
        <path id={`${id}-top`} d="M 34 100 A 66 66 0 0 1 166 100" />
        <path id={`${id}-bottom`} d="M 30 100 A 70 70 0 0 0 170 100" />
      </defs>
      <g fill="none" stroke={color}>
        <circle cx="100" cy="100" r="94" strokeWidth="3" />
        <circle cx="100" cy="100" r="86" strokeWidth="1" />
        <circle cx="100" cy="100" r="50" strokeWidth="1.5" />
      </g>
      <g fill={color}>
        <text fontSize="15" fontWeight="700" letterSpacing="5" fontFamily="inherit">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
            HOME GAME
          </textPath>
        </text>
        <text fontSize="11" letterSpacing="7" fontFamily="inherit" dominantBaseline="hanging">
          <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">
            ♠ ♥ ♦ ♣
          </textPath>
        </text>
        <path
          transform="translate(70 66) scale(0.6)"
          d="M50 4C50 4 8 40 8 63c0 16 14 25 27 21 6-2 10-6 12-10-1 10-5 18-12 23h30c-7-5-11-13-12-23 2 4 6 8 12 10 13 4 27-5 27-21C92 40 50 4 50 4Z"
        />
      </g>
    </svg>
  );
}
