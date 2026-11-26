# DJMyPlaylist

**DJMyPlaylist** is the automated counterpart to **MakeASet** in the `SpotKit` suite—an automatic song key & BPM playlist sequencer built with React, TypeScript, Vite, and the Spotify Web API.

## Features

- **Source & Optional Track Subset Limit (`X`)**: Uses your Spotify **Liked Songs** by default, accepts any **public Spotify playlist URL** (or merges both), and optionally lets you specify a subset cap of up to `X` tracks in the same dialog.
- **Full-Crate Song Key & BPM Resolution**: Scans every track in the selected crate (Spotify `/v1/audio-features` → ReccoBeats lookup → deterministic estimator) and resolves each track's song key (`1A`–`12B` / musical key).
- **Recursive & Iterative Sequencing with Narrated Live Logs**:
  1. Runs a full-crate harmonic and BPM census to identify dominant key pockets and tempo clusters.
  2. Executes multi-seed recursive lookahead search (depth-first beam search with backtracking) to prevent harmonic bottlenecks.
  3. Applies iterative 2-Opt segment reversals, weakest-link relocations, and subset pool upgrades—narrating every step in live thought-process logs.
- **Interactive Demo & Results Workbench**: Test the full workflow offline on curated mock crates, inspect the 24-key song key map, tune BPM/key metadata or subset limits on the fly, insert tracks from the unselected pool, and export the final ordered sequence straight to Spotify.

## Quick Start

```bash
cd DJMyPlaylist
npm install
npm run dev
```

Open `http://127.0.0.1:5175/`.

## Copyright & Disclaimer

Copyright © 2026 Rohan Varshney. All Rights Reserved. See root [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
DJMyPlaylist is an independent tool and is not affiliated with, endorsed by, or sponsored by Spotify AB.
