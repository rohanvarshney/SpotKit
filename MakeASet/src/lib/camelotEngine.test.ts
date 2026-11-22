// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { describe, expect, it } from 'vitest'
import {
  ALL_CAMELOT_CODES,
  camelotToPitchAndMode,
  computeCohesionScore,
  estimateTrackAudioFeatures,
  getCompatibleCamelotKeys,
  parsePlaylistId,
  pitchAndModeToCamelot,
  rankRemainingTracksByCohesion,
} from './camelotEngine'
import {
  DEMO_ARTWORK_ALBUMS,
  DEMO_LIKED_TRACK_COUNT,
  DEMO_PLAYLIST_PRESETS,
  SPOTKIT_DEMO_ALBUMS,
  SPOTKIT_DEMO_CATALOG_VERSION,
  SPOTKIT_DEMO_CRATE_TRACKS,
  buildDemoCrate,
} from '../mocks/demoData'
import type { AnalyzedTrack } from '../types/spotify'

function makeTrack(overrides: Partial<AnalyzedTrack>): AnalyzedTrack {
  return {
    id: overrides.id ?? 't1',
    uri: overrides.uri ?? 'spotify:track:t1',
    name: overrides.name ?? 'Test Track',
    artists: overrides.artists ?? ['Test Artist'],
    artistNames: overrides.artistNames ?? 'Test Artist',
    albumName: overrides.albumName ?? 'Test Album',
    albumId: overrides.albumId ?? 'alb1',
    albumArtUrl: overrides.albumArtUrl ?? null,
    durationMs: overrides.durationMs ?? 210000,
    popularity: overrides.popularity ?? 70,
    externalUrl: overrides.externalUrl ?? null,
    previewUrl: overrides.previewUrl ?? null,
    isrc: overrides.isrc ?? null,
    bpm: overrides.bpm ?? 122,
    camelot: overrides.camelot ?? '8A',
    musicalKey: overrides.musicalKey ?? 'Am',
    pitchClass: overrides.pitchClass ?? 9,
    mode: overrides.mode ?? 0,
    energy: overrides.energy ?? 0.72,
    danceability: overrides.danceability ?? 0.75,
    valence: overrides.valence ?? 0.5,
    featureSource: overrides.featureSource ?? 'curated',
    sources: overrides.sources ?? ['liked'],
  }
}

