import type { HandEvent } from '@poker/engine';
import { cardsToString } from '@poker/engine';

export interface ReplayFrame {
  label: string;
  street: string;
  board: number[];
  board2: number[] | null;
  pot: number;
  bets: Record<number, number>;
  stacks: Record<number, number>;
  folded: Set<number>;
  lastAction: Record<number, string>;
  shown: Record<number, number[]>;
  won: Record<number, number>;
  /** Seat that acted in this step */
  actor: number | null;
}

/** Rebuilds the table state after each event so a hand can be stepped through. */
export function replay(events: HandEvent[], names: Record<number, string>): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  let f: ReplayFrame = {
    label: 'Start',
    street: 'preflop',
    board: [],
    board2: null,
    pot: 0,
    bets: {},
    stacks: {},
    folded: new Set(),
    lastAction: {},
    shown: {},
    won: {},
    actor: null,
  };
  const push = (label: string, actor: number | null = null) => {
    frames.push({ ...f, label, actor, bets: { ...f.bets }, stacks: { ...f.stacks }, folded: new Set(f.folded), lastAction: { ...f.lastAction }, shown: { ...f.shown }, won: { ...f.won } });
  };
  const sweep = () => {
    for (const k of Object.keys(f.bets)) f.pot += f.bets[Number(k)];
    f.bets = {};
  };
  const n = (seat: number) => names[seat] ?? `Seat ${seat + 1}`;

  for (const e of events) {
    switch (e.type) {
      case 'handStart':
        for (const p of e.players) f.stacks[p.seat] = p.stack;
        push(`Hand #${e.handNo}: blinds ${e.smallBlind}/${e.bigBlind}${e.bigBlindAnte ? `, BB ante ${e.bigBlindAnte}` : ''}`);
        break;
      case 'post':
        f.stacks[e.seat] -= e.amount;
        if (e.kind === 'ante') f.pot += e.amount;
        else f.bets[e.seat] = (f.bets[e.seat] ?? 0) + e.amount;
        push(`${n(e.seat)} posts ${e.kind === 'sb' ? 'small blind' : e.kind === 'bb' ? 'big blind' : e.kind === 'ante' ? 'BB ante' : 'a big blind'} ${e.amount}${e.allIn ? ' (all-in)' : ''}`, e.seat);
        break;
      case 'deal':
        push('Hole cards dealt');
        break;
      case 'action': {
        f.stacks[e.seat] -= e.amount;
        if (e.action === 'fold') f.folded.add(e.seat);
        else f.bets[e.seat] = e.to;
        const text =
          e.action === 'fold' ? 'folds' : e.action === 'check' ? 'checks' : e.action === 'call' ? `calls ${e.amount}` : e.action === 'bet' ? `bets ${e.to}` : `raises to ${e.to}`;
        f.lastAction[e.seat] = text + (e.allIn ? ' (all-in)' : '');
        push(`${n(e.seat)} ${f.lastAction[e.seat]}`, e.seat);
        break;
      }
      case 'uncalled': {
        const fromBet = Math.min(f.bets[e.seat] ?? 0, e.amount);
        f.bets[e.seat] = (f.bets[e.seat] ?? 0) - fromBet;
        f.pot -= e.amount - fromBet;
        f.stacks[e.seat] += e.amount;
        push(`Uncalled ${e.amount} returned to ${n(e.seat)}`, e.seat);
        break;
      }
      case 'street':
        sweep();
        f.lastAction = {};
        if (e.run === 1) {
          f.board = e.board;
          f.street = e.street;
        } else f.board2 = e.board;
        push(`${e.run === 2 ? 'Second run ' : ''}${e.street[0].toUpperCase() + e.street.slice(1)}: ${cardsToString(e.cards)}`);
        break;
      case 'reveal':
        f.shown[e.seat] = e.cards;
        push(`${n(e.seat)} shows ${cardsToString(e.cards)} (all-in)`, e.seat);
        break;
      case 'ritOffer':
        push('Run it twice offered');
        break;
      case 'ritVote':
        push(`${n(e.seat)} ${e.agree ? 'agrees to run it twice' : 'wants to run it once'}`, e.seat);
        break;
      case 'ritResult':
        push(e.runTwice ? 'Running it twice' : 'Running it once');
        break;
      case 'show':
        f.shown[e.seat] = e.cards;
        push(`${n(e.seat)} shows ${cardsToString(e.cards)}${e.descriptions.length ? ` — ${e.descriptions.join(' / ')}` : ''}`, e.seat);
        break;
      case 'muck':
        f.lastAction[e.seat] = 'mucks';
        push(`${n(e.seat)} mucks`, e.seat);
        break;
      case 'pot':
        sweep();
        f.pot -= e.amount;
        for (const w of e.winners) {
          f.stacks[w.seat] += w.amount;
          f.won[w.seat] = (f.won[w.seat] ?? 0) + w.amount;
        }
        push(
          `${e.winners.map((w) => `${n(w.seat)} wins ${w.amount}`).join(', ')} from ${e.index === 0 ? 'the main pot' : `side pot ${e.index}`}${e.run === 2 || (e.run === 1 && f.board2) ? ` (run ${e.run})` : ''}${e.description ? ` with ${e.description}` : ''}`,
        );
        break;
      case 'handEnd':
        push('Hand complete');
        break;
    }
  }
  return frames;
}
