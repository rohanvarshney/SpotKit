# MakeASet

**MakeASet** is an interactive harmonic & tempo set-building web application in the `SpotKit` suite built with React, TypeScript, Vite, and the Spotify Web API.

## Features

- **Source Confirmation & Public Playlist URL Support**: Assumes your Spotify **Liked Songs** by default and pauses at a confirmation dialog where you explicitly click **Continue**, or paste a public Spotify playlist URL (or combine both into one crate).
- **Track-by-Track Harmonic & BPM Analysis**: Resolves tempo, pitch class, mode, and energy per track (trying Spotify `/v1/audio-features`, with automatic fallback to ReccoBeats public audio lookup and deterministic metadata estimation) and resolves every track's **song key** (`1A`–`12B` / musical key).
- **Cohesion-Ranked Next-Track Sequencing**:
  1. Filter and choose your opening track from the analyzed crate.
  2. Every remaining track is scored (`0–100% Cohesion`) against your **newest selected song** based on song key harmonic distance, BPM proximity (including half/double-time locks), and energy continuity.
  3. With every pick or revert, all remaining tracks automatically re-sort by Cohesion Score around the newest anchor.
- **Final Tracklist & Spotify Export**: Click **End Set** at any time to review the complete sequenced tracklist and transition cohesion scores, then either **Re-Edit from Last Point** or **Turn into Playlist on Spotify**.
- **Interactive Demo Mode**: Try the full workflow—including source confirmation, track-by-track analysis, cohesion re-sorting, revert, and playlist export preview—without signing in.

## Quick Start

```bash
cd MakeASet
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`.

## Copyright & Disclaimer

Copyright © 2026 Rohan Varshney. All Rights Reserved. See root [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
MakeASet is an independent tool and is not affiliated with, endorsed by, or sponsored by Spotify AB.
