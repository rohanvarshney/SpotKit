// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFibonacciTierGroups,
  buildGradeTierGroups,
  isNoSkipAlbum,
} from '../components/DashboardView'
import {
  SPOTKIT_DEMO_ALBUMS,
  SPOTKIT_DEMO_CATALOG_VERSION,
  buildDemoLibraryDataset,
  hydrateDemoAlbumById,
} from '../mocks/demoData'
import {
  SPOTKIT_DEMO_CRATE_TRACKS,
  SPOTKIT_DEMO_PLAYLIST_PRESETS,
} from '../../../shared/spotkitDemoCatalog'
import type { ScoredAlbum } from '../types/spotify'
import {
  DEFAULT_WEIGHTS,
  normalizeAlbumTitle,
  scoreAndFilterAlbums,
} from './albumScorer'
import {
  ALBUM_CACHE_TTL_MS,
  DATASET_CACHE_TTL_MS,
  clearCachedLibraryDataset,
  getCachedLibraryDataset,
  setCachedLibraryDataset,
} from './libraryCache'
import {
  fetchUserLibraryAndMetadata,
  selectCandidateAlbumIdsToHydrate,
} from './spotifyApi'
import {
  buildArtistGroups,
  buildDefaultArtistTierMap,
  buildShareImageFilename,
  getShareImageLayoutSpec,
  renderShareImageCanvas,
  type CustomArtistTierMap,
  type ShareImageExportOptions,
} from './shareImageExporter'

