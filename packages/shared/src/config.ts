import { z } from 'zod';

/** A blind level. `ante` is the big blind ante (paid by the big blind for the table). */
export const blindLevelSchema = z.object({
  sb: z.number().int().min(0),
  bb: z.number().int().min(1),
  ante: z.number().int().min(0),
});
export type BlindLevel = z.infer<typeof blindLevelSchema>;

export const timingSchema = z.object({
  preflopSeconds: z.number().int().min(5).max(300),
  postflopSeconds: z.number().int().min(5).max(300),
  /** Time bank: a number of chips, each worth `timeBankChipSeconds` */
  timeBankChips: z.number().int().min(0).max(50),
  timeBankChipSeconds: z.number().int().min(1).max(120),
  /** One chip is added every N hands dealt... */
  timeBankRefillHands: z.number().int().min(1).max(1000),
  /** ...up to this many chips */
  timeBankMaxChips: z.number().int().min(0).max(100),
});
export type Timing = z.infer<typeof timingSchema>;

export const DEFAULT_TIMING: Timing = {
  preflopSeconds: 15,
  postflopSeconds: 20,
  timeBankChips: 6,
  timeBankChipSeconds: 10,
  timeBankRefillHands: 20,
  timeBankMaxChips: 9,
};

export const cashConfigSchema = z
  .object({
    smallBlind: z.number().int().min(1),
    bigBlind: z.number().int().min(1),
    minBuyIn: z.number().int().min(1),
    maxBuyIn: z.number().int().min(1),
    runItTwice: z.boolean(),
  })
  .refine((c) => c.smallBlind <= c.bigBlind, 'Small blind must not exceed the big blind')
  .refine((c) => c.minBuyIn <= c.maxBuyIn, 'Min buy-in must not exceed max buy-in')
  .refine((c) => c.minBuyIn >= c.bigBlind, 'Min buy-in must be at least one big blind');
export type CashConfig = z.infer<typeof cashConfigSchema>;

export const tournamentConfigSchema = z.object({
  startingStack: z.number().int().min(1),
  levelMinutes: z.number().min(1).max(240),
  levels: z.array(blindLevelSchema).min(1).max(60),
  /** Late registration is open until the END of this level (1-based) */
  lateRegLevels: z.number().int().min(0).max(60),
  rebuy: z.object({
    enabled: z.boolean(),
    /** Rebuys allowed until the end of this level (1-based) */
    untilLevel: z.number().int().min(1).max(60),
    chips: z.number().int().min(1),
  }),
  addOn: z.object({
    enabled: z.boolean(),
    chips: z.number().int().min(1),
  }),
  /** Payout percentages for 1st, 2nd, ...; null = default by number of entrants */
  payouts: z.array(z.number().min(0).max(100)).max(9).nullable(),
});
export type TournamentConfig = z.infer<typeof tournamentConfigSchema>;

/** Currency value of chips: `chips` chips are worth `minor` minor units (e.g. 100 chips = 100 sen). */
export const ledgerConfigSchema = z.object({
  currency: z.string().trim().min(1).max(8),
  ratio: z.object({ chips: z.number().int().min(1), minor: z.number().int().min(1) }),
  /** Tournament prices in minor units */
  entryPrice: z.number().int().min(0),
  rebuyPrice: z.number().int().min(0),
  addOnPrice: z.number().int().min(0),
});
export type LedgerConfig = z.infer<typeof ledgerConfigSchema>;

export const roomConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    gameMode: z.enum(['CASH', 'TOURNAMENT']),
    moneyMode: z.enum(['PLAY', 'LEDGER']),
    maxSeats: z.number().int().min(2).max(9),
    autoApprove: z.boolean(),
    timing: timingSchema,
    cash: cashConfigSchema.nullable(),
    tournament: tournamentConfigSchema.nullable(),
    ledger: ledgerConfigSchema.nullable(),
  })
  .refine((c) => (c.gameMode === 'CASH' ? c.cash !== null : c.tournament !== null), 'Missing game settings')
  .refine((c) => c.moneyMode === 'PLAY' || c.ledger !== null, 'Missing ledger settings');
