'use client';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { ActionBar } from '@/components/table/ActionBar';
import { PlayingCard } from '@/components/table/Card';
import { Chat } from '@/components/table/Chat';
import { HostPanel } from '@/components/table/HostPanel';
import { PlayerMenu } from '@/components/table/PlayerMenu';
import { SeatDialog } from '@/components/table/SeatDialog';
import { StatsPanel } from '@/components/table/StatsPanel';
import { Table } from '@/components/table/Table';
import { useCountdown } from '@/components/table/TimerRing';
import { MobileActions } from '@/components/table/MobileActions';
import { HandHistorySheet } from '@/components/history/HandHistorySheet';
import { ProfileSheet } from '@/components/table/ProfileSheet';
import { api } from '@/lib/api';
import { SettingsPanel } from '@/components/table/SettingsPanel';
import { Standings } from '@/components/table/TournamentBar';
import { DisplayProvider, useDisplay, useTheme } from '@/lib/display';
import { Chat as ChatIcon, ChevronLeft, Copy, History as HistoryIcon, Settings, Volume, VolumeOff } from '@/components/ui/Icons';
import { Loading } from '@/components/ui/PageHeader';
import { chips } from '@/lib/format';
import { isMuted, playSound, setMuted } from '@/lib/sounds';
import { useMe } from '@/lib/useMe';
import { useTable } from '@/lib/useTable';

type Tab = 'chat' | 'stats' | 'host' | 'settings';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const me = useMe();
  const table = useTable(code.toUpperCase());
  if (table.fatal) return <Fatal message={table.fatal} />;
  if (!me || !table.view) return <Loading label="Joining the table" />;
  return (
    <DisplayProvider bigBlind={table.view.room.bigBlind} defaultUnit={table.view.room.gameMode === 'TOURNAMENT' ? 'bb' : 'chips'}>
      <Room table={table} />
    </DisplayProvider>
  );
}

function Fatal({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="card-panel max-w-sm space-y-4">
        <p className="text-lg font-semibold">{message}</p>
        <Link className="btn-primary" href="/">
          Back to start
        </Link>
      </div>
    </main>
  );
}

