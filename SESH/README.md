# SESH

SESH is a web tool for visualizing Spotify Extended Streaming History exports.

It lets a user drop `my_spotify_data.zip`, processes the data in-browser, and shows interactive stats such as:

- Top songs
- Top albums
- Top artists
- Time scopes: last 1 month, 1 year, 5 years, all-time, and calendar year

## Documentation

- Developer setup and local run instructions: `docs/developer-local-setup.md`
- Customer usage instructions: `docs/customer-guide.md`

## Quick Start

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/` and upload `my_spotify_data.zip`.

## Repository structure

- `frontend/`: React + Vite TypeScript application
- `docs/`: project documentation
- `rova_historical_data/`: local sample/export data artifacts