describe('albumScorer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('caches and expires real Spotify library datasets using a 24-hour TTL and 7-day album TTL', async () => {
    expect(DATASET_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000)
    expect(ALBUM_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
    await clearCachedLibraryDataset()
    expect(await getCachedLibraryDataset()).toBeNull()

    const realDataset = {
      ...buildDemoLibraryDataset(),
      isDemo: false,
    }
    await setCachedLibraryDataset(realDataset)
    const cached = await getCachedLibraryDataset()
    expect(cached).not.toBeNull()
    expect(cached?.savedTracks.length).toBe(realDataset.savedTracks.length)

    // Expired TTL should return null
    await setCachedLibraryDataset(realDataset, -1000)
    expect(await getCachedLibraryDataset()).toBeNull()
  })

  it('cross-examines standalone liked singles (e.g. Chris Lake "Savana", "Ease My Mind", "Psycho") into their hydrated full album ("Chemistry")', () => {
    const chrisLake = { id: 'artist-chris-lake', name: 'Chris Lake' }
    const savedTracks = [
      {
        added_at: '2026-02-01T00:00:00Z',
        track: {
          id: 'single-trk-savana',
          name: 'Savana',
          track_number: 1,
          disc_number: 1,
          duration_ms: 210000,
          popularity: 78,
          artists: [chrisLake],
          album: {
            id: 'single-alb-savana',
            name: 'Savana',
            album_type: 'single' as const,
            total_tracks: 1,
            release_date: '2025-04-10',
            images: [],
            artists: [chrisLake],
          },
        },
      },
      {
        added_at: '2026-03-01T00:00:00Z',
        track: {
          id: 'single-trk-ease',
          name: 'Ease My Mind',
          track_number: 1,
          disc_number: 1,
          duration_ms: 225000,
          popularity: 81,
          artists: [chrisLake, { id: 'artist-abel', name: 'Abel Balder' }],
          album: {
            id: 'single-alb-ease',
            name: 'Ease My Mind',
            album_type: 'single' as const,
            total_tracks: 1,
            release_date: '2025-05-15',
            images: [],
            artists: [chrisLake],
          },
        },
      },
      {
        added_at: '2026-04-01T00:00:00Z',
        track: {
          id: 'single-trk-psycho',
          name: 'Psycho',
          track_number: 1,
          disc_number: 1,
          duration_ms: 198000,
          popularity: 76,
          artists: [chrisLake],
          album: {
            id: 'single-alb-psycho',
            name: 'Psycho',
            album_type: 'single' as const,
            total_tracks: 1,
            release_date: '2025-06-20',
            images: [],
            artists: [chrisLake],
          },
        },
      },
      {
        added_at: '2026-07-15T00:00:00Z',
        track: {
          id: 'alb-trk-in-my-head',
          name: 'In My Head',
          track_number: 4,
          disc_number: 1,
          duration_ms: 204000,
          popularity: 79,
          artists: [chrisLake],
          album: {
            id: 'alb-chemistry',
            name: 'Chemistry',
            album_type: 'album' as const,
            total_tracks: 6,
            release_date: '2025-07-11',
            images: [],
            artists: [chrisLake],
          },
        },
      },
    ]

    // 1. Candidate hydration selector skips 1-track singles and prioritizes the full album "Chemistry"
    const candidates = selectCandidateAlbumIdsToHydrate(savedTracks, 10)
    expect(candidates).toEqual(['alb-chemistry'])

    // 2. When "Chemistry" is hydrated with distinct album track IDs, all 3 liked singles are cross-examined and marked isLiked: true
    const chemistryTrackNames = [
      'Savana',
      'Ease My Mind (feat. Abel Balder)',
      'Psycho',
      'In My Head',
      'Summertime Blues',
      'Chemistry Outro',
    ]

    const scored = scoreAndFilterAlbums(
      {
        user: { id: 'u1', display_name: 'Tester' },
        savedTracks,
        topTracksMap: {},
        hydratedAlbumsMap: {
          'alb-chemistry': {
            id: 'alb-chemistry',
            name: 'Chemistry',
            album_type: 'album',
            total_tracks: 6,
            release_date: '2025-07-11',
            images: [],
            artists: [chrisLake],
            tracks: {
              total: 6,
              items: chemistryTrackNames.map((name, idx) => ({
                id: `chemistry-album-track-${idx + 1}`,
                name,
                track_number: idx + 1,
                disc_number: 1,
                duration_ms: 205000,
                artists: [chrisLake],
              })),
            },
          },
        },
        isDemo: false,
        fetchedAt: '2026-11-13T00:00:00Z',
      },
      {
        rankingMode: 'weighted',
        customWeights: DEFAULT_WEIGHTS,
        minTotalTracks: 5,
        minLikedTracks: 2,
        fullAlbumsOnly: true,
        deduplicateEditions: true,
        searchQuery: '',
      },
    )

    expect(scored.length).toBe(1)
    const chemistry = scored[0]
    expect(chemistry.name).toBe('Chemistry')
    expect(chemistry.likedCount).toBe(4)
    expect(chemistry.totalTracks).toBe(6)
    expect(
      chemistry.tracks.filter((t) => t.isLiked).map((t) => t.name),
    ).toEqual([
      'Savana',
      'Ease My Mind (feat. Abel Balder)',
      'Psycho',
      'In My Head',
    ])
  })

  it('produces unique 1:1 share image specs and filenames for each view layout', () => {
    const dataset = buildDemoLibraryDataset()
    const albums = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    })

    const baseOpts: Omit<
      ShareImageExportOptions,
      'viewLayout' | 'gradeBasedTiering'
    > = {
      albums,
      userDisplayName: 'Rohan',
      totalLikedSongs: dataset.savedTracks.length,
      noSkipCount: 1,
      topBoostedCount: 6,
      rankingMode: 'weighted',
      brandLogoSrc: 'data:image/png;base64,logo',
      signatureSrc: 'data:image/png;base64,sig',
    }

    const gridSpec = getShareImageLayoutSpec({
      ...baseOpts,
      viewLayout: 'grid',
      gradeBasedTiering: false,
    })
    const listSpec = getShareImageLayoutSpec({
      ...baseOpts,
      viewLayout: 'list',
      gradeBasedTiering: false,
    })
    const fibTierSpec = getShareImageLayoutSpec({
      ...baseOpts,
      viewLayout: 'tier',
      gradeBasedTiering: false,
    })
    const gradeTierSpec = getShareImageLayoutSpec({
      ...baseOpts,
      viewLayout: 'tier',
      gradeBasedTiering: true,
    })

    const specs = [gridSpec, listSpec, fibTierSpec, gradeTierSpec]
    for (const s of specs) {
      expect(s.width).toBe(2880)
      expect(s.height).toBe(2880)
      expect(s.aspectRatio).toBe('1:1')
      expect(s.includesJointSignature).toBe(true)
    }

    const filenames = new Set(specs.map((s) => s.filename))
    const badges = new Set(specs.map((s) => s.layoutBadge))
    const subtitles = new Set(specs.map((s) => s.subtitle))

    expect(filenames.size).toBe(4)
    expect(badges.size).toBe(4)
    expect(subtitles.size).toBe(4)
    expect(buildShareImageFilename('grid')).toBe('spotkit-top-albums-grid.png')
    expect(buildShareImageFilename('list')).toBe(
      'spotkit-top-albums-table.png',
    )
    expect(buildShareImageFilename('tier', false)).toBe(
      'spotkit-top-albums-tier-fibonacci.png',
    )
    expect(buildShareImageFilename('tier', true)).toBe(
      'spotkit-top-albums-tier-grades.png',
    )
  })

  it('renders distinct 1:1 canvas layouts with joint logo signature assets', async () => {
    const dataset = buildDemoLibraryDataset()
    const albums = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    })

    interface CanvasRenderTrace {
      width: number
      height: number
      texts: string[]
      drawnAssets: unknown[]
    }

    const traces: CanvasRenderTrace[] = []

    class MockImage {
      srcValue = ''
      naturalWidth = 200
      naturalHeight = 200
      width = 200
      height = 200
      crossOrigin: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(val: string) {
        this.srcValue = val
        if (val.includes('logo')) {
          this.naturalWidth = 2402
          this.naturalHeight = 972
        } else if (val.includes('sig')) {
          this.naturalWidth = 600
          this.naturalHeight = 340
        }
        queueMicrotask(() => {
          this.onload?.()
        })
      }

      get src(): string {
        return this.srcValue
      }
    }

    const createMockCanvas = () => {
      const texts: string[] = []
      const drawnAssets: unknown[] = []
      const canvasObj = {
        width: 0,
        height: 0,
        getContext: () => {
          const gradient = { addColorStop: () => {} }
          return {
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: 'left',
            textBaseline: 'alphabetic',
            globalAlpha: 1,
            shadowColor: '',
            shadowBlur: 0,
            shadowOffsetY: 0,
            save: () => {},
            restore: () => {},
            scale: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            quadraticCurveTo: () => {},
            arc: () => {},
            clip: () => {},
            fill: () => {},
            stroke: () => {},
            fillRect: () => {},
            createLinearGradient: () => gradient,
            createRadialGradient: () => gradient,
            measureText: (txt: string) => ({ width: txt.length * 8 }),
            fillText: (txt: string) => {
              texts.push(txt)
            },
            drawImage: (asset: unknown) => {
              drawnAssets.push(asset)
            },
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4),
              width: w,
              height: h,
            }),
            putImageData: () => {},
          }
        },
      }
      return { canvasObj, texts, drawnAssets }
    }

    let mainCanvasTrace: CanvasRenderTrace | null = null
    vi.stubGlobal('Image', MockImage)
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        expect(tag).toBe('canvas')
        const { canvasObj, texts, drawnAssets } = createMockCanvas()
        if (!mainCanvasTrace) {
          mainCanvasTrace = {
            get width() {
              return canvasObj.width
            },
            get height() {
              return canvasObj.height
            },
            texts,
            drawnAssets,
          }
          traces.push(mainCanvasTrace)
        }
        return canvasObj
      },
    })

    const runLayout = async (
      viewLayout: 'grid' | 'list' | 'tier',
      gradeBasedTiering = false,
    ) => {
      mainCanvasTrace = null
      const canvas = await renderShareImageCanvas({
        viewLayout,
        albums,
        userDisplayName: 'SpotKit Tester',
        totalLikedSongs: dataset.savedTracks.length,
        noSkipCount: 1,
        topBoostedCount: 6,
        rankingMode: 'weighted',
        gradeBasedTiering,
        brandLogoSrc: 'data:image/png;base64,mock-logo',
        signatureSrc: 'data:image/png;base64,mock-sig',
      })
      expect(canvas.width).toBe(2880)
      expect(canvas.height).toBe(2880)
      return traces[traces.length - 1]
    }

    const gridTrace = await runLayout('grid')
    const listTrace = await runLayout('list')
    const tierTrace = await runLayout('tier', false)
    const gradeTierTrace = await runLayout('tier', true)

    // Each layout draws the joint logo signature assets multiple times (header, break, footer)
    expect(gridTrace.drawnAssets.length).toBeGreaterThanOrEqual(6)
    expect(listTrace.drawnAssets.length).toBeGreaterThanOrEqual(6)
    expect(tierTrace.drawnAssets.length).toBeGreaterThanOrEqual(6)

    // Each layout renders its own unique heading/structure
    expect(gridTrace.texts).toContain('⊞ TOP ALBUMS GRID')
    expect(gridTrace.texts.some((t) => t.includes('Top 9 Bento'))).toBe(true)

    expect(listTrace.texts).toContain('☰ RANKING LEADERBOARD')
    expect(listTrace.texts).toContain('TOP 50 HITS')
    expect(listTrace.texts).toContain('RANK')

    expect(tierTrace.texts).toContain('🏆 FIBONACCI TIER BOARD')
    expect(tierTrace.texts).toContain('S')
    expect(tierTrace.texts).toContain('A')

    expect(gradeTierTrace.texts).toContain('🏆 GRADE TIER BOARD')
    expect(gradeTierTrace.texts).toContain('≥ 90%')
  })

  it('provides full feature parity in the interactive demo dataset across filters, tiering, single cross-examination, and on-demand hydration', async () => {
    const dataset = buildDemoLibraryDataset()
    expect(dataset.isDemo).toBe(true)

    const defaultOptions = {
      rankingMode: 'weighted' as const,
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    }

    const fullAlbumsScored = scoreAndFilterAlbums(dataset, defaultOptions)

    // 1. Multiple No-Skip (100% liked) albums exist (>= 3) and populate both S-tier Fibonacci sub-levels
    const noSkipAlbums = fullAlbumsScored.filter((a) => isNoSkipAlbum(a))
    expect(noSkipAlbums.length).toBeGreaterThanOrEqual(3)
    const fibGroups = buildFibonacciTierGroups(fullAlbumsScored)
    const sTier = fibGroups.find((g) => g.tierLetter === 'S')
    expect(sTier).toBeDefined()
    expect(sTier?.levels.length).toBe(2)
    expect(sTier?.levels[0].items.length).toBeGreaterThanOrEqual(1)
    expect(sTier?.levels[1].items.length).toBeGreaterThanOrEqual(1)

    // 2. Unchecking Full Albums Only at default sliders reveals multi-track EPs (albumType === 'single')
    const withSinglesAndEps = scoreAndFilterAlbums(dataset, {
      ...defaultOptions,
      fullAlbumsOnly: false,
    })
    expect(withSinglesAndEps.length).toBeGreaterThan(fullAlbumsScored.length)
    expect(withSinglesAndEps.some((a) => a.albumType === 'single')).toBe(true)

    // 3. Deduplication merges multiple Deluxe editions (Currents and BRAT)
    const currents = fullAlbumsScored.find((a) => a.canonicalName === 'Currents')
    const brat = fullAlbumsScored.find((a) => a.canonicalName === 'BRAT')
    expect(currents?.mergedEditionNames.length).toBe(2)
    expect(brat?.mergedEditionNames.length).toBe(2)

    // 4. Standalone Chris Lake singles cross-examine into hydrated Chemistry full album (4/6 liked)
    const chemistry = fullAlbumsScored.find((a) => a.albumId === 'alb_chemistry')
    expect(chemistry).toBeDefined()
    expect(chemistry?.likedCount).toBe(4)
    expect(chemistry?.totalTracks).toBe(6)

    // 5. Unhydrated demo albums start incomplete and hydrate on demand via hydrateDemoAlbumById
    const xxBefore = fullAlbumsScored.find((a) => a.albumId === 'alb_xx')
    const oracularBefore = fullAlbumsScored.find(
      (a) => a.albumId === 'alb_oracular',
    )
    expect(xxBefore?.isTracklistComplete).toBe(false)
    expect(oracularBefore?.isTracklistComplete).toBe(false)

    const hydratedXx = await hydrateDemoAlbumById('alb_xx')
    const hydratedOracular = await hydrateDemoAlbumById('alb_oracular')
    expect(hydratedXx).not.toBeNull()
    expect(hydratedOracular).not.toBeNull()

    const hydratedDataset = {
      ...dataset,
      hydratedAlbumsMap: {
        ...dataset.hydratedAlbumsMap,
        ...(hydratedXx ? { alb_xx: hydratedXx } : {}),
        ...(hydratedOracular ? { alb_oracular: hydratedOracular } : {}),
      },
    }
    const afterHydration = scoreAndFilterAlbums(hydratedDataset, defaultOptions)
    const xxAfter = afterHydration.find((a) => a.albumId === 'alb_xx')
    const oracularAfter = afterHydration.find(
      (a) => a.albumId === 'alb_oracular',
    )
    expect(xxAfter?.isTracklistComplete).toBe(true)
    expect(xxAfter?.tracks.length).toBe(11)
    expect(oracularAfter?.isTracklistComplete).toBe(true)
    expect(oracularAfter?.tracks.length).toBe(10)

    // 6. All album and track spotifyUrl values use valid Spotify search URLs
    for (const album of afterHydration) {
      expect(album.spotifyUrl.startsWith('https://open.spotify.com/search/')).toBe(
        true,
      )
      for (const track of album.tracks) {
        if (track.spotifyUrl) {
          expect(
            track.spotifyUrl.startsWith('https://open.spotify.com/search/'),
          ).toBe(true)
        }
      }
    }
  })

  it('aggregates artist catalogs with metadata and builds default artist tier assignments', () => {
    const dataset = buildDemoLibraryDataset()
    const albums = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    })

    const artistGroups = buildArtistGroups(albums)
    expect(artistGroups.length).toBeGreaterThan(10)

    const findArtist = (name: string) =>
      artistGroups.find((g) => g.artistName === name)

    const tameImpala = findArtist('Tame Impala')
    const kendrick = findArtist('Kendrick Lamar')
    const radiohead = findArtist('Radiohead')
    const charli = findArtist('Charli xcx')

    expect(tameImpala?.albums.length).toBe(4)
    expect(tameImpala?.eraSpan).toBe('2010–2020')
    expect(tameImpala?.catalogCompletionProportion).toBeCloseTo(
      (tameImpala?.totalLikedTracks ?? 0) /
        (tameImpala?.totalCatalogTracks ?? 1),
      5,
    )
    expect(tameImpala?.averageScore).toBeGreaterThan(0)
    expect(tameImpala?.topTracksCount).toBeGreaterThan(0)

    expect(kendrick?.albums.length).toBe(4)
    expect(radiohead?.albums.length).toBe(4)
    expect(charli?.albums.length).toBe(3)

    const defaultTiers = buildDefaultArtistTierMap(tameImpala!)
    const totalAssigned = Object.values(defaultTiers).reduce(
      (sum, list) => sum + list.length,
      0,
    )
    expect(totalAssigned).toBe(4)
  })

  it('renders both standard artist card and custom artist tier list 2880x2880 1:1 PNGs with joint signature', async () => {
    const dataset = buildDemoLibraryDataset()
    const albums = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    })

    const artistGroups = buildArtistGroups(albums)
    const tameImpala = artistGroups.find((g) => g.artistName === 'Tame Impala')!
    expect(tameImpala).toBeDefined()

    const customTiers: CustomArtistTierMap = {
      S: [tameImpala.albums[0].album],
      A: [tameImpala.albums[1].album],
      B: [tameImpala.albums[2].album],
      C: [tameImpala.albums[3].album],
      D: [],
      F: [],
    }

    const baseArtistOpts: ShareImageExportOptions = {
      viewLayout: 'artist',
      albums,
      userDisplayName: 'SpotKit Tester',
      totalLikedSongs: dataset.savedTracks.length,
      noSkipCount: 3,
      topBoostedCount: 10,
      rankingMode: 'weighted',
      gradeBasedTiering: false,
      brandLogoSrc: 'data:image/png;base64,mock-logo',
      signatureSrc: 'data:image/png;base64,mock-sig',
      artistSummary: tameImpala,
    }

    const cardsSpec = getShareImageLayoutSpec({
      ...baseArtistOpts,
      artistExportMode: 'cards',
    })
    const tierSpec = getShareImageLayoutSpec({
      ...baseArtistOpts,
      artistExportMode: 'custom-tier',
      customArtistTiers: customTiers,
    })

    expect(cardsSpec.width).toBe(2880)
    expect(cardsSpec.height).toBe(2880)
    expect(cardsSpec.aspectRatio).toBe('1:1')
    expect(cardsSpec.includesJointSignature).toBe(true)
    expect(cardsSpec.filename).toBe('spotkit-artist-tame-impala-cards.png')
    expect(cardsSpec.layoutBadge).toBe('🎤 ARTIST DISCOGRAPHY')

    expect(tierSpec.width).toBe(2880)
    expect(tierSpec.height).toBe(2880)
    expect(tierSpec.aspectRatio).toBe('1:1')
    expect(tierSpec.includesJointSignature).toBe(true)
    expect(tierSpec.filename).toBe('spotkit-artist-tame-impala-tier-list.png')
    expect(tierSpec.layoutBadge).toBe('🎤 ARTIST TIER LIST')
    expect(
      buildShareImageFilename('artist', false, 'Tame Impala', 'cards'),
    ).toBe('spotkit-artist-tame-impala-cards.png')
    expect(
      buildShareImageFilename('artist', false, 'Tame Impala', 'custom-tier'),
    ).toBe('spotkit-artist-tame-impala-tier-list.png')

    class MockImage {
      srcValue = ''
      naturalWidth = 200
      naturalHeight = 200
      width = 200
      height = 200
      crossOrigin: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(val: string) {
        this.srcValue = val
        if (val.includes('logo')) {
          this.naturalWidth = 2402
          this.naturalHeight = 972
        } else if (val.includes('sig')) {
          this.naturalWidth = 600
          this.naturalHeight = 340
        }
        queueMicrotask(() => {
          this.onload?.()
        })
      }

      get src(): string {
        return this.srcValue
      }
    }

    const traces: { texts: string[]; drawnAssets: unknown[] }[] = []
    let currentTrace: { texts: string[]; drawnAssets: unknown[] } | null = null

    vi.stubGlobal('Image', MockImage)
    vi.stubGlobal('document', {
      createElement: () => {
        const texts: string[] = []
        const drawnAssets: unknown[] = []
        const gradient = { addColorStop: () => {} }
        const canvasObj = {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1,
            font: '',
            textAlign: 'left',
            textBaseline: 'alphabetic',
            globalAlpha: 1,
            shadowColor: '',
            shadowBlur: 0,
            shadowOffsetY: 0,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            save: () => {},
            restore: () => {},
            scale: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            quadraticCurveTo: () => {},
            arc: () => {},
            clip: () => {},
            fill: () => {},
            stroke: () => {},
            fillRect: () => {},
            createLinearGradient: () => gradient,
            createRadialGradient: () => gradient,
            measureText: (txt: string) => ({ width: txt.length * 8 }),
            fillText: (txt: string) => {
              texts.push(txt)
            },
            drawImage: (asset: unknown) => {
              drawnAssets.push(asset)
            },
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4),
              width: w,
              height: h,
            }),
            putImageData: () => {},
          }),
        }
        if (!currentTrace) {
          currentTrace = { texts, drawnAssets }
          traces.push(currentTrace)
        }
        return canvasObj
      },
    })

    currentTrace = null
    const cardsCanvas = await renderShareImageCanvas({
      ...baseArtistOpts,
      artistExportMode: 'cards',
    })
    expect(cardsCanvas.width).toBe(2880)
    expect(cardsCanvas.height).toBe(2880)
    const cardsTrace = traces[traces.length - 1]
    expect(cardsTrace.drawnAssets.length).toBeGreaterThanOrEqual(6)
    expect(cardsTrace.texts).toContain('🎤 ARTIST DISCOGRAPHY')
    expect(cardsTrace.texts).toContain('ARTIST SPOTLIGHT')
    expect(cardsTrace.texts).toContain('Tame Impala')

    currentTrace = null
    const tierCanvas = await renderShareImageCanvas({
      ...baseArtistOpts,
      artistExportMode: 'custom-tier',
      customArtistTiers: customTiers,
    })
    expect(tierCanvas.width).toBe(2880)
    expect(tierCanvas.height).toBe(2880)
    const tierTrace = traces[traces.length - 1]
    expect(tierTrace.drawnAssets.length).toBeGreaterThanOrEqual(6)
    expect(tierTrace.texts).toContain('🎤 ARTIST TIER LIST')
    expect(tierTrace.texts).toContain('COMPARE YOUR TIERS')
    expect(
      tierTrace.texts.some((t) => t.includes('Tame Impala — Discography')),
    ).toBe(true)
  })

  it('uses the unified shared SpotKit demo catalog across genres and resolves every crate track', () => {
    expect(SPOTKIT_DEMO_CATALOG_VERSION).toBe('2026.2-unified')
    expect(SPOTKIT_DEMO_ALBUMS.length).toBeGreaterThanOrEqual(110)
    expect(SPOTKIT_DEMO_PLAYLIST_PRESETS.length).toBe(8)
    expect(SPOTKIT_DEMO_CRATE_TRACKS.length).toBeGreaterThanOrEqual(100)

    const dataset = buildDemoLibraryDataset()
    const albumById = new Map(SPOTKIT_DEMO_ALBUMS.map((a) => [a.id, a]))
    const likedTrackIds = new Set(dataset.savedTracks.map((item) => item.track.id))

    for (const crateTrack of SPOTKIT_DEMO_CRATE_TRACKS) {
      const album = albumById.get(crateTrack.albumId)
      expect(album).toBeDefined()
      expect(crateTrack.albumName).toBe(album?.name)

      const matched = album?.tracks.find((t) => t.name === crateTrack.name)
      expect(matched).toBeDefined()
      expect(crateTrack.inLiked).toBe(matched?.liked)
      expect(likedTrackIds.has(crateTrack.canonicalTrackId)).toBe(
        crateTrack.inLiked,
      )
    }

    // Verify expanded genre breadth in TopAlbums scoring
    const scored = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 5,
      minLikedTracks: 2,
      fullAlbumsOnly: true,
      deduplicateEditions: true,
      searchQuery: '',
    })
    const artists = new Set(scored.map((a) => a.primaryArtist))
    for (const expectedArtist of [
      'Chappell Roan',
      'Bad Bunny',
      'Fred again..',
      'Sade',
      'OutKast',
      'Burna Boy',
      'Steely Dan',
    ]) {
      expect(artists.has(expectedArtist)).toBe(true)
    }
  })
})
