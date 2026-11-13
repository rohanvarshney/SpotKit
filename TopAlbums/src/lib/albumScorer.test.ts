import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFibonacciTierGroups,
  buildGradeTierGroups,
} from '../components/DashboardView'
import { buildDemoLibraryDataset } from '../mocks/demoData'
import type { ScoredAlbum } from '../types/spotify'
import {
  DEFAULT_WEIGHTS,
  normalizeAlbumTitle,
  scoreAndFilterAlbums,
} from './albumScorer'
import { fetchUserLibraryAndMetadata } from './spotifyApi'

describe('albumScorer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('strips deluxe and remastered suffixes accurately', () => {
    expect(
      normalizeAlbumTitle('Currents (Deluxe B-Sides & Remixes)'),
    ).toBe('Currents')
    expect(
      normalizeAlbumTitle('Random Access Memories (10th Anniversary Edition)'),
    ).toBe('Random Access Memories')
    expect(normalizeAlbumTitle('In Rainbows [Remastered]')).toBe('In Rainbows')
  })

  it('merges deluxe editions and filters singles when configured', () => {
    const dataset = buildDemoLibraryDataset()
    const merged = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    })

    // Singles should be excluded
    expect(merged.some((a) => a.albumType === 'single')).toBe(false)

    // Currents + Currents (Deluxe B-Sides & Remixes) should be merged into 1 entry
    const currents = merged.find((a) => a.canonicalName === 'Currents')
    expect(currents).toBeDefined()
    expect(currents?.mergedEditionNames.length).toBe(2)

    // Melodrama is 11/11 (100% liked)
    const melodrama = merged.find((a) => a.name === 'Melodrama')
    expect(melodrama?.proportionLiked).toBe(1)
  })

  it('paginates remaining album tracks when an album has more than 50 tracks', async () => {
    const first50 = Array.from({ length: 50 }, (_, i) => ({
      id: `trk-${i + 1}`,
      name: `Song ${i + 1}`,
      track_number: i + 1,
      disc_number: 1,
      duration_ms: 180000,
      artists: [{ id: 'art-1', name: 'Box Set Artist' }],
    }))
    const next25 = Array.from({ length: 25 }, (_, i) => ({
      id: `trk-${i + 51}`,
      name: `Song ${i + 51}`,
      track_number: i + 51,
      disc_number: 2,
      duration_ms: 180000,
      artists: [{ id: 'art-1', name: 'Box Set Artist' }],
    }))

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/me')) {
          return new Response(
            JSON.stringify({ id: 'u1', display_name: 'Tester' }),
            { status: 200 },
          )
        }
        if (url.includes('/me/tracks')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  added_at: '2026-01-01T00:00:00Z',
                  track: {
                    ...first50[0],
                    popularity: 70,
                    album: {
                      id: 'alb-75',
                      name: 'Anthology 75',
                      album_type: 'album',
                      total_tracks: 75,
                      release_date: '2025-01-01',
                      images: [],
                      artists: [{ id: 'art-1', name: 'Box Set Artist' }],
                    },
                  },
                },
              ],
              total: 1,
              limit: 50,
              offset: 0,
              next: null,
            }),
            { status: 200 },
          )
        }
        if (url.includes('/me/top/tracks')) {
          return new Response(
            JSON.stringify({
              items: [],
              total: 0,
              limit: 50,
              offset: 0,
              next: null,
            }),
            { status: 200 },
          )
        }
        if (url.endsWith('/albums/alb-75')) {
          return new Response(
            JSON.stringify({
              id: 'alb-75',
              name: 'Anthology 75',
              album_type: 'album',
              total_tracks: 75,
              release_date: '2025-01-01',
              images: [],
              artists: [{ id: 'art-1', name: 'Box Set Artist' }],
              tracks: {
                items: [...first50],
                total: 75,
                next: 'https://api.spotify.com/v1/albums/alb-75/tracks?offset=50&limit=50',
              },
            }),
            { status: 200 },
          )
        }
        if (url.includes('/albums/alb-75/tracks')) {
          return new Response(
            JSON.stringify({
              items: [...next25],
              total: 75,
              limit: 50,
              offset: 50,
              next: null,
            }),
            { status: 200 },
          )
        }
        return new Response('Not Found', { status: 404 })
      }),
    )

    const dataset = await fetchUserLibraryAndMetadata('test-token', () => {})
    const hydrated = dataset.hydratedAlbumsMap['alb-75']
    expect(hydrated).toBeDefined()
    expect(hydrated.tracks.items.length).toBe(75)
    expect(hydrated.tracks.items[74].id).toBe('trk-75')
  })

  it('scales Fibonacci tier buckets flexibly for smaller libraries and always ends at F tier', () => {
    const makeFakeAlbums = (count: number, noSkipCount = 1): ScoredAlbum[] =>
      Array.from({ length: count }, (_, idx) => {
        const isNoSkip = idx < noSkipCount
        return {
          key: `alb-${idx + 1}`,
          albumId: `alb-${idx + 1}`,
          name: `Album ${idx + 1}`,
          canonicalName: `Album ${idx + 1}`,
          mergedEditionNames: [`Album ${idx + 1}`],
          albumType: 'album',
          artists: [{ id: 'a1', name: 'Artist' }],
          primaryArtist: 'Artist',
          releaseDate: '2025-01-01',
          releaseYear: '2025',
          coverUrl: '',
          spotifyUrl: '',
          likedCount: isNoSkip ? 10 : 8,
          totalTracks: 10,
          proportionLiked: isNoSkip ? 1 : 0.8,
          averagePopularity: 70,
          topTracksCount: 0,
          topTracksBoostScore: 0,
          recencyScore: 50,
          bayesianProportion: isNoSkip ? 0.92 : 0.7,
          finalScore: isNoSkip ? 100 : Math.max(10, 80 - idx),
          scoreBreakdown: {
            proportionComponent: isNoSkip ? 92 : 70,
            volumeComponent: 60,
            topTracksComponent: 0,
            popularityComponent: 70,
            recencyComponent: 50,
          },
          latestLikedAt: '2026-01-01T00:00:00Z',
          tracks: [],
          isTracklistComplete: true,
        }
      })

    for (const count of [4, 6, 12, 35, 100, 1800]) {
      const albums = makeFakeAlbums(count, 2)
      const groups = buildFibonacciTierGroups(albums)
      expect(groups.length).toBeGreaterThan(0)
      expect(groups[0].tierLetter).toBe('S')
      expect(groups[0].totalItems).toBe(2)
      // Must always end at F tier and never include E tier
      expect(groups[groups.length - 1].tierLetter).toBe('F')
      expect(groups.some((g) => (g.tierLetter as string) === 'E')).toBe(false)
      // Total items across all tiers must equal input count
      const totalAssigned = groups.reduce((s, g) => s + g.totalItems, 0)
      expect(totalAssigned).toBe(count)
      if (count >= 7) {
        expect(groups.map((g) => g.tierLetter)).toEqual([
          'S',
          'A',
          'B',
          'C',
          'D',
          'F',
        ])
      }
    }
  })

  it('always places all 100% / No-Skip albums in S tier across both Fibonacci and Grade-based Tiering regardless of score or count', () => {
    // 5 No-Skip albums (even with lower weighted finalScore like 68.8) + 4 partial albums
    const specs = [
      { liked: 12, total: 15, score: 78.7 }, // #1 in weighted, 80% liked (not No-Skip)
      { liked: 9, total: 12, score: 73.9 }, // #2 in weighted, 75% liked (not No-Skip)
      { liked: 13, total: 13, score: 69.5 }, // No-Skip #1 (100%)
      { liked: 10, total: 10, score: 68.8 }, // No-Skip #2 (100%)
      { liked: 11, total: 11, score: 67.9 }, // No-Skip #3 (100%)
      { liked: 11, total: 11, score: 66.4 }, // No-Skip #4 (100%)
      { liked: 12, total: 12, score: 65.1 }, // No-Skip #5 (100%)
      { liked: 9, total: 10, score: 64.0 }, // 90% liked
      { liked: 6, total: 10, score: 52.0 }, // 60% liked
    ]

    const albums: ScoredAlbum[] = specs.map((sp, idx) => ({
      key: `alb-${idx + 1}`,
      albumId: `alb-${idx + 1}`,
      name: `Album ${idx + 1}`,
      canonicalName: `Album ${idx + 1}`,
      mergedEditionNames: [`Album ${idx + 1}`],
      albumType: 'album',
      artists: [{ id: 'a1', name: 'Artist' }],
      primaryArtist: 'Artist',
      releaseDate: '2025-01-01',
      releaseYear: '2025',
      coverUrl: '',
      spotifyUrl: '',
      likedCount: sp.liked,
      totalTracks: sp.total,
      proportionLiked: sp.liked / sp.total,
      averagePopularity: 70,
      topTracksCount: 0,
      topTracksBoostScore: 0,
      recencyScore: 50,
      bayesianProportion: 0.7,
      finalScore: sp.score,
      scoreBreakdown: {
        proportionComponent: 70,
        volumeComponent: 60,
        topTracksComponent: 0,
        popularityComponent: 70,
        recencyComponent: 50,
      },
      latestLikedAt: '2026-01-01T00:00:00Z',
      tracks: [],
      isTracklistComplete: true,
    }))

    const fibGroups = buildFibonacciTierGroups(albums)
    const fibSTier = fibGroups.find((g) => g.tierLetter === 'S')!
    expect(fibSTier.totalItems).toBe(5)
    for (const lvl of fibSTier.levels) {
      for (const item of lvl.items) {
        expect(item.album.likedCount).toBe(item.album.totalTracks)
      }
    }

    const gradeGroups = buildGradeTierGroups(albums)
    const gradeSTier = gradeGroups.find((g) => g.tierLetter === 'S')!
    expect(gradeSTier.totalItems).toBe(5)
    for (const item of gradeSTier.levels[0].items) {
      expect(item.album.likedCount).toBe(item.album.totalTracks)
    }
  })

  it('assigns albums into S, A, B, C, D, F by score thresholds in Grade-based Tiering', () => {
    const scores = [100, 92, 85, 74, 61, 58, 42]
    const albums: ScoredAlbum[] = scores.map((score, idx) => ({
      key: `alb-${idx + 1}`,
      albumId: `alb-${idx + 1}`,
      name: `Album ${idx + 1}`,
      canonicalName: `Album ${idx + 1}`,
      mergedEditionNames: [`Album ${idx + 1}`],
      albumType: 'album',
      artists: [{ id: 'a1', name: 'Artist' }],
      primaryArtist: 'Artist',
      releaseDate: '2025-01-01',
      releaseYear: '2025',
      coverUrl: '',
      spotifyUrl: '',
      likedCount: score === 100 ? 10 : 8,
      totalTracks: 10,
      proportionLiked: score / 100,
      averagePopularity: 70,
      topTracksCount: 0,
      topTracksBoostScore: 0,
      recencyScore: 50,
      bayesianProportion: 0.7,
      finalScore: score,
      scoreBreakdown: {
        proportionComponent: 70,
        volumeComponent: 60,
        topTracksComponent: 0,
        popularityComponent: 70,
        recencyComponent: 50,
      },
      latestLikedAt: '2026-01-01T00:00:00Z',
      tracks: [],
      isTracklistComplete: true,
    }))

    const gradeGroups = buildGradeTierGroups(albums)
    expect(gradeGroups.map((g) => [g.tierLetter, g.totalItems])).toEqual([
      ['S', 1], // 100% / No-Skip
      ['A', 1], // 92
      ['B', 1], // 85
      ['C', 1], // 74
      ['D', 1], // 61
      ['F', 2], // 58, 42
    ])
  })
})
