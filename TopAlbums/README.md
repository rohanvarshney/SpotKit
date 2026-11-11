# TopAlbums

**TopAlbums** is a React + Vite TypeScript web application in `SpotKit` that connects to the Spotify Web API via OAuth 2.0 PKCE, scans a user's **Liked Songs** (`/v1/me/tracks`) and **Top Tracks** (`/v1/me/top/tracks`), hydrates complete album tracklists (`/v1/albums`), and ranks their top albums.

## Features

- **Spotify OAuth 2.0 PKCE Login**: Pure client-side authentication (no client secret or backend server required).
- **Multi-Stage Loading View**: Live progress bar, stage indicators, and real-time streaming log while fetching Liked Songs, Top Tracks, and full album tracklists.
- **Weighted Album Scoring**:
  - **Bayesian % Liked**: Balances completion percentage (`liked_tracks / total_tracks`) with album depth so 1-track singles don't outrank 12-track albums.
  - **Liked Song Volume**: Rewards deeper albums with more liked songs.
  - **Top Tracks Boost**: Boosts albums containing tracks from your short-term, medium-term, or all-time Spotify Top Tracks.
  - **Popularity & Recency**: Optional weights for track popularity and when songs were liked.
- **Deluxe / Remastered Deduplication**: Automatically merges standard and deluxe/remastered editions of the same album.
- **Expandable Full Tracklist**: Click any album to inspect every track on the record—highlighting which tracks you've **Liked** (with date liked and Top Track rank) vs. **Not Liked Yet**.
- **Interactive Demo Mode**: Preview both the animated loading experience and the full dashboard without logging in.

## Quick Start

```bash
cd TopAlbums
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Configuring Your Spotify Client ID & Redirect URI

Edit `src/config/spotify.ts` to hardcode your Spotify Developer credentials:

```ts
export const SPOTIFY_CLIENT_ID = 'YOUR_SPOTIFY_CLIENT_ID_HERE'
export const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:5173/callback'
```
