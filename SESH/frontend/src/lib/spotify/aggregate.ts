import { subYears } from 'date-fns'
import type { MusicStream, SpotifyExtendedStreamingRow, SummaryResult, TimeWindowKey, TopEntity } from './types'

function toTsMs(ts: string): number {
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${ts}`)
  return ms
}

function safeStr(v: string | null | undefined): string {
  return (v ?? '').trim()
}

function isMusicRow(row: SpotifyExtendedStreamingRow): boolean {
  const hasTrack = safeStr(row.spotify_track_uri) !== '' && safeStr(row.master_metadata_track_name) !== ''
  if (!hasTrack) return false

  const isEpisode = safeStr(row.spotify_episode_uri) !== '' || safeStr(row.episode_name) !== ''
  if (isEpisode) return false

  const isAudiobook = safeStr(row.audiobook_uri) !== '' || safeStr(row.audiobook_title) !== ''
  if (isAudiobook) return false

  return true
}

export function normalizeMusicStream(row: SpotifyExtendedStreamingRow): MusicStream | null {
  if (!isMusicRow(row)) return null

  const trackName = safeStr(row.master_metadata_track_name)
  const albumArtistName = safeStr(row.master_metadata_album_artist_name)
  const albumName = safeStr(row.master_metadata_album_album_name)
  if (!trackName || !albumArtistName) return null

  return {
    tsMs: toTsMs(row.ts),
    msPlayed: row.ms_played ?? 0,
    trackUri: safeStr(row.spotify_track_uri) || null,
    trackName,
    albumArtistName,
    albumName,
    skipped: Boolean(row.skipped),
  }
}

type Acc = {
  label: string
  msPlayed: number
  playCount: number
  skipCount: number
  firstTsMs: number
  lastTsMs: number
}

function upsert(map: Map<string, Acc>, key: string, label: string, s: MusicStream): void {
  const existing = map.get(key)
  if (!existing) {
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
  existing.label = existing.label || label
  existing.msPlayed += s.msPlayed
  existing.playCount += 1
  existing.skipCount += s.skipped ? 1 : 0
  existing.firstTsMs = Math.min(existing.firstTsMs, s.tsMs)
  existing.lastTsMs = Math.max(existing.lastTsMs, s.tsMs)
}

function toTopEntities(map: Map<string, Acc>, topN: number): TopEntity[] {
  const arr: TopEntity[] = []
  for (const [key, acc] of map.entries()) {
    arr.push({
      key,
      label: acc.label,
      msPlayed: acc.msPlayed,
      playCount: acc.playCount,
      skipCount: acc.skipCount,
      firstTsMs: acc.firstTsMs,
      lastTsMs: acc.lastTsMs,
    })
  }

  arr.sort((a, b) => b.msPlayed - a.msPlayed || b.playCount - a.playCount || a.label.localeCompare(b.label))
  return arr.slice(0, topN)
}

function songKey(s: MusicStream): { key: string; label: string } {
  if (s.trackUri) return { key: s.trackUri, label: `${s.trackName} — ${s.albumArtistName}` }
  const key = `name:${s.trackName}|artist:${s.albumArtistName}|album:${s.albumName}`
  return { key, label: `${s.trackName} — ${s.albumArtistName}` }
}

function albumKey(s: MusicStream): { key: string; label: string } {
  const key = `album:${s.albumName}|artist:${s.albumArtistName}`
  const label = s.albumName ? `${s.albumName} — ${s.albumArtistName}` : `Unknown album — ${s.albumArtistName}`
  return { key, label }
}

function artistKey(s: MusicStream): { key: string; label: string } {
  const key = `artist:${s.albumArtistName}`
  const label = s.albumArtistName
  return { key, label }
}

function windowStartMs(windowKey: TimeWindowKey, maxTsMs: number): number {
  switch (windowKey) {
    case 'last_1_month': {
      // Approximate month as 30 days; stable and fast.
      return maxTsMs - 30 * 24 * 60 * 60 * 1000
    }
    case 'last_1_year':
      return subYears(new Date(maxTsMs), 1).getTime()
    case 'last_5_years':
      return subYears(new Date(maxTsMs), 5).getTime()
    case 'all_time':
      return Number.NEGATIVE_INFINITY
  }
}

function yearKey(tsMs: number): string {
  return new Date(tsMs).getUTCFullYear().toString()
}

export function summarizeStreams(streams: MusicStream[], topN: number): SummaryResult {
  const generatedAtTsMs = Date.now()

  let minTsMs: number | null = null
  let maxTsMs: number | null = null
  let totalMusicMsPlayed = 0
  let totalMusicPlays = 0

  for (const s of streams) {
    minTsMs = minTsMs === null ? s.tsMs : Math.min(minTsMs, s.tsMs)
    maxTsMs = maxTsMs === null ? s.tsMs : Math.max(maxTsMs, s.tsMs)
    totalMusicMsPlayed += s.msPlayed
    totalMusicPlays += 1
  }

  const maxForWindows = maxTsMs ?? Date.now()

  const windows: SummaryResult['windows'] = {
    last_1_month: { songs: [], albums: [], artists: [] },
    last_1_year: { songs: [], albums: [], artists: [] },
    last_5_years: { songs: [], albums: [], artists: [] },
    all_time: { songs: [], albums: [], artists: [] },
  }

  const yearly: SummaryResult['yearly'] = {}

  const windowAcc = ((): Record<
    TimeWindowKey,
    { songs: Map<string, Acc>; albums: Map<string, Acc>; artists: Map<string, Acc> }
  > => ({
    last_1_month: { songs: new Map(), albums: new Map(), artists: new Map() },
    last_1_year: { songs: new Map(), albums: new Map(), artists: new Map() },
    last_5_years: { songs: new Map(), albums: new Map(), artists: new Map() },
    all_time: { songs: new Map(), albums: new Map(), artists: new Map() },
  }))()

  const yearAcc: Record<string, { songs: Map<string, Acc>; albums: Map<string, Acc>; artists: Map<string, Acc> }> = {}

  const windowStarts: Record<TimeWindowKey, number> = {
    last_1_month: windowStartMs('last_1_month', maxForWindows),
    last_1_year: windowStartMs('last_1_year', maxForWindows),
    last_5_years: windowStartMs('last_5_years', maxForWindows),
    all_time: windowStartMs('all_time', maxForWindows),
  }

  for (const s of streams) {
    const y = yearKey(s.tsMs)
    if (!yearAcc[y]) yearAcc[y] = { songs: new Map(), albums: new Map(), artists: new Map() }

    const song = songKey(s)
    const album = albumKey(s)
    const artist = artistKey(s)

    upsert(yearAcc[y].songs, song.key, song.label, s)
    upsert(yearAcc[y].albums, album.key, album.label, s)
    upsert(yearAcc[y].artists, artist.key, artist.label, s)

    ;(Object.keys(windowAcc) as TimeWindowKey[]).forEach((wk) => {
      if (s.tsMs < windowStarts[wk]) return
      upsert(windowAcc[wk].songs, song.key, song.label, s)
      upsert(windowAcc[wk].albums, album.key, album.label, s)
      upsert(windowAcc[wk].artists, artist.key, artist.label, s)
    })
  }

  ;(Object.keys(windows) as TimeWindowKey[]).forEach((wk) => {
    windows[wk] = {
      songs: toTopEntities(windowAcc[wk].songs, topN),
      albums: toTopEntities(windowAcc[wk].albums, topN),
      artists: toTopEntities(windowAcc[wk].artists, topN),
    }
  })

  for (const [y, acc] of Object.entries(yearAcc)) {
    yearly[y] = {
      songs: toTopEntities(acc.songs, topN),
      albums: toTopEntities(acc.albums, topN),
      artists: toTopEntities(acc.artists, topN),
    }
  }

  return {
    generatedAtTsMs,
    minTsMs,
    maxTsMs,
    totalMusicMsPlayed,
    totalMusicPlays,
    windows,
    yearly,
  }
}