export type RoomConfig = z.infer<typeof roomConfigSchema>;

/**
 * Default blind schedule for a 10,000-chip starting stack.
 * Big blind ante (equal to the big blind) starts at level 3.
 */
export const DEFAULT_LEVELS_10K: BlindLevel[] = [
  { sb: 25, bb: 50, ante: 0 },
  { sb: 50, bb: 100, ante: 0 },
  { sb: 75, bb: 150, ante: 150 },
  { sb: 100, bb: 200, ante: 200 },
  { sb: 150, bb: 300, ante: 300 },
  { sb: 200, bb: 400, ante: 400 },
  { sb: 300, bb: 600, ante: 600 },
  { sb: 400, bb: 800, ante: 800 },
  { sb: 500, bb: 1000, ante: 1000 },
  { sb: 600, bb: 1200, ante: 1200 },
  { sb: 800, bb: 1600, ante: 1600 },
  { sb: 1000, bb: 2000, ante: 2000 },
  { sb: 1500, bb: 3000, ante: 3000 },
  { sb: 2000, bb: 4000, ante: 4000 },
  { sb: 3000, bb: 6000, ante: 6000 },
  { sb: 4000, bb: 8000, ante: 8000 },
  { sb: 5000, bb: 10000, ante: 10000 },
  { sb: 7500, bb: 15000, ante: 15000 },
  { sb: 10000, bb: 20000, ante: 20000 },
  { sb: 15000, bb: 30000, ante: 30000 },
];

const NICE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100];

/** Rounds to a "nice" chip amount (1, 2, 5, 25, 75, 150, 1,500 ...). */
export function niceRound(x: number): number {
  if (x <= 1) return 1;
  const mag = 10 ** Math.floor(Math.log10(x) - 1);
  let best = NICE[0] * mag;
  for (const n of NICE) {
    const v = n * mag;
    if (Math.abs(v - x) < Math.abs(best - x)) best = v;
  }
  return Math.max(1, Math.round(best));
}

/** Default schedule scaled to any starting stack. */
export function defaultLevels(startingStack: number): BlindLevel[] {
  const f = startingStack / 10_000;
  return DEFAULT_LEVELS_10K.map((l) => {
    const bb = niceRound(l.bb * f);
    const sb = Math.min(bb, niceRound(l.sb * f));
    return { sb, bb, ante: l.ante ? bb : 0 };
  });
}

/** Default payout percentages: 1 place for <=4 entrants, 2 for 5-6, 3 for 7+. */
export function defaultPayouts(entrants: number): number[] {
  if (entrants <= 4) return [100];
  if (entrants <= 6) return [65, 35];
  return [50, 30, 20];
}

export function defaultRoomConfig(gameMode: 'CASH' | 'TOURNAMENT', moneyMode: 'PLAY' | 'LEDGER'): RoomConfig {
  return {
    name: gameMode === 'CASH' ? 'Home game' : 'Sit & Go',
    gameMode,
    moneyMode,
    maxSeats: 9,
    autoApprove: false,
    timing: { ...DEFAULT_TIMING },
    cash: gameMode === 'CASH' ? { smallBlind: 1, bigBlind: 2, minBuyIn: 100, maxBuyIn: 400, runItTwice: false } : null,
    tournament:
      gameMode === 'TOURNAMENT'
        ? {
            startingStack: 10_000,
            levelMinutes: 10,
            levels: defaultLevels(10_000),
            lateRegLevels: 5,
            rebuy: { enabled: false, untilLevel: 4, chips: 10_000 },
            addOn: { enabled: false, chips: 10_000 },
            payouts: null,
          }
        : null,
    ledger:
      moneyMode === 'LEDGER'
        ? { currency: 'RM', ratio: { chips: 1, minor: 100 }, entryPrice: 2000, rebuyPrice: 2000, addOnPrice: 2000 }
        : null,
  };
}
