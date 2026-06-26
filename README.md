# Moblog

A private, full-stack trading journal SaaS built with **Next.js 16** (App Router), **Prisma**, **PostgreSQL**, and **Tailwind CSS v4**. It features a calendar-based trade view, performance analytics, account management with running balances, and a minimal, Tradezella-inspired UI.

## Features

- **Single-user sign-in** via JWT session cookies (`jose`).
- **Account management** with starting balances and computed running balances.
- **Rich journal entries** for each trade: pair, direction, open/close dates, entry/exit/stop-loss/take-profit, size, risk amount, ROI, R:R, exit logic, setup, comment, and chart URL.
- **Three-page navigation** — Dashboard, Trades, and Analytics.
- **Trades page** with search, filters, sorting, and pagination.
- **Analytics page** with stats, calendar, day panel, and full performance breakdown (win rate, profit factor, expectancy, streaks, top setups, exit logic breakdown).
- **Stats + equity curve** on the main dashboard.
- **Open positions list** for trades that haven't been closed yet.
- **Fast trade input** with a keyboard-friendly modal and preset exit logic chips.

## Tech stack

- **Next.js** 16.2.9 + **React** 19.2 + **Turbopack**
- **Tailwind CSS** 4
- **Prisma** 6.19.3 + **PostgreSQL**
- **jose** for JWT session signing
- **Lucide** icons

## Environment setup

Create a `.env` file at the project root (or copy `.env.example`):

```env
# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/moblog?schema=public"

# Auth secrets (use strong, random values in production)
AUTH_SECRET="Bv5eKu8jIXoW4F20xwNTl2NG7sc6H4_DP9pt-v2hETM"
AUTH_EMAIL="me@moblog.app"
AUTH_PASSWORD="changeme123"
```

- `AUTH_SECRET` — used to sign the session cookie. Change it to a long random string.
- `AUTH_EMAIL` / `AUTH_PASSWORD` — the single authorized login.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Start PostgreSQL

Make sure a Postgres database is running and `DATABASE_URL` points to it.

### 3. Push the database schema

```bash
npx prisma migrate dev
```

### 4. Run the dev server

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with the `AUTH_EMAIL` / `AUTH_PASSWORD` you set.

## Useful commands

| Command                  | Description                 |
| ------------------------ | --------------------------- |
| `npm run dev`            | Start the dev server        |
| `npm run build`          | Build for production        |
| `npm run start`          | Start the production server |
| `npx prisma migrate dev` | Create/run migrations       |
| `npx prisma studio`      | Open the database UI        |

## Project structure

```
prisma/
  schema.prisma       # Account + Trade models
src/
  app/
    (dashboard)/
      layout.tsx      # Shared app shell (sidebar, modals)
      page.tsx        # Dashboard overview
      journal/page.tsx # Trades list with filters + pagination
      analytics/page.tsx # Calendar + stats + analytics
    login/page.tsx    # Sign-in UI
    api/              # Accounts, trades, auth routes
    proxy.ts          # Auth route guard
  components/
    AppLayout.tsx
    AccountContext.tsx
    ModalContext.tsx
    Sidebar.tsx
    TradeModal.tsx
    AccountModal.tsx
    StatCards.tsx
    EquityCurve.tsx
    Analytics.tsx
    Calendar.tsx
    DayPanel.tsx
    JournalTable.tsx
    OpenPositions.tsx
  lib/
    auth.ts           # JWT helpers
    serverAuth.ts     # Server session check
    useData.ts        # Client data hooks
    types.ts          # TypeScript types
    utils.ts          # Stats/formatting helpers
    prisma.ts         # Prisma client
```

## Deploy on Vercel

### 1. Prepare your project

- Push the repo to GitHub.
- Make sure `DATABASE_URL` is set to a production Postgres connection string (e.g., [Neon](https://neon.tech) or [Supabase](https://supabase.com)).
- Set `AUTH_SECRET`, `AUTH_EMAIL`, and `AUTH_PASSWORD` in your Vercel dashboard.

### 2. Add Prisma build step

In the Vercel dashboard, set the **Build Command** to:

```bash
prisma generate && prisma migrate deploy && next build
```

This ensures the Prisma client is generated and migrations are applied before each deploy.

### 3. Deploy

1. Import the project in Vercel.
2. Add the environment variables.
3. Hit **Deploy**.

After the first deploy, visit the site and sign in with the authorized credentials.

## Deploy summary

- **Pages:** `/` Dashboard, `/journal` Trades, `/analytics` Analytics.
- **Navigation:** sidebar uses Next.js `Link` with active-route highlighting.
- **Responsive:** tables scroll horizontally on mobile, modals are bottom-sheet on mobile and scrollable.
- **Filters:** Trades page supports account, search, direction, status, setup, and date range. Analytics page supports account, direction, and date range.
- **Pagination:** Trades page paginates 10 rows per page.
- **Seed files removed:** The repo no longer contains `prisma/seed.mjs` or `prisma/seed-goat.mjs`. On production, the database will be empty after the first deploy unless you migrate your local data. You can add trades manually through the web UI or import a SQL dump.
- **Build command:** `prisma generate && prisma migrate deploy && next build` (already set in `package.json` for Vercel).

## Notes

- `AUTH_PASSWORD` is plain text for simplicity because the app is single-user. Change it in your environment whenever you want to rotate the password.
- The `proxy.ts` route guard protects the whole app except `/login` and `/api/auth/*`.
- **Manage accounts:** in the sidebar, expand the **Accounts** section. Each account has a pencil (edit) and trash (delete) icon. Delete cascades and removes all trades for that account.
- **Manage trades:** click any trade in the Trades page or Journal table to edit; the trade modal has a **Delete** button.
- **Monthly view:** the Dashboard has a monthly PnL bar chart. Click any month to open the Analytics page focused on that month.
- **Analytics month filter:** use the month dropdown in the Analytics page to jump to a specific month. The calendar, stats, and analytics all update to that month, and the calendar header shows the month’s total PnL.
- Open trades are trades with no `closeDate`; they appear in the **Open positions** list and do not affect balance/stats.
