import { describe, expect, it } from 'vitest'
import type { SpotifyExtendedStreamingRow } from './types'
import { normalizeMusicStream, summarizeStreams } from './aggregate'

describe('normalizeMusicStream', () => {
  it('keeps valid music rows', () => {
    const row: SpotifyExtendedStreamingRow = {
      ts: '2019-02-04T03:54:56Z',
      ms_played: 245639,
      spotify_track_uri: 'spotify:track:abc',
      master_metadata_track_name: 'Hurt Feelings',
      master_metadata_album_artist_name: 'Mac Miller',
      master_metadata_album_album_name: 'Swimming',
      skipped: false,
    }

    const s = normalizeMusicStream(row)
    expect(s).not.toBeNull()
    expect(s?.trackUri).toBe('spotify:track:abc')
    expect(s?.albumArtistName).toBe('Mac Miller')
  })

  it('filters out episode rows even if other fields exist', () => {
    const row: SpotifyExtendedStreamingRow = {
      ts: '2017-07-05T16:39:59Z',
      ms_played: 7118,
      spotify_track_uri: 'spotify:track:abc',
      master_metadata_track_name: 'Fake',
      master_metadata_album_artist_name: 'Artist',
      master_metadata_album_album_name: 'Album',
      episode_name: 'The Rundown',
      spotify_episode_uri: 'spotify:episode:123',
    }

    expect(normalizeMusicStream(row)).toBeNull()
  })
})

describe('summarizeStreams', () => {
  it('builds all-time top lists and yearly buckets', () => {
    const base = {
      trackUri: 'spotify:track:t1',
      trackName: 'Song 1',
      albumArtistName: 'Artist 1',
      albumName: 'Album 1',
      skipped: false,
    }

    const streams = [
      { ...base, tsMs: Date.parse('2025-01-02T00:00:00Z'), msPlayed: 60_000 },
      { ...base, tsMs: Date.parse('2025-01-03T00:00:00Z'), msPlayed: 120_000 },
      { ...base, tsMs: Date.parse('2026-01-03T00:00:00Z'), msPlayed: 30_000 },
    ]

    const summary = summarizeStreams(streams, 10)
    expect(summary.totalMusicPlays).toBe(3)
    expect(summary.windows.all_time.songs[0].key).toBe('spotify:track:t1')
    expect(Object.keys(summary.yearly)).toContain('2025')
    expect(Object.keys(summary.yearly)).toContain('2026')
  })
})

