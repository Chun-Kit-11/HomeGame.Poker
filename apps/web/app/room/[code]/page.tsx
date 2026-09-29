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
import { TournamentBar } from '@/components/table/TournamentBar';
import { chips } from '@/lib/format';
import { isMuted, playSound, setMuted } from '@/lib/sounds';
import { useMe } from '@/lib/useMe';
import { useTable } from '@/lib/useTable';

type Tab = 'chat' | 'stats' | 'host';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const me = useMe();
  const { view, chat, reactions, connected, fatal, emit, skew } = useTable(code.toUpperCase());
  const [tab, setTab] = useState<Tab>('chat');
  const [panelOpen, setPanelOpen] = useState(false);
  const [seatDialog, setSeatDialog] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [unread, setUnread] = useState(0);
  const lastTurn = useRef<string>('');

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // "Your turn" alert
  const legal = view?.hand?.legal;
  useEffect(() => {
    if (!legal || !view?.hand) return;
    const key = `${view.hand.handNo}-${view.hand.street}-${view.hand.currentBet}`;
    if (key === lastTurn.current) return;
    lastTurn.current = key;
    playSound('yourTurn');
    if ('vibrate' in navigator) navigator.vibrate?.(120);
  }, [legal, view?.hand]);

  useEffect(() => {
    if (panelOpen && tab === 'chat') setUnread(0);
    else if (chat.length) setUnread((u) => u + 1);
  }, [chat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fatal) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="space-y-4">
          <p className="text-lg">{fatal}</p>
          <Link className="btn-primary" href="/lobby">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }
  if (!me || !view) return <main className="grid min-h-dvh place-items-center text-white/50">Connecting…</main>;

  const mySeat = view.me.seat !== null ? view.seats[view.me.seat] : null;
  const myCards = mySeat && Array.isArray(mySeat.cards) ? mySeat.cards : null;
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${view.room.code}` : '';
  const ended = view.room.status === 'ENDED';

  const panel = (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-white/10 text-sm">
        {(['chat', 'stats', ...(view.me.isHost ? ['host'] : [])] as Tab[]).map((t) => (
          <button key={t} className={`flex-1 py-2 capitalize ${tab === t ? 'border-b-2 border-emerald-400 font-bold' : 'text-white/60'}`} onClick={() => setTab(t)}>
            {t}
            {t === 'host' && view.requests.length > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs text-black">{view.requests.length}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'chat' && <Chat chat={chat} emit={emit} meId={view.me.userId} />}
        {tab === 'stats' && <StatsPanel view={view} />}
        {tab === 'host' && view.me.isHost && <HostPanel view={view} emit={emit} onError={setToast} />}
      </div>
    </div>
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-3 py-2 text-sm">
          <Link href="/lobby" className="text-white/60">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{view.room.name}</div>
            <div className="text-xs text-white/50">
              {view.room.gameMode === 'CASH' ? 'Cash' : 'Tournament'} · Blinds {chips(view.room.smallBlind)}/{chips(view.room.bigBlind)}
              {view.room.ante > 0 && ` · BB ante ${chips(view.room.ante)}`}
              {view.room.moneyMode === 'LEDGER' && ' · Ledger'}
            </div>
          </div>
          <button
            className="rounded-md bg-white/10 px-2 py-1 font-mono text-xs"
            title="Copy invite link"
            onClick={() => {
              navigator.clipboard?.writeText(inviteUrl).then(() => setToast('Invite link copied'));
            }}
          >
            {view.room.code} ⧉
          </button>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} title={connected ? 'Connected' : 'Reconnecting…'} />
          <button
            className="text-lg"
            title={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="relative rounded-md bg-white/10 px-2 py-1 lg:hidden" onClick={() => setPanelOpen(true)}>
            💬{unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />}
          </button>
        </header>

        {view.tournament && <TournamentBar view={view} skew={skew} />}
        {!connected && <div className="bg-red-900/60 py-1 text-center text-xs">Reconnecting… your seat is held.</div>}
        {view.room.status === 'PAUSED' && <div className="bg-amber-900/50 py-1 text-center text-xs">Game paused by the host</div>}
        {ended && (
          <div className="bg-sky-900/60 py-2 text-center text-sm">
            Session ended.{' '}
            <Link className="underline" href={`/sessions/${view.room.code}`}>
              See results
            </Link>
          </div>
        )}

        <div className="min-h-0 flex-1 px-1">
          <Table
            view={view}
            skew={skew}
            reactions={reactions}
            onSeatClick={(seat) => setSeatDialog(seat)}
            onPlayerClick={(uid) => {
              if (uid === view.me.userId) setMenuOpen(true);
            }}
          />
        </div>

        <footer className="space-y-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {view.me.isHost && view.room.status === 'OPEN' && (
            <button className="btn-primary w-full" onClick={async () => {
              const r = await emit('host:start', {});
              if (!r.ok) setToast(r.error);
            }}>
              Start the game
            </button>
          )}
          {view.me.pendingRequest && (
            <div className="flex items-center justify-between rounded-lg bg-white/5 p-2 text-sm">
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
            <button className="w-full py-1 text-xs text-white/50 underline" onClick={() => setMenuOpen(true)}>
              Seat options (sit out, rebuy, leave)
            </button>
          )}
          {!mySeat && !view.me.pendingRequest && !ended && <p className="text-center text-xs text-white/50">You are watching. Tap an empty seat to sit down.</p>}
        </footer>
      </div>

      {/* desktop side panel */}
      <aside className="hidden w-80 border-l border-white/10 bg-black/30 lg:block">{panel}</aside>

      {/* mobile drawer */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/60 lg:hidden" onClick={() => setPanelOpen(false)}>
          <div className="mt-auto h-[70dvh] rounded-t-2xl bg-[#101a16]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end px-3 pt-2">
              <button className="text-2xl text-white/50" onClick={() => setPanelOpen(false)}>
                ×
              </button>
            </div>
            <div className="h-[calc(100%-2.5rem)]">{panel}</div>
          </div>
        </div>
      )}

      {seatDialog !== null && <SeatDialog view={view} seat={seatDialog} emit={emit} onClose={() => setSeatDialog(null)} onError={setToast} />}
      {menuOpen && mySeat && <PlayerMenu view={view} emit={emit} onClose={() => setMenuOpen(false)} onError={setToast} />}
      {toast && <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-black/90 px-4 py-2 text-sm shadow-lg">{toast}</div>}
    </main>
  );
}
