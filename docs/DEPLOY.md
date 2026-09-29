# Deploying to Render (step by step)

This guide assumes you have never deployed a website before. It takes about 15 minutes.
You will end up with an address like `https://home-game-poker.onrender.com` to send to your friends.

## What you are creating

| Piece | What it does | Render plan |
|---|---|---|
| **PostgreSQL database** (`poker-db`) | Stores accounts, rooms, hand histories and the ledger | Basic (paid, a few US$/month) |
| **Web service** (`home-game-poker`) | Runs the website *and* the real-time game server | Starter (paid, a few US$/month) |

Why paid plans? Render's free web service goes to sleep after 15 minutes without visitors, which disconnects everyone at the table. Free databases are also deleted after a trial period. Check <https://render.com/pricing> for today's prices.

## 1. Put the code on GitHub

The code already lives in your GitHub repository (`y2s8zsbmm2-max/pokerapp`).
Render deploys from one branch. The simplest setup is to **merge the work into your `main` branch** first:

1. Open the repository on github.com.
2. Open a pull request from `claude/multiplayer-poker-app-ruh2de` into `main`, then click **Merge**.

(Or keep the branch and choose it in step 3.)

## 2. Create a Render account

1. Go to <https://render.com> and click **Get Started**.
2. Choose **Sign up with GitHub** and allow Render to see your `pokerapp` repository.
3. Add a payment card under **Account settings → Billing** (needed for the paid plans).

## 3. Create everything from the Blueprint

The repository contains a `render.yaml` file that describes the whole setup.

1. In the Render dashboard click **New +** → **Blueprint**.
2. Select the `pokerapp` repository. If asked for a branch, pick `main` (or the branch you chose).
3. Render shows what it will create: **poker-db** and **home-game-poker**. Click **Apply**.
4. Wait for the first deploy. You can watch the **Logs** tab; it takes 3–8 minutes. When you see
   `Poker server ready on http://localhost:10000` (the port number may differ) and the status turns **Live**, it's done.

That's it: the database connection, secure cookies and Node version are all set by the blueprint.

## 4. Try it

1. Open the service and click its URL (`https://….onrender.com`).
2. **Sign up**: the first account you create is just a normal account (anyone with the link can register).
3. Create a room, then send the invite link (tap the room code at the top of the table to copy it) to a friend.
4. Test on your phone: the site works in mobile browsers, and you can use **Add to Home Screen**.

## 5. Updating the site later

Every time new code is pushed or merged into the deployed branch, Render rebuilds and redeploys automatically.
Database changes (migrations) are applied automatically at start-up (`npm run db:deploy`).

⚠ A redeploy restarts the server. Any hand in progress is voided (everyone gets back the chips they had
at the start of that hand) and running games come back **paused**. The host presses **Resume**.
Deploy between sessions if you can.

## 6. Optional: your own domain

In the web service: **Settings → Custom Domains → Add**, then follow the DNS instructions Render shows.
HTTPS certificates are automatic.

## Troubleshooting

| Problem | Fix |
|---|---|
| Build fails at `npm ci` | Make sure `package-lock.json` is committed (it is in this repo). |
| "Please log in again" in a loop | `COOKIE_SECURE` must be `true` on Render (HTTPS) and `false` for local `http://`. |
| Players see "Reconnecting…" | Check the service is **Live** and on a paid plan (free instances sleep). |
| Tables behave oddly after scaling | Keep **exactly one instance**: game state is held in memory by that one server. |
| Database errors in logs | Open **poker-db** → check it is available; the web service gets `DATABASE_URL` from it automatically. |

## Backups

Paid Render PostgreSQL plans take automatic daily backups (see the database's **Backups** tab).
Players can also export their own session history as CSV from the **Sessions** page.

## Manual setup (without the Blueprint)

If you prefer clicking through the screens yourself:

1. **New + → PostgreSQL**: name `poker-db`, plan Basic. Create it and copy its **Internal Database URL**.
2. **New + → Web Service**: pick the repo, then set:
   - Runtime: **Node**
   - Build command: `npm ci && npm run build`
   - Start command: `npm run db:deploy && npm start`
   - Plan: **Starter** (1 instance)
   - Health check path: `/healthz`
   - Environment variables: `DATABASE_URL` = the internal URL from step 1, `COOKIE_SECURE` = `true`, `NODE_VERSION` = `22`
3. Click **Create Web Service**.
