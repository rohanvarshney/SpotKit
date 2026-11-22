# SpotKit Maintenance Scripts

This directory contains offline developer tooling for maintaining SpotKit's static demo assets without adding runtime API dependencies or committing binary media files into git.

---

## `sync-demo-artwork.mjs`

### Context & Why This Exists

SpotKit's demo/mock album catalog lives in [`../shared/demoCatalogCore.ts`](../shared/demoCatalogCore.ts) and is re-exported by [`../shared/spotkitDemoCatalog.ts`](../shared/spotkitDemoCatalog.ts) (`SPOTKIT_DEMO_ALBUMS`, currently 118 real albums combined from `shared/baseCatalogData.ts`, `shared/expandedMainstreamAlbums.ts`, and `shared/expandedDanceAlbums.ts`).

Because SpotKit runs as a static client-side suite on GitHub Pages and Demo Mode has no authenticated Spotify Web API session:

1. **No runtime Spotify API calls:** Demo Mode cannot hit authenticated `api.spotify.com/v1/*` endpoints to fetch album images.
2. **No image binaries in git:** Checking 118 copyrighted album covers into the repository would bloat git history and re-host third-party artwork.
3. **Deterministic over runtime search:** Querying search APIs from end-user browsers is slow, rate-limited (e.g., iTunes caps per IP and blocks browser `fetch()` via CORS), and non-deterministic (search rankings can drift to tribute albums, instrumentals, or wrong editions).

To solve this, `sync-demo-artwork.mjs` separates **offline discovery** (run once by a maintainer when the demo catalog changes) from **runtime delivery** (reading a static, sorted JSON map in [`../assets/demoArtworkManifest.json`](../assets/demoArtworkManifest.json) via [`../shared/demoArtwork.ts`](../shared/demoArtwork.ts)).

### Scope Boundary (SpotKit Demo Mode: `TopAlbums`, `MakeASet`, and `DJMyPlaylist`)

This artwork manifest is shared across SpotKit's album/track demo tools via [`../shared/demoArtwork.ts`](../shared/demoArtwork.ts) (`isDemo === true` only):

- **Shared resolver (`shared/demoArtwork.ts`):** Reads [`../assets/demoArtworkManifest.json`](../assets/demoArtworkManifest.json), resolves each album's pinned HTTPS CDN URL alongside its deterministic `createCoverSvg()` fallback from [`../shared/demoCatalogCore.ts`](../shared/demoCatalogCore.ts), and exports `buildDemoAlbumImages()`, `resolveDemoAlbumArtwork()`, and `applyFallbackImageOnError()`.
- **`TopAlbums` (`TopAlbums/src/mocks/demoData.ts`, `TopAlbums/src/lib/albumScorer.ts`, `TopAlbums/src/components/DashboardView.tsx`):** `buildDemoLibraryDataset()` populates `images[0]` with the pinned manifest URL (`width: 600` / `500`) and keeps the generated vinyl `createCoverSvg()` data URI at `images[1]` as a local fallback (`hydrateDemoAlbumById()` automatically inherits the same `images` array). All four cover `<img>` views (`tableThumb`, `gridAlbumCover`, `tierTileCover`, `customTierThumb`) attach `handleAlbumCoverError` (delegating to `applyFallbackImageOnError`) so offline browsers or broken URLs degrade smoothly to the SVG cover.
- **Demo-only Canvas CORS handling (`TopAlbums/src/lib/shareImageExporter.ts`):** Apple (`mzstatic.com`) and Deezer/CAA redirects do not always send `Access-Control-Allow-Origin: *`, which would taint HTML5 `<canvas>` exports (`toBlob` / `toDataURL`). When `options.isDemo` is `true`, `loadAlbumCoverSafe()` routes known non-CORS demo CDNs (`mzstatic.com`, `coverartarchive.org`, `archive.org`, `dzcdn.net`) through `https://wsrv.nl/?url=...&w=600&h=600&fit=cover&output=png`, and falls back to `album.fallbackCoverUrl` if that fails.
- **`MakeASet` & `DJMyPlaylist` (`shared/spotkitDemoCatalog.ts`, `MakeASet/`, `DJMyPlaylist/`):** `buildSharedDemoTracksForMode()` resolves each crate track's `albumArtUrl` from `assets/demoArtworkManifest.json` via `resolveDemoAlbumArtwork()` and attaches `fallbackAlbumArtUrl` for offline/error resilience. Track `<img>` surfaces (`SetBuilderView.tsx`, `FinalTracklistView.tsx`, and `PlaylistResultView.tsx`) attach `applyFallbackImageOnError`.
- **Production Spotify data & `SESH` untouched:** Real Spotify sessions (`spotifyApi.ts` across `TopAlbums`, `MakeASet`, and `DJMyPlaylist`) only receive `https://i.scdn.co/...` URLs with no `data:image/` fallback, so `fallbackCoverUrl` / `fallbackAlbumArtUrl` remains `undefined` and `TopAlbums` `renderShareImageCanvas()` loads `album.coverUrl` directly without calling `wsrv.nl`. `SESH` has no album cover UI and does not use `SPOTKIT_DEMO_ALBUMS`, so it remains untouched.

