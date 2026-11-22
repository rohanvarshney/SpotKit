// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { describe, expect, it } from 'vitest'
import {
  ALL_CAMELOT_CODES,
  camelotToPitchAndMode,
  computeCohesionScore,
  parsePlaylistId,
} from './camelotEngine'
import {
  evaluateTrackSequence,
  findBestInsertionPosition,
  sequencePlaylist,
} from './djSequencer'
import {
  DEMO_ARTWORK_ALBUMS,
  DEMO_LIKED_TRACK_COUNT,
  DEMO_PLAYLIST_PRESETS,
  SPOTKIT_DEMO_ALBUMS,
  SPOTKIT_DEMO_CATALOG_VERSION,
  SPOTKIT_DEMO_CRATE_TRACKS,
  buildDemoCrate,
} from '../mocks/demoData'
import type { AnalyzedTrack, CamelotCode } from '../types/spotify'

function makeTrack(
  id: string,
  camelot: CamelotCode,
  bpm: number,
  energy = 0.72,
): AnalyzedTrack {
  const cam = camelotToPitchAndMode(camelot)
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Track ${id}`,
    artists: [`Artist ${id}`],
    artistNames: `Artist ${id}`,
    albumName: 'Test Album',
    albumId: 'alb1',
    albumArtUrl: null,
    durationMs: 220000,
    popularity: 70,
    externalUrl: null,
    previewUrl: null,
    isrc: null,
    bpm,
    camelot,
    musicalKey: cam.musicalKey,
    pitchClass: cam.pitchClass,
    mode: cam.mode,
    energy,
    danceability: 0.75,
    valence: 0.5,
    featureSource: 'curated',
    sources: ['liked'],
  }
}

describe('djSequencer', () => {
  it('handles empty and single-track crates cleanly', () => {
    const empty = sequencePlaylist([])
    expect(empty.orderedTracks).toEqual([])
    expect(empty.unselectedTracks).toEqual([])
    expect(empty.avgCohesion).toBe(0)
    expect(empty.narrationLogs.length).toBeGreaterThanOrEqual(1)

    const singleTrack = makeTrack('solo', '8A', 122)
    const single = sequencePlaylist([singleTrack])
    expect(single.orderedTracks.map((t) => t.id)).toEqual(['solo'])
    expect(single.unselectedTracks).toEqual([])
    expect(single.transitions).toEqual([])
    expect(single.avgCohesion).toBe(100)
  })

  it('produces a complete permutation with high cohesion and all narration phases when maxTracks is null', () => {
    const crate = buildDemoCrate('liked')
    const result = sequencePlaylist(crate.tracks, { maxTracks: null })

    expect(result.orderedTracks.length).toBe(crate.tracks.length)
    expect(result.unselectedTracks.length).toBe(0)
    expect(result.transitions.length).toBe(crate.tracks.length - 1)

    const orderedIds = new Set(result.orderedTracks.map((t) => t.id))
    expect(orderedIds.size).toBe(crate.tracks.length)
    for (const track of crate.tracks) {
      expect(orderedIds.has(track.id)).toBe(true)
    }

    const phases = new Set(result.narrationLogs.map((l) => l.phase))
    expect(phases.has('scan')).toBe(true)
    expect(phases.has('cluster')).toBe(true)
    expect(phases.has('recursive')).toBe(true)
    expect(phases.has('iterate')).toBe(true)
    expect(phases.has('complete')).toBe(true)

    expect(result.avgCohesion).toBeGreaterThanOrEqual(result.baselineCohesion)
    expect(result.avgCohesion).toBeGreaterThan(70)
    expect(result.branchesExplored).toBeGreaterThan(0)
  })

  it('selects an optimal X-track subset and excludes disconnected outliers', () => {
    const coreCluster: AnalyzedTrack[] = [
      makeTrack('c1', '8A', 122, 0.7),
      makeTrack('c2', '8A', 123, 0.72),
      makeTrack('c3', '9A', 123, 0.74),
      makeTrack('c4', '9B', 124, 0.75),
      makeTrack('c5', '10A', 124, 0.76),
      makeTrack('c6', '10A', 125, 0.78),
    ]
    const outliers: AnalyzedTrack[] = [
      makeTrack('o1', '2B', 174, 0.96),
      makeTrack('o2', '5B', 82, 0.25),
    ]
    const combined = [...outliers, ...coreCluster]

    const fullResult = sequencePlaylist(combined, { maxTracks: null })
    const subsetResult = sequencePlaylist(combined, { maxTracks: 6 })

    expect(subsetResult.orderedTracks.length).toBe(6)
    expect(subsetResult.unselectedTracks.length).toBe(2)

    const subsetIds = new Set(subsetResult.orderedTracks.map((t) => t.id))
    expect(subsetIds.has('o1')).toBe(false)
    expect(subsetIds.has('o2')).toBe(false)
    expect(subsetResult.avgCohesion).toBeGreaterThan(fullResult.avgCohesion)
    expect(subsetResult.avgCohesion).toBeGreaterThanOrEqual(90)
  })

  it('locks the user-selected preferredOpenerId at position #1', () => {
    const crate = buildDemoCrate('playlist', DEMO_PLAYLIST_PRESETS[1].url)
    const chosenOpener = crate.tracks[Math.floor(crate.tracks.length / 2)]

    const result = sequencePlaylist(crate.tracks, {
      maxTracks: 6,
      preferredOpenerId: chosenOpener.id,
    })

    expect(result.orderedTracks.length).toBe(6)
    expect(result.orderedTracks[0].id).toBe(chosenOpener.id)
    expect(result.avgCohesion).toBeGreaterThanOrEqual(result.baselineCohesion)
  })

  it('achieves >= greedy baseline on all demo playlists and synthetic harmonic trap crates', () => {
    for (const preset of DEMO_PLAYLIST_PRESETS) {
      const crate = buildDemoCrate('playlist', preset.url)
      const full = sequencePlaylist(crate.tracks, { maxTracks: null })
      const subset = sequencePlaylist(crate.tracks, { maxTracks: 5 })
      expect(full.avgCohesion).toBeGreaterThanOrEqual(full.baselineCohesion)
      expect(subset.avgCohesion).toBeGreaterThanOrEqual(subset.baselineCohesion)
    }

    // Synthetic crate with a greedy trap vs harmonic chain
    const trapCrate: AnalyzedTrack[] = [
      makeTrack('s1', '8A', 120, 0.65),
      makeTrack('trap', '8A', 120, 0.65), // exact match with s1, but bridges poorly if taken early or forces awkward end
      makeTrack('b1', '9A', 121, 0.68),
      makeTrack('b2', '10A', 122, 0.72),
      makeTrack('b3', '11A', 123, 0.75),
      makeTrack('b4', '11B', 124, 0.76),
    ]
    const trapResult = sequencePlaylist(trapCrate, {
      maxTracks: null,
      preferredOpenerId: 's1',
    })
    expect(trapResult.orderedTracks.length).toBe(6)
    expect(trapResult.avgCohesion).toBeGreaterThanOrEqual(
      trapResult.baselineCohesion,
    )
    expect(trapResult.avgCohesion).toBeGreaterThanOrEqual(90)
  })

  it('supports evaluateTrackSequence and findBestInsertionPosition for interactive edits', () => {
    const t1 = makeTrack('t1', '8A', 120, 0.65)
    const t2 = makeTrack('t2', '9A', 122, 0.7)
    const t3 = makeTrack('t3', '10A', 124, 0.75)
    const bridge = makeTrack('bridge', '9A', 121, 0.68)

    const bestSlot = findBestInsertionPosition(bridge, [t1, t2, t3])
    expect(bestSlot.index).toBeGreaterThanOrEqual(1)
    expect(bestSlot.index).toBeLessThanOrEqual(2)

    const reordered = [t1, bridge, t2, t3]
    const evaluated = evaluateTrackSequence(reordered, [t1, t2, t3, bridge])
    expect(evaluated.orderedTracks.length).toBe(4)
    expect(evaluated.unselectedTracks.length).toBe(0)
    expect(evaluated.transitions.length).toBe(3)
    expect(
      computeCohesionScore(t1, bridge).totalScore,
    ).toBeGreaterThanOrEqual(90)
    expect(
      parsePlaylistId(DEMO_PLAYLIST_PRESETS[0].url),
    ).toBe(DEMO_PLAYLIST_PRESETS[0].id)
  })

  it('reuses the unified shared catalog across all 8 genre presets and all 24 Camelot keys', () => {
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
    expect(
      likedCrate.tracks.every(
        (t) =>
          t.albumArtUrl === DEMO_ARTWORK_ALBUMS[t.albumId]?.url &&
          t.albumArtUrl?.startsWith('https://') &&
          t.fallbackAlbumArtUrl?.startsWith('data:image/svg+xml'),
      ),
    ).toBe(true)

    const combinedCrate = buildDemoCrate('both', DEMO_PLAYLIST_PRESETS[0].url)
    for (const track of combinedCrate.tracks) {
      expect(track.albumArtUrl).toBe(DEMO_ARTWORK_ALBUMS[track.albumId]?.url)
      expect(track.albumArtUrl?.startsWith('https://')).toBe(true)
      expect(track.fallbackAlbumArtUrl?.startsWith('data:image/svg+xml')).toBe(
        true,
      )
    }

    const syntheticTrack = makeTrack('prod_trk_1', '8A', 122)
    expect(syntheticTrack.fallbackAlbumArtUrl).toBeUndefined()

    const coveredKeys = new Set(combinedCrate.tracks.map((t) => t.camelot))
    for (const seed of SPOTKIT_DEMO_CRATE_TRACKS) {
      coveredKeys.add(seed.camelot)
    }
    for (const code of ALL_CAMELOT_CODES) {
      expect(coveredKeys.has(code)).toBe(true)
    }

    for (const preset of DEMO_PLAYLIST_PRESETS) {
      const crate = buildDemoCrate('playlist', preset.url)
      expect(crate.tracks.length).toBeGreaterThanOrEqual(10)
      const result = sequencePlaylist(crate.tracks, { maxTracks: null })
      expect(result.avgCohesion).toBeGreaterThanOrEqual(result.baselineCohesion)
    }
  })
})