describe('camelotEngine', () => {
  it('maps Spotify pitch class & mode accurately to Camelot Wheel codes', () => {
    expect(pitchAndModeToCamelot(0, 1)).toMatchObject({
      camelot: '8B',
      musicalKey: 'C',
    })
    expect(pitchAndModeToCamelot(9, 0)).toMatchObject({
      camelot: '8A',
      musicalKey: 'Am',
    })
    expect(pitchAndModeToCamelot(4, 0)).toMatchObject({
      camelot: '9A',
      musicalKey: 'Em',
    })
    expect(pitchAndModeToCamelot(7, 1)).toMatchObject({
      camelot: '9B',
      musicalKey: 'G',
    })

    const roundTrip = camelotToPitchAndMode('12A')
    expect(roundTrip.musicalKey).toBe('C#m')
    expect(pitchAndModeToCamelot(roundTrip.pitchClass, roundTrip.mode).camelot).toBe('12A')
  })

  it('computes compatible Camelot neighbor keys wrapping around 12 and 1', () => {
    const aroundOne = getCompatibleCamelotKeys('1A')
    expect(aroundOne.exact).toBe('1A')
    expect(aroundOne.relative).toBe('1B')
    expect(aroundOne.fifthUp).toBe('2A')
    expect(aroundOne.fifthDown).toBe('12A')

    const aroundTwelve = getCompatibleCamelotKeys('12B')
    expect(aroundTwelve.relative).toBe('12A')
    expect(aroundTwelve.fifthUp).toBe('1B')
    expect(aroundTwelve.fifthDown).toBe('11B')
  })

  it('parses public Spotify playlist URLs, URIs, and raw IDs', () => {
    expect(
      parsePlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=12345'),
    ).toBe('37i9dQZF1DXcBWIGoYBM5M')
    expect(
      parsePlaylistId('https://open.spotify.com/user/spotify/playlist/4rnleEAOdmFAbRcNCgZMpY'),
    ).toBe('4rnleEAOdmFAbRcNCgZMpY')
    expect(parsePlaylistId('spotify:playlist:5Rrf7mqN8uus2AaQQQNdc1')).toBe(
      '5Rrf7mqN8uus2AaQQQNdc1',
    )
    expect(parsePlaylistId('4rnleEAOdmFAbRcNCgZMpY')).toBe('4rnleEAOdmFAbRcNCgZMpY')
    expect(parsePlaylistId('https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh')).toBeNull()
    expect(parsePlaylistId('')).toBeNull()
  })

  it('scores harmonic + BPM cohesion higher for closer keys and tempos', () => {
    const anchor = makeTrack({ id: 'a', camelot: '8A', bpm: 122, energy: 0.72 })
    const exactMatch = makeTrack({ id: 'b', camelot: '8A', bpm: 122, energy: 0.74 })
    const fifthMatch = makeTrack({ id: 'c', camelot: '9A', bpm: 124, energy: 0.76 })
    const clash = makeTrack({ id: 'd', camelot: '2B', bpm: 92, energy: 0.35 })

    const sExact = computeCohesionScore(anchor, exactMatch)
    const sFifth = computeCohesionScore(anchor, fifthMatch)
    const sClash = computeCohesionScore(anchor, clash)

    expect(sExact.totalScore).toBe(100)
    expect(sExact.tier).toBe('perfect')
    expect(sFifth.totalScore).toBeGreaterThan(80)
    expect(sFifth.totalScore).toBeLessThan(sExact.totalScore)
    expect(sClash.totalScore).toBeLessThan(35)
    expect(sClash.tier).toBe('clash')
  })

  it('recognizes half-time and double-time BPM locks', () => {
    const house = makeTrack({ id: 'h', camelot: '8A', bpm: 128, energy: 0.75 })
    const halftimeTrap = makeTrack({ id: 't', camelot: '8A', bpm: 64, energy: 0.74 })
    const breakdown = computeCohesionScore(house, halftimeTrap)

    expect(breakdown.usedHalfDoubleTime).toBe(true)
    expect(breakdown.effectiveBpmDiff).toBe(0)
    expect(breakdown.bpmScore).toBeGreaterThanOrEqual(36)
  })

  it('dynamically re-sorts remaining songs based on the newest selected anchor', () => {
    const opener = makeTrack({ id: 't1', camelot: '8A', bpm: 120, energy: 0.65 })
    const melodic = makeTrack({ id: 't2', camelot: '9A', bpm: 121, energy: 0.7 })
    const disco = makeTrack({ id: 't3', camelot: '3B', bpm: 112, energy: 0.55 })
    const peak = makeTrack({ id: 't4', camelot: '9A', bpm: 125, energy: 0.85 })
    const discoFollowup = makeTrack({ id: 't5', camelot: '4B', bpm: 113, energy: 0.58 })

    // Anchored on opener (8A, 120): melodic (9A, 121) should rank #1
    const afterOpener = rankRemainingTracksByCohesion(opener, [
      disco,
      peak,
      melodic,
      discoFollowup,
    ])
    expect(afterOpener[0].track.id).toBe('t2')

    // If user instead picks disco (3B, 112) as newest anchor, discoFollowup (4B, 113) jumps to #1
    const afterDisco = rankRemainingTracksByCohesion(disco, [
      melodic,
      peak,
      discoFollowup,
    ])
    expect(afterDisco[0].track.id).toBe('t5')
  })

  it('produces deterministic fallback estimates when audio-features are unavailable', () => {
    const sample = {
      id: 'abc123track',
      name: 'Sunset Groove (Extended Mix)',
      duration_ms: 360000,
      popularity: 68,
      artists: [{ id: 'art1', name: 'Sample Producer' }],
      album: { id: 'alb1', name: 'Club Sessions', images: [] },
      external_ids: { isrc: 'US1234567890' },
    }
    const first = estimateTrackAudioFeatures(sample)
    const second = estimateTrackAudioFeatures(sample)
    expect(first).toEqual(second)
    expect(first.bpm).toBeGreaterThanOrEqual(118)
    expect(first.bpm).toBeLessThanOrEqual(129)
  })

  it('builds complete demo crates for liked, preset playlists, custom pasted URLs, and combined mode', () => {
    const likedCrate = buildDemoCrate('liked')
    expect(likedCrate.isDemo).toBe(true)
    expect(likedCrate.playlistMeta).toBeNull()
    expect(likedCrate.tracks.length).toBeGreaterThanOrEqual(20)
    expect(likedCrate.tracks.every((t) => t.sources.includes('liked'))).toBe(true)
    expect(
      likedCrate.tracks.every(
        (t) =>
          t.albumArtUrl === DEMO_ARTWORK_ALBUMS[t.albumId]?.url &&
          t.albumArtUrl?.startsWith('https://') &&
          t.fallbackAlbumArtUrl?.startsWith('data:image/svg+xml'),
      ),
    ).toBe(true)

    const preset = DEMO_PLAYLIST_PRESETS[2]
    const presetCrate = buildDemoCrate('playlist', preset.url)
    expect(presetCrate.playlistMeta?.id).toBe(preset.id)
    expect(presetCrate.playlistMeta?.name).toBe(preset.name)
    expect(presetCrate.tracks.length).toBeGreaterThanOrEqual(8)

    const customUrl = 'https://open.spotify.com/playlist/7xMockCustomId12345678?si=abc'
    const customCrate = buildDemoCrate('both', customUrl)
    expect(customCrate.playlistMeta?.id).toBe('7xMockCustomId12345678')
    expect(customCrate.likedCount).toBeGreaterThan(0)
    expect(customCrate.playlistCount).toBeGreaterThan(0)

    const ranked = rankRemainingTracksByCohesion(
      customCrate.tracks[0],
      customCrate.tracks.slice(1),
    )
    expect(ranked.length).toBe(customCrate.tracks.length - 1)
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].cohesion.totalScore).toBeGreaterThanOrEqual(
        ranked[i].cohesion.totalScore,
      )
    }
  })

  it('uses the unified shared catalog across all 8 genre presets, 24 Camelot keys, and TopAlbums metadata', () => {
    expect(SPOTKIT_DEMO_CATALOG_VERSION).toBe('2026.2-unified')
    expect(SPOTKIT_DEMO_ALBUMS.length).toBeGreaterThanOrEqual(110)
    expect(SPOTKIT_DEMO_CRATE_TRACKS.length).toBeGreaterThanOrEqual(100)
    expect(DEMO_PLAYLIST_PRESETS.length).toBe(8)

    const albumById = new Map(SPOTKIT_DEMO_ALBUMS.map((a) => [a.id, a]))
    for (const seed of SPOTKIT_DEMO_CRATE_TRACKS) {
      const album = albumById.get(seed.albumId)
      expect(album).toBeDefined()
      expect(seed.albumName).toBe(album?.name)
      const matched = album?.tracks.find((t) => t.name === seed.name)
      expect(matched).toBeDefined()
      expect(seed.inLiked).toBe(matched?.liked)
    }

    const likedCrate = buildDemoCrate('liked')
    expect(likedCrate.tracks.length).toBe(DEMO_LIKED_TRACK_COUNT)

    const coveredKeys = new Set(SPOTKIT_DEMO_CRATE_TRACKS.map((t) => t.camelot))
    for (const code of ALL_CAMELOT_CODES) {
      expect(coveredKeys.has(code)).toBe(true)
    }

    for (const preset of DEMO_PLAYLIST_PRESETS) {
      const presetCrate = buildDemoCrate('playlist', preset.url)
      expect(presetCrate.playlistMeta?.id).toBe(preset.id)
      expect(presetCrate.tracks.length).toBeGreaterThanOrEqual(10)
    }
  })

  it('wires pinned artwork manifest URLs and SVG fallbacks for every demo crate track while leaving non-demo tracks without fallback', () => {
    for (const seed of SPOTKIT_DEMO_CRATE_TRACKS) {
      const entry = DEMO_ARTWORK_ALBUMS[seed.albumId]
      expect(entry?.url).toBeDefined()
      expect(entry?.url?.startsWith('https://')).toBe(true)
    }

    const combinedCrate = buildDemoCrate('both', DEMO_PLAYLIST_PRESETS[0].url)
    for (const track of combinedCrate.tracks) {
      expect(track.albumArtUrl).toBe(DEMO_ARTWORK_ALBUMS[track.albumId]?.url)
      expect(track.albumArtUrl?.startsWith('https://')).toBe(true)
      expect(track.fallbackAlbumArtUrl?.startsWith('data:image/svg+xml')).toBe(
        true,
      )
    }

    const syntheticTrack = makeTrack({
      id: 'prod_trk_1',
      albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273realcover',
    })
    expect(syntheticTrack.fallbackAlbumArtUrl).toBeUndefined()
  })
})