---

### How the Script Works

- **Zero external dependencies:** Uses Node's built-in `node:module` `registerHooks` and native TypeScript type-stripping (requires **Node 22.15+ / 26+**) to import `../shared/demoCatalogCore.ts` (kept free of JSON imports so `--refresh` works even before a manifest exists) with no `npm install` or build step.
- **Resolution cascade (in priority order):**
  1. **`MANUAL_OVERRIDES`:** Explicit per-`albumId` overrides inside `scripts/sync-demo-artwork.mjs` (checked and HTTP-verified first; kept empty unless automated lookup cannot disambiguate a release).
  2. **Apple iTunes Search & Artist Lookup API (`source: "itunes"`):**
     - Groups unresolved albums by `artistName` so multi-album artists share one `attribute=artistTerm` query (`limit=50`).
     - Falls back to a direct `term` query (`limit=15`) using `QUERY_HINTS[id].term` when defined, and if Apple's search index still omits an explicit or newer release (e.g., *BRAT*, *Actual Life 3*), resolves the artist's `artistId` and fetches their full catalog via `https://itunes.apple.com/lookup?id=<artistId>&entity=album&limit=100&country=US` (cached per `artistId` during the run).
     - Rewrites `artworkUrl100` to `600x600bb.jpg`.
  3. **MusicBrainz + Cover Art Archive (`source: "coverartarchive"`):**
     - If iTunes yields no candidate meeting `HIGH_CONFIDENCE_THRESHOLD` (`85`), queries MusicBrainz `/ws/2/release-group` trying `spec.artistName` and any `QUERY_HINTS[id].artistAliases`, scores returned release groups by artist credit, normalized title, `primary-type` (`Album` vs `Single`/`EP`), `secondary-types`, unwanted edition variants, and release year, then checks `https://coverartarchive.org/release-group/{mbid}/front-500`.
- **Candidate hygiene & scoring:**
  - Rejects karaoke, tribute, lullaby, 8-bit, Vitamin String Quartet, and Kidz Bop entries (`JUNK_PATTERN`).
  - Hard-rejects (`-300`) unwanted edition keywords (`instrumental`/`instrumentals`, `piano`, `remix`/`remixes`, `b-sides`, `commentary`, `a cappella`, `sped up`, `slowed`, `reverb`, `clean version`, `8d audio`, `live`) whenever those keywords do not appear in the catalog album title.
  - Rejects `- Single` / `<= 2`-track candidates when the catalog entry is a multi-track `album` (`>= 5` tracks), and avoids matching shorter substrings against numbered sequels (e.g., *Actual Life - EP* cannot match *Actual Life 3*).
- **Rate limiting, verification, and atomic persistence:**
  - Enforces `2200ms` between iTunes calls and `1500ms` between MusicBrainz calls, with `[15s, 30s, 60s]` backoff retries on HTTP `403`/`429`/`503` and fast-fail circuit breaking if outbound DNS/network is blocked.
  - Verifies every resolved URL before writing via HTTP `HEAD` (falling back to `GET` with `Range: bytes=0-0` on `405`/`501`), requiring `200`/`206` and `Content-Type: image/*`.
  - Persists [`../assets/demoArtworkManifest.json`](../assets/demoArtworkManifest.json) after every artist batch with alphabetically sorted keys so interrupted runs resume cleanly without redoing completed albums.

### Manifest Schema (`assets/demoArtworkManifest.json`)

```json
{
  "catalogVersion": "2026.2-unified",
  "generatedAt": "2026-11-21T01:08:12.024Z",
  "albums": {
    "alb_currents": {
      "url": "https://is1-ssl.mzstatic.com/image/thumb/.../600x600bb.jpg",
      "source": "itunes",
      "width": 600,
      "height": 600,
      "matchedArtist": "Tame Impala",
      "matchedAlbum": "Currents"
    }
  }
}
```

---

## Command Reference

Run all commands from the **SpotKit repository root** (note: commands other than `--audit` require outbound HTTPS access to `itunes.apple.com`, `musicbrainz.org`, `coverartarchive.org`, and `mzstatic.com` / `archive.org`).

