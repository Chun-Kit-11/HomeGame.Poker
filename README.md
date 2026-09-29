# Home Game Poker

A private, real-time multiplayer No-Limit Texas Hold'em site for playing with friends, each on your own device.

* **Server-authoritative:** the server holds all game state; browsers only send actions.
* **Provably fair:** each hand's shuffle can be recomputed by anyone after it ends.
* **Two game modes:** cash game or Sit & Go tournament.
* **Two money modes:** play chips, or a ledger that records real-money buy-ins and cash-outs and works out who pays whom. The app never processes payments.

## Project layout

```
packages/engine   Pure TypeScript rules engine + hand evaluator (no dependencies)
packages/shared   Code used by both server and browser (fair shuffle, protocol, ledger maths)
apps/server       Node server: Express API + Socket.IO + Next.js, Prisma/PostgreSQL
apps/web          Next.js (App Router) + Tailwind user interface
docs/             Deployment guide and notes
```

## Running locally

You need **Node.js 20.11+** (22 recommended) and **Docker Desktop** (for PostgreSQL).

```bash
npm install                        # install everything
docker compose up -d               # start PostgreSQL on localhost:5432
cp .env.example apps/server/.env   # local settings
npm run db:migrate                 # create the database tables
npm run dev                        # start on http://localhost:3000
```

Open http://localhost:3000, sign up, and you'll land in the lobby.
To try multiplayer on one computer, open a second browser (or a private window) and sign up as a second user.
Other devices on your Wi-Fi can use `http://<your-computer-ip>:3000`.

## Tests

```bash
npm test                 # all tests
npm run test:engine      # rules engine only
npm run test:exhaustive  # slow: evaluates all 133,784,560 seven-card hands (~minutes)
npm run typecheck        # TypeScript checks for every package
```
