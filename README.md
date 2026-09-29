# Home Game: private poker club

A private, real-time multiplayer **No-Limit Texas Hold'em** site for playing with friends, each on your own device.

* **Game modes:** cash games, or Sit & Go tournaments (rising blinds, big blind antes, late registration, rebuys and add-on, payouts).
* **Money modes:** play chips, or a **ledger** that records the real-money value of buy-ins and cash-outs and works out the fewest transfers to settle up. The app **never** processes payments.
* **Server-authoritative and provably fair:** browsers only send actions. Each shuffle is committed before the hand, uses a seed from every player, and can be recomputed by anyone afterwards on the Verify page.
* **Mobile-first premium UI:** works in portrait and landscape; chat, emoji reactions, sounds, a time bank, hand history with a replayer, and session stats.

## Project layout

```
packages/engine   Pure TypeScript rules engine + hand evaluator (no dependencies, fully unit tested)
packages/shared   Shared by server and browser: fair shuffle, socket protocol, ledger & tournament maths
apps/server       Node server: Express API + Socket.IO game gateway + Next.js, Prisma/PostgreSQL
apps/web          Next.js (App Router) + Tailwind user interface
docs/DEPLOY.md    Step-by-step deployment guide (Render)
render.yaml       One-click Render Blueprint
```

## Run it on your computer

You need **Node.js 20.11+** (22 recommended) and **Docker Desktop** (for PostgreSQL).

```bash
npm install                        # install everything
docker compose up -d               # start PostgreSQL on localhost:5432
cp .env.example apps/server/.env   # local settings
npm run db:migrate                 # create the database tables
npm run dev                        # http://localhost:3000
```

* Open <http://localhost:3000>, type a name, and create a room. There are no accounts or passwords.
* To play against yourself, use a second browser or a private window as another player.
* Phones on the same Wi-Fi can open `http://<your-computer's-IP>:3000`. The dev server listens on all interfaces.

Production mode locally: `npm run build && npm start`.

## Tests

```bash
npm test                 # everything (~1 minute)
npm run test:engine      # rules engine only
npm run test:exhaustive  # slow: evaluates all 133,784,560 seven-card hands (~2 minutes)
npm run typecheck        # TypeScript checks for every package
```

What the tests prove:

| Area | Tests |
|---|---|
| Hand evaluator | All 2,598,960 five-card hands give the known category counts and exactly 7,462 distinct values; cross-checked against an independent brute-force evaluator; optional full 7-card enumeration |
| Rules | Heads-up order, min-raises, incomplete all-in raises (TDA reopening rule), side pots with 3+ all-ins, split pots and the odd chip, big blind ante (blind has priority), uncalled bets, showdown order and mucking, run it twice, dead-button rotation, players leaving |
| Simulation | 12,000 random bot hands: chips conserved after every action, no duplicate cards, every chip accounted for in pots |
| Privacy | A real Socket.IO server plus clients play 25+ hands; every payload is inspected to prove nobody ever receives another player's unshown hole cards or the deck |
| Fairness | The shuffle matches an independent Node crypto HMAC, is deterministic, passes a chi-square uniformity test, and real dealt hands are reproduced from the revealed seeds |
| Ledger | 1,000 random sessions (including awkward chip ratios) always sum to exactly zero; settlement uses the proven minimum number of transfers (checked by brute force) |
| Tournaments | Level clock and pausing, late registration closing after level 5, rebuys, a full tournament to one winner with payouts that balance the ledger |
| Recovery | Disconnected players keep their seat; a crashed server restores seats, stacks and ledger (a hand in progress is voided) |

## How to check each phase by hand

1. **Setup & names.** Type a name and create a room; open the room code in a private window, type another name and join. Reloading keeps you as the same player (a cookie on that device remembers you).
2. **Rules engine.** Run `npm run test:engine`.
3. **Realtime & cash games.**
   1. Create a cash room and open the invite link in a second browser.
   2. Both players sit down. The host approves the buy-in unless auto-approve is on.
   3. The host starts the game.
   4. Try fold, call and raise. Let the timer run out to see the time bank being used.
4. **Table UI.** Try the same on a phone, in portrait and landscape. Also try the raise slider and pot buttons, chat and reactions, and the mute toggle.
5. **Fairness & history.** After a hand, tap *Hand #N · verify shuffle*: the seed matches and the deck reproduces. Then open **Hand history** and step through the replayer.
6. **Tournaments.** Create a tournament with a 1-minute level. Watch the level timer, then play to a winner and see the standings.
7. **Ledger.**
   1. Create a *Ledger* cash room (e.g. 1 chip = RM 1). Play, top up, then end the session.
   2. **Sessions** shows who pays whom, and the total is 0.00 ✓.
   3. Download the CSV.
8. **Polish & deploy.** Close a player's browser mid-hand: they are shown offline, auto-acted, and back on reconnect. Deploy with [docs/DEPLOY.md](docs/DEPLOY.md).

9. **Analysis & stats.**
   1. Open any finished hand in **Hand history** and tap **Analyse**. You get pot odds, equity against the likely ranges, preflop chart or push/fold advice, and a verdict for each of your decisions.
   2. **My stats** shows VPIP, PFR, 3-bet, showdown %, bb/100 and results by position.

## Hand analysis: what it is (and isn't)

* **Tier A, every decision.** Pot odds, required equity, minimum defense frequency, and the EV of calling. Also your Monte Carlo equity against ranges *estimated from the opponents' actions*. Their real cards are never used, so analysis can't leak mucked hands.
* **Tier B, preflop.**
  * An approximate open-raising chart for when the action is folded to you.
  * A genuine heads-up push/fold equilibrium for short-stacked blind-vs-blind spots, precomputed by `apps/server/scripts/precompute-preflop.ts` (it matches published charts; e.g. the SB shoves about 58% of hands at 10bb).
* **Only after the hand.** Hands are stored only once finished, so live analysis is impossible by design.
* **Limits.** Multiway spots have no exact GTO solution, and postflop "GTO" would need a full solver. The page says which tier produced each answer.

## Fairness notes

* **Shuffle.** The server seed comes from Node's cryptographic RNG. The deck is shuffled with Fisher–Yates, driven by `HMAC-SHA256(serverSeed, clientSeeds:handId:counter)` with rejection sampling (no modulo bias).
* **Commit, then reveal.** The commitment `SHA-256(serverSeed)` is published before any player seed is accepted. The seed is revealed after the hand.
* **Privacy trade-off.** Recomputing a deck after the hand also reveals cards that were folded or mucked. This is inherent to a fully verifiable deck.
* **Data sent to browsers.** Clients only ever receive a per-player view built on the server. The deck and other players' unshown cards are never sent.

## Deploying

See **[docs/DEPLOY.md](docs/DEPLOY.md)**. Render with the included Blueprint takes about 15 minutes.