function Room({ table }: { table: ReturnType<typeof useTable> }) {
  const { chat, reactions, connected, emit, skew } = table;
  const view = table.view!;
  const theme = useTheme();
  const { unit, setUnit } = useDisplay();
  const [portrait, setPortrait] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string | null>>({});
  // My colour labels for the players at the table
  const seatedIds = view.seats
    .filter((s) => s && s.userId !== view.me.userId)
    .map((s) => s!.userId)
    .sort()
    .join(',');
  useEffect(() => {
    if (!seatedIds) return;
    api<{ notes: Record<string, { color: string | null }> }>(`/players/notes?ids=${seatedIds}`)
      .then((r) => setLabels(Object.fromEntries(Object.entries(r.notes).map(([k, v]) => [k, v.color]))))
      .catch(() => undefined);
  }, [seatedIds]);
  const [tab, setTab] = useState<Tab>('chat');
  const [panelOpen, setPanelOpen] = useState(false);
  const [seatDialog, setSeatDialog] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [unread, setUnread] = useState(0);
  const [standingsClosed, setStandingsClosed] = useState(false);
  const lastTurn = useRef<string>('');

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // "Your turn" alert
  const legal = view.hand?.legal;
  useEffect(() => {
    if (!legal || !view.hand) return;
    const key = `${view.hand.handNo}-${view.hand.street}-${view.hand.currentBet}`;
    if (key === lastTurn.current) return;
    lastTurn.current = key;
    playSound('yourTurn');
    if ('vibrate' in navigator) navigator.vibrate?.(120);
  }, [legal, view.hand]);

  // Countdown warning: a beep for each of the last 5 seconds of MY turn, plus a vibration
  const myDeadline = legal ? (view.hand?.deadline ?? null) : null;
  const mySecs = useCountdown(myDeadline, skew);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (mySecs === null) {
      lastTick.current = null;
      return;
    }
    if (mySecs <= 5 && mySecs > 0 && lastTick.current !== mySecs) {
      lastTick.current = mySecs;
      playSound(mySecs <= 2 ? 'tickUrgent' : 'tick');
      if (mySecs === 5) navigator.vibrate?.([80, 60, 80]);
    }
    if (mySecs > 5) lastTick.current = null;
  }, [mySecs]);
  const usingBank = !!legal && !!view.hand?.usingTimeBank;
  useEffect(() => {
    if (usingBank) playSound('timeBank');
  }, [usingBank]);

  // Keep the phone screen awake while at the table
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        /* not supported or denied */
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release?.();
    };
  }, []);

  useEffect(() => {
    if (panelOpen && tab === 'chat') setUnread(0);
    else if (chat.length) setUnread((u) => u + 1);
  }, [chat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mySeat = view.me.seat !== null ? view.seats[view.me.seat] : null;
  const startGame = async () => {
    const r = await emit('host:start', {});
    if (!r.ok) setToast(r.error);
  };
  const myCards = mySeat && Array.isArray(mySeat.cards) ? mySeat.cards : null;
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${view.room.code}` : '';
  const ended = view.room.status === 'ENDED';

  const panel = (
    <div className="flex h-full flex-col">
      <div className="m-2 flex rounded-xl bg-black/30 p-1 text-sm ring-1 ring-inset ring-white/[0.06]">
        {(['chat', 'stats', ...(view.me.isHost ? ['host'] : []), 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`flex-1 rounded-lg py-1.5 font-semibold capitalize transition ${tab === t ? 'bg-white/10 text-white shadow' : 'text-white/50 hover:text-white/80'}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'host' && view.requests.length > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[11px] font-bold text-black">{view.requests.length}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'chat' && <Chat chat={chat} emit={emit} meId={view.me.userId} />}
        {tab === 'stats' && <StatsPanel view={view} />}
        {tab === 'host' && view.me.isHost && <HostPanel view={view} emit={emit} onError={setToast} />}
        {tab === 'settings' && <SettingsPanel onMutedChange={setMutedState} />}
      </div>
    </div>
  );

  return (
    <main
      className="flex h-dvh select-none flex-col overflow-hidden overscroll-none lg:flex-row"
      style={{ background: theme.backdrop, ['--plate' as string]: theme.plate, ['--stack' as string]: theme.stack }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-3 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <Link href="/" className="icon-btn" aria-label="Leave to start page">
            <ChevronLeft />
          </Link>
          <div className="hidden min-w-0 flex-1 pl-1 min-[440px]:block">
            <div className="truncate font-display text-[15px] font-bold leading-tight">{view.room.name}</div>
            <div className="truncate text-xs text-white/50">
              <span className="text-gold/90">
                {chips(view.room.smallBlind)}/{chips(view.room.bigBlind)}
                {view.room.ante > 0 && ` · ante ${chips(view.room.ante)}`}
              </span>
              {' · '}
              {view.room.gameMode === 'CASH' ? 'Cash' : 'Tournament'}
              {view.room.moneyMode === 'LEDGER' && ' · Ledger'}
            </div>
          </div>
          <span className="flex-1 min-[440px]:hidden" />
          <button
            className="pill h-10 gap-2 rounded-xl px-3 font-mono text-[13px] font-semibold tracking-wider text-white"
            title="Copy invite link"
            onClick={() => {
              navigator.clipboard?.writeText(inviteUrl).then(() => setToast('Invite link copied'));
            }}
          >
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500'}`} />
            {view.room.code}
            <Copy className="h-3.5 w-3.5 text-white/50" />
          </button>
          <button className="icon-btn" title="Hand history" aria-label="Hand history" onClick={() => setHistoryOpen(true)}>
            <HistoryIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            className="pill relative flex h-10 shrink-0 items-center rounded-xl p-1 font-display text-[11px] font-extrabold"
            title="Show stacks and bets in chips or big blinds"
            aria-label={`Showing amounts in ${unit === 'bb' ? 'big blinds' : 'chips'}. Tap to switch.`}
            onClick={() => {
              const next = unit === 'bb' ? 'chips' : 'bb';
              setUnit(next);
              setToast(next === 'bb' ? 'Stacks and bets shown in big blinds' : 'Stacks and bets shown in chips');
            }}
          >
            {(
              [
                ['chips', '123'],
                ['bb', 'BB'],
              ] as const
            ).map(([k, label]) => (
              <span key={k} className={`grid h-full w-8 place-items-center rounded-lg transition ${unit === k ? 'bg-gold text-black' : 'text-white/50'}`}>
                {label}
              </span>
            ))}
          </button>
          <button
            className="icon-btn hidden sm:inline-grid"
            title={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? <VolumeOff className="h-[18px] w-[18px]" /> : <Volume className="h-[18px] w-[18px]" />}
          </button>
          <button className="icon-btn relative lg:hidden" onClick={() => setPanelOpen(true)} aria-label="Chat and more">
            {view.me.isHost ? <Settings className="h-[18px] w-[18px]" /> : <ChatIcon className="h-[18px] w-[18px]" />}
            {(unread > 0 || (view.me.isHost && view.requests.length > 0)) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-[#07090a]" />}
          </button>
        </header>

        {!connected && <Banner tone="red">Reconnecting… your seat is held.</Banner>}
        {view.room.status === 'PAUSED' && <Banner tone="amber">The host has paused the game</Banner>}
        {ended && (
          <Banner tone="sky">
            This session has ended.{' '}
            <Link className="font-semibold underline" href={`/sessions/${view.room.code}`}>
              See results
            </Link>
          </Banner>
        )}

        <div className="min-h-0 flex-1 px-1 pb-[env(safe-area-inset-bottom)]">
          <Table
            view={view}
            skew={skew}
            reactions={reactions}
            onSeatClick={(seat) => setSeatDialog(seat)}
            onPlayerClick={(uid) => {
              if (uid === view.me.userId) setMenuOpen(true);
              else setProfileOf(uid);
            }}
            labels={labels}
            onLayout={setPortrait}
            controls={<MobileActions view={view} emit={emit} skew={skew} onError={setToast} onStart={startGame} />}
          />
        </div>

        {!portrait && (
        <footer className="space-y-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {view.me.isHost && view.room.status === 'OPEN' && (
            <button className="btn-primary h-12 w-full text-base" onClick={startGame}>
              Start the game
            </button>
          )}
          {view.me.pendingRequest && (
            <div className="flex items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm ring-1 ring-inset ring-white/10">
              <span>Waiting for the host to approve your request…</span>
              {view.me.pendingRequest.kind === 'buyIn' && (
                <button className="text-xs underline" onClick={() => emit('seat:cancel', {})}>
                  Cancel
                </button>
              )}
            </div>
          )}
          {myCards && !legal && (
            <div className="hidden items-center justify-center gap-2 [@media(min-height:700px)]:flex">
              {myCards.map((c, i) => (
                <PlayingCard key={i} card={c} size="lg" />
              ))}
              {mySeat?.handDescription && <span className="text-sm text-white/70">{mySeat.handDescription}</span>}
            </div>
          )}
          <ActionBar view={view} emit={emit} skew={skew} onError={setToast} />
          {mySeat && !legal && (
            <button className="btn-ghost h-9 w-full text-xs" onClick={() => setMenuOpen(true)}>
              Seat options · sit out, rebuy, leave
            </button>
          )}
          {!mySeat && !view.me.pendingRequest && !ended && (
            <p className="rounded-xl bg-white/[0.04] py-2.5 text-center text-sm text-white/60 ring-1 ring-inset ring-white/[0.06]">
              You&apos;re watching. Tap a <span className="text-gold">+</span> seat to {view.tournament ? 'register' : 'sit down'}.
            </p>
          )}
        </footer>
        )}
      </div>

      {/* desktop side panel */}
      <aside className="hidden w-[340px] border-l border-white/[0.06] bg-[#0a0e0d]/80 backdrop-blur-xl lg:block">{panel}</aside>

      {/* mobile drawer */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setPanelOpen(false)}>
          <div className="slide-up mt-auto h-[72dvh] rounded-t-3xl bg-[#0d1211] shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20" />
            <div className="h-[calc(100%-0.875rem)]">{panel}</div>
          </div>
        </div>
      )}

      {seatDialog !== null && <SeatDialog view={view} seat={seatDialog} emit={emit} onClose={() => setSeatDialog(null)} onError={setToast} />}
      {menuOpen && mySeat && <PlayerMenu view={view} emit={emit} onClose={() => setMenuOpen(false)} onError={setToast} />}
      {historyOpen && (
        <HandHistorySheet roomCode={view.room.code} defaultBB={unit === 'bb'} onClose={() => setHistoryOpen(false)} onMessage={setToast} />
      )}
      {profileOf && (
        <ProfileSheet
          userId={profileOf}
          view={view}
          onClose={() => setProfileOf(null)}
          onLabel={(uid, color) => setLabels((l) => ({ ...l, [uid]: color }))}
        />
      )}
      {view.tournament?.finished && !standingsClosed && <Standings view={view} onClose={() => setStandingsClosed(true)} />}
      {toast && (
        <div className="slide-up fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl bg-[#141a18]/95 px-4 py-2.5 text-sm font-medium shadow-2xl ring-1 ring-white/10 backdrop-blur">
          {toast}
        </div>
      )}
    </main>
  );
}

function Banner({ tone, children }: { tone: 'red' | 'amber' | 'sky'; children: React.ReactNode }) {
  const cls = { red: 'bg-red-500/10 text-red-200 ring-red-500/20', amber: 'bg-amber-400/10 text-amber-200 ring-amber-400/20', sky: 'bg-sky-400/10 text-sky-100 ring-sky-400/20' }[tone];
  return <div className={`mx-3 mt-1 rounded-xl px-3 py-2 text-center text-xs ring-1 ring-inset ${cls}`}>{children}</div>;
}
