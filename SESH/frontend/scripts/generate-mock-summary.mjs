#!/usr/bin/env node

/**
 * PURPOSE
 * -------
 * This script generates a realistic `mockSummary` fixture for the SESH frontend
 * from a real Spotify Extended Streaming History audio JSON file.
 *
 * WHY THIS EXISTS
 * ---------------
 * During UI development, we often want representative data without repeatedly
 * uploading large ZIP files through the app. A static mock summary enables fast
 * iteration on dashboard interactions, chart rendering, and edge-case handling.
 *
 * WHAT IT DOES
 * ------------
 * 1) Reads one `Streaming_History_Audio_*.json` file (top-level JSON array).
 * 2) Filters to music rows only (excludes episodes/audiobooks, requires track metadata).
 * 3) Aggregates by:
 *    - songs (`spotify_track_uri`)
 *    - albums (`album + artist` tuple)
 *    - artists (`album artist`)
 * 4) Computes:
 *    - total plays / total ms played
 *    - standard windows: last_1_month, last_1_year, last_5_years, all_time
 *    - yearly buckets keyed by calendar year (UTC)
 * 5) Writes `src/mocks/mockSummary.ts` as a strongly-typed fixture module.
 *
 * HOW TO RUN
 * ----------
 * npm run generate:mock -- "<absolute-or-relative-path-to-audio-json>" [--topN=10]
 *
 * EXAMPLE
 * -------
 * npm run generate:mock -- "../rova_historical_data/Spotify Extended Streaming History/Streaming_History_Audio_2016-2017_1.json" --topN=10
 *
 * NOTES
 * -----
 * - This is a developer utility, not runtime app code.
 * - It intentionally mirrors the app's aggregation semantics so mock mode is
 *   representative of production processing behavior.
 */

import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const args = process.argv.slice(2)
const inputArg = args.find((a) => !a.startsWith('--'))
const topNArg = args.find((a) => a.startsWith('--topN='))
const topN = topNArg ? Number(topNArg.split('=')[1]) : 10

if (!inputArg) {
  console.error('Usage: npm run generate:mock -- "<path-to-Streaming_History_Audio_*.json>" [--topN=10]')
  process.exit(1)
}
if (!Number.isFinite(topN) || topN <= 0) {
  console.error(`Invalid --topN value: ${topNArg}`)
  process.exit(1)
}

const inputPath = path.resolve(cwd, inputArg)
const outputPath = path.resolve(cwd, 'src/mocks/mockSummary.ts')

function safeStr(v) {
  return String(v ?? '').trim()
}

function parseTsMs(ts) {
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return null
  return ms
}

function subtractUtcYears(ms, years) {
  const d = new Date(ms)
  d.setUTCFullYear(d.getUTCFullYear() - years)
  return d.getTime()
}

function windowStartMs(key, maxTsMs) {
  if (key === 'last_1_month') return maxTsMs - 30 * 24 * 60 * 60 * 1000
  if (key === 'last_1_year') return subtractUtcYears(maxTsMs, 1)
  if (key === 'last_5_years') return subtractUtcYears(maxTsMs, 5)
  return Number.NEGATIVE_INFINITY
}

function upsert(map, key, label, s) {
  const prev = map.get(key)
  if (!prev) {
    map.set(key, {
      label,
      msPlayed: s.msPlayed,
      playCount: 1,
      skipCount: s.skipped ? 1 : 0,
      firstTsMs: s.tsMs,
      lastTsMs: s.tsMs,
    })
    return
  }
  prev.msPlayed += s.msPlayed
  prev.playCount += 1
  prev.skipCount += s.skipped ? 1 : 0
  prev.firstTsMs = Math.min(prev.firstTsMs, s.tsMs)
  prev.lastTsMs = Math.max(prev.lastTsMs, s.tsMs)
}

function topFromMap(map, limit) {
  const arr = [...map.entries()].map(([key, value]) => ({ key, ...value }))
  arr.sort((a, b) => b.msPlayed - a.msPlayed || b.playCount - a.playCount || a.label.localeCompare(b.label))
  return arr.slice(0, limit)
}