### 1. Incremental Sync (Default — After Adding New Demo Albums)

```bash
# Reads shared/spotkitDemoCatalog.ts and assets/demoArtworkManifest.json, then
# resolves ONLY albums whose IDs are missing (or have an empty URL) in the manifest.
# Safe to re-run after interruptions because progress is saved after every artist.
node scripts/sync-demo-artwork.mjs
```

### 2. Targeted Re-Resolution (After Tuning `QUERY_HINTS` or Fixing Specific Albums)

```bash
# Re-runs resolution ONLY for the comma-separated album IDs (overwriting their
# existing manifest entries) while leaving all other manifest entries untouched.
# Useful right after editing QUERY_HINTS or MANUAL_OVERRIDES for a single release,
# and also accepts space-separated syntax: `--only alb_currents,alb_brat`.
node scripts/sync-demo-artwork.mjs --only=alb_currents,alb_brat
```

### 3. Full Refresh (Rebuild Manifest From Scratch)

```bash
# Ignores the existing assets/demoArtworkManifest.json and re-resolves every
# album in SPOTKIT_DEMO_ALBUMS from scratch (takes ~3–5 minutes due to polite
# iTunes and MusicBrainz rate limits).
node scripts/sync-demo-artwork.mjs --refresh
```

### 4. Offline Catalog-to-Match Audit (Zero Network Requests)

```bash
# Compares every album in SPOTKIT_DEMO_ALBUMS against assets/demoArtworkManifest.json
# locally and prints:
#   <id> | <catalogArtist> — <catalogAlbum> => <matchedArtist> — <matchedAlbum> [<source>]
# Run this after every sync or `--only` update to catch edition mismatches (such
# as instrumentals, remixes, singles vs. albums, or homonym albums by other artists).
node scripts/sync-demo-artwork.mjs --audit
```

### 5. Live URL Link-Rot Verification

```bash
# Confirms every album in SPOTKIT_DEMO_ALBUMS is present in the manifest and sends
# live HTTP HEAD (or Range GET) checks to every pinned URL, asserting HTTP 200/206
# and an `image/*` Content-Type. Exits with code 1 if any album is missing or broken.
node scripts/sync-demo-artwork.mjs --verify
```

### 6. Validate SpotKit Tool Integrations After Manifest Updates

```bash
# 1. Runs unit tests (including manifest completeness for all demo albums/tracks
#    and SVG fallback assignment) and `tsc -b` + Vite production builds
#    (type-checking the static JSON import via each tool's tsconfig.app.json).
(cd TopAlbums && npm test && npm run build)
(cd MakeASet && npm test && npm run build)
(cd DJMyPlaylist && npm test && npm run build)
```

---

## Handling Tricky Albums (`QUERY_HINTS` vs. `MANUAL_OVERRIDES`)

When adding new albums to `shared/` or fixing an edition mismatch surfaced by `--audit`:

1. **Prefer `QUERY_HINTS` first** (in `scripts/sync-demo-artwork.mjs`):
   - Use `term` when streaming services index the release under a long or differently formatted title (e.g., `alb_brat_deluxe` → `Brat and it's the same but there's three more songs so it's not`, or `alb_lush` whose ID doesn't match the album title *Be the Cowboy*).
   - Use `albumAliases` when punctuation, subtitles, or EP/edition formatting differs (e.g., `alb_emotion` for *E•MO•TION* vs. *Emotion*, `alb_vroom_ep` for *Vroom Vroom EP* vs. *Vroom Vroom*).
   - Use `artistAliases` when Apple Music credits a collaborative or band name (e.g., `Prince & The Revolution`, `Bruno Mars, Anderson .Paak & Silk Sonic`, `Chris Lake & Abel Balder`).
   - Use `requireSubstrings` when multiple similarly named editions exist and a specific tag must appear (e.g., `["taylor's version"]` on `alb_1989_tv`).
2. **Use `MANUAL_OVERRIDES` only as a last resort:**
   - If neither iTunes nor MusicBrainz/CAA returns the right cover cleanly, add `{ url, source, width, height, matchedArtist, matchedAlbum }` under `MANUAL_OVERRIDES[albumId]` (the script still runs `verifyImageUrl()` on it before saving).
3. **Re-run `--only=<id>`, `--audit`, `--verify`, and the unit tests + builds for `TopAlbums`, `MakeASet`, and `DJMyPlaylist`** before committing changes to `scripts/sync-demo-artwork.mjs` and `assets/demoArtworkManifest.json`.
