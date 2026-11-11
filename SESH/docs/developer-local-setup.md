# Developer Guide: Run SESH Locally

This guide explains how to run, test, and iterate on SESH on your local machine.

## What this project is

SESH is a client-side web app that:

- Accepts Spotify export ZIP files (`my_spotify_data.zip`)
- Parses `Streaming_History_Audio_*.json` entries in-browser
- Computes compressed aggregate stats (songs, albums, artists)
- Renders an interactive dashboard by time windows and calendar year

The current implementation lives in `frontend/` and is built with React + Vite + TypeScript.

## Prerequisites

- Node.js 20+ (recommended)
- npm 10+

Check versions:

```bash
node -v
npm -v
```

## Project layout

- `frontend/`: Web application
- `frontend/src/workers/spotifyProcessor.worker.ts`: ZIP processing worker
- `frontend/src/lib/spotify/*`: parsing, normalization, aggregation, types
- `frontend/src/features/*`: upload/loading/dashboard UI
- `frontend/src/mocks/mockSummary.ts`: mock flow data
- `rova_historical_data/`: local sample Spotify data (not required in production)

## Install dependencies

From repository root:

```bash
cd frontend
npm install
```

## Run in development

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:

- `http://127.0.0.1:5173/`

## Build for production

```bash
npm run build
```

Output is generated in:

- `frontend/dist/`

Preview production build locally:

```bash
npm run preview
```

## Run quality checks

Lint:

```bash
npm run lint
```

Tests:

```bash
npm test
```

Current tests cover key aggregation behavior:

- Music row normalization
- Episode row filtering
- Window/year aggregate generation

## Development workflow

1. Run app with `npm run dev`
2. Enable **mock mode** for UI iteration without uploading ZIP
3. Validate with real `my_spotify_data.zip`
4. Run `npm run lint` and `npm test`
5. Run `npm run build` before finalizing changes

## Data-processing behavior (important)

The pipeline currently:

- Reads ZIP in-browser using `jszip`
- Parses only `Streaming_History_Audio_*.json`
- Filters non-music rows (episodes/audiobooks)
- Uses `ms_played` as primary ranking metric
- Computes:
  - Last 1 month
  - Last 1 year
  - Last 5 years
  - All-time
  - Per-calendar-year buckets

## Troubleshooting

### ZIP uploads but no data appears

- Confirm the ZIP contains `Streaming_History_Audio_*.json` files
- Verify data is not only podcast/video history
- Check browser console for worker errors

### Dev server starts but page is blank

- Run `npm run lint` and `npm run build` for compile/runtime clues
- Ensure no stale worker errors in browser console

### Large ZIPs feel slow

- Processing is CPU-heavy but runs in a Web Worker to avoid UI lockups
- Keep browser tab focused during heavy parsing
- Use mock mode for quick component iteration

## Extending the app

Common additions:

- Add more KPIs in `Dashboard.tsx`
- Add richer chart variants in `TopEntitiesChart.tsx`
- Add custom filters in `aggregate.ts`
- Add more representative fixtures to `mockSummary.ts`

When changing aggregation logic, update/add tests in:

- `frontend/src/lib/spotify/aggregate.test.ts`