const raw = fs.readFileSync(inputPath, 'utf8')
const rows = JSON.parse(raw)
if (!Array.isArray(rows)) {
  console.error('Input JSON must be a top-level array.')
  process.exit(1)
}

const streams = []
for (const row of rows) {
  const trackUri = safeStr(row.spotify_track_uri)
  const trackName = safeStr(row.master_metadata_track_name)
  const artistName = safeStr(row.master_metadata_album_artist_name)
  const albumName = safeStr(row.master_metadata_album_album_name)
  const hasEpisode = safeStr(row.spotify_episode_uri) || safeStr(row.episode_name)
  const hasAudiobook = safeStr(row.audiobook_uri) || safeStr(row.audiobook_title)
  if (!trackUri || !trackName || !artistName) continue
  if (hasEpisode || hasAudiobook) continue

  const tsMs = parseTsMs(row.ts)
  if (tsMs === null) continue

  streams.push({
    tsMs,
    msPlayed: Number(row.ms_played ?? 0),
    skipped: Boolean(row.skipped),
    trackUri,
    trackName,
    artistName,
    albumName,
  })
}

if (streams.length === 0) {
  console.error('No valid music streams found in input file.')
  process.exit(1)
}

const minTsMs = Math.min(...streams.map((s) => s.tsMs))
const maxTsMs = Math.max(...streams.map((s) => s.tsMs))
const generatedAtTsMs = Date.now()

const windows = ['last_1_month', 'last_1_year', 'last_5_years', 'all_time']
const windowAcc = Object.fromEntries(
  windows.map((k) => [k, { songs: new Map(), albums: new Map(), artists: new Map() }]),
)
const yearlyAcc = {}

for (const s of streams) {
  const songKey = s.trackUri
  const songLabel = `${s.trackName} — ${s.artistName}`
  const albumKey = `album:${s.albumName}|artist:${s.artistName}`
  const albumLabel = s.albumName ? `${s.albumName} — ${s.artistName}` : `Unknown album — ${s.artistName}`
  const artistKey = `artist:${s.artistName}`
  const artistLabel = s.artistName

  const year = String(new Date(s.tsMs).getUTCFullYear())
  if (!yearlyAcc[year]) yearlyAcc[year] = { songs: new Map(), albums: new Map(), artists: new Map() }
  upsert(yearlyAcc[year].songs, songKey, songLabel, s)
  upsert(yearlyAcc[year].albums, albumKey, albumLabel, s)
  upsert(yearlyAcc[year].artists, artistKey, artistLabel, s)

  for (const k of windows) {
    if (s.tsMs < windowStartMs(k, maxTsMs)) continue
    upsert(windowAcc[k].songs, songKey, songLabel, s)
    upsert(windowAcc[k].albums, albumKey, albumLabel, s)
    upsert(windowAcc[k].artists, artistKey, artistLabel, s)
  }
}

const summary = {
  generatedAtTsMs,
  minTsMs,
  maxTsMs,
  totalMusicMsPlayed: streams.reduce((sum, s) => sum + s.msPlayed, 0),
  totalMusicPlays: streams.length,
  windows: Object.fromEntries(
    windows.map((k) => [
      k,
      {
        songs: topFromMap(windowAcc[k].songs, topN),
        albums: topFromMap(windowAcc[k].albums, topN),
        artists: topFromMap(windowAcc[k].artists, topN),
      },
    ]),
  ),
  yearly: Object.fromEntries(
    Object.entries(yearlyAcc)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, acc]) => [
        year,
        {
          songs: topFromMap(acc.songs, topN),
          albums: topFromMap(acc.albums, topN),
          artists: topFromMap(acc.artists, topN),
        },
      ]),
  ),
}

const fileComment = `// Derived from: ${inputPath.replaceAll('\\', '/')}\n// Generated by: scripts/generate-mock-summary.mjs (topN=${topN})\n`
const out = `import type { SummaryResult } from '../lib/spotify/types'\n\n${fileComment}\nexport const mockSummary: SummaryResult = ${JSON.stringify(summary, null, 2)}\n`
fs.writeFileSync(outputPath, out, 'utf8')

console.log(`Wrote mock summary to: ${outputPath}`)
