# Run Number Timesheet (TimekeepingOC)

A full-stack timesheet & pay calculator for OC Transpo (ATU279) run numbers,
built with Next.js, React, and TypeScript.

Ported from an interactive HTML prototype into a proper Next.js app while
keeping the same "transit destination sign" look and feel and the same
pay-calculation logic.

## Features

- **Run search** — look up a run number and see every shift piece paired
  with it, grouped by full shift, from whichever board that date runs.
  Seven boards are loaded: Summer 2026 weekday/Saturday/Sunday, Fall 2026
  weekday/Saturday/Sunday, and the Fall 2026 STAT holiday board.
- **Paddle search** — the whole paddle book for the date worked, trip by
  trip with timepoints. Four books: Summer 2026 weekday, and Fall 2026
  weekday/Saturday/Sunday. The summer weekend books have not been supplied
  yet, and the app says so rather than searching the wrong one.
- **Booking sheet import** — upload an Employee Booking Sheet PDF (text or
  scanned/OCR via Tesseract.js) or paste text directly; it extracts shifts,
  the season start date, and day-off pattern automatically.
- **Manual entry** — add non-platform/standby, callup, and booking hours,
  and flag Sunday/stat-holiday days per day.
- **Pay rules** — configurable base rate, overtime multiplier/threshold,
  Sunday premium, stat holiday pay, and week start day.
- **Weekly summary** — gross pay breakdown (regular, overtime, non-platform,
  callup, booking, Sunday premium, stat holiday).
- **Live bus lookup** — search the four-digit number on a bus (or a route
  number) for its current position, speed, and how far off schedule it is,
  from OC Transpo's GTFS-Realtime feeds. Needs the `bus` edge function
  deployed — see [`supabase/functions/README.md`](supabase/functions/README.md).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech stack

- Next.js (App Router) + React + TypeScript
- pdfjs-dist for PDF text extraction, tesseract.js for OCR fallback
- Data persistence via a small storage abstraction (`src/lib/storage.ts`),
  backed by `localStorage` today so the app can run as a static export (e.g.
  GitHub Pages) with no server required. Swap it for real API calls to move
  to a server-backed database later without touching UI code.

## Deployment

`next.config.ts` supports building a static export with a GitHub Pages
`basePath` via the `GITHUB_PAGES=true` env var:

```bash
GITHUB_PAGES=true npm run build
```

A GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) builds and
publishes the `out/` directory to GitHub Pages automatically on push.
