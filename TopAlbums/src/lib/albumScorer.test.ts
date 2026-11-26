// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFibonacciTierGroups,
  buildGradeTierGroups,
  DEFAULT_GRID_COLUMNS,
  isNoSkipAlbum,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS,
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
import demoArtworkManifest from '../../../assets/demoArtworkManifest.json'
import type { RawLibraryDataset, ScoredAlbum } from '../types/spotify'
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
  canShareImageFile,
  downloadShareImage,
  getShareImageLayoutSpec,
  isMobileSaveToPhotosDevice,
  renderShareImageCanvas,
  shareImageFile,
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
    const weeknd = findArtist('The Weeknd')

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
    expect(charli?.albums.length).toBe(1)
    expect(weeknd?.albums.length).toBe(3)

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

  it('populates pinned demo album artwork manifest URLs with SVG fallback only for demo data', () => {
    const manifestAlbums = demoArtworkManifest.albums as Record<
      string,
      { url?: string } | undefined
    >
    const dataset = buildDemoLibraryDataset()

    for (const spec of SPOTKIT_DEMO_ALBUMS) {
      const entry = manifestAlbums[spec.id]
      expect(entry?.url).toBeDefined()
      expect(entry?.url?.startsWith('https://')).toBe(true)
    }

    const demoScored = scoreAndFilterAlbums(dataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 1,
      minLikedTracks: 1,
      fullAlbumsOnly: false,
      deduplicateEditions: true,
      searchQuery: '',
    })

    const currents = demoScored.find((a) => a.albumId === 'alb_currents')
    expect(currents?.coverUrl).toBe(manifestAlbums.alb_currents?.url)
    expect(currents?.fallbackCoverUrl?.startsWith('data:image/svg+xml')).toBe(
      true,
    )

    const sampleSaved = dataset.savedTracks.find(
      (item) => item.track.album.id === 'alb_currents',
    )
    expect(sampleSaved?.track.album.images[0]?.url).toBe(
      manifestAlbums.alb_currents?.url,
    )
    expect(
      sampleSaved?.track.album.images[1]?.url.startsWith('data:image/svg+xml'),
    ).toBe(true)

    const prodDataset: RawLibraryDataset = {
      user: { id: 'real_user', display_name: 'Real Listener' },
      isDemo: false,
      fetchedAt: '2026-11-20T00:00:00Z',
      topTracksMap: {},
      hydratedAlbumsMap: {},
      savedTracks: [
        {
          added_at: '2026-11-01T00:00:00Z',
          track: {
            id: 'trk_real_1',
            name: 'Real Track',
            track_number: 1,
            disc_number: 1,
            duration_ms: 200000,
            popularity: 80,
            artists: [{ id: 'art_real', name: 'Real Artist' }],
            album: {
              id: 'alb_real_1',
              name: 'Real Album',
              album_type: 'album',
              total_tracks: 10,
              release_date: '2025-01-01',
              artists: [{ id: 'art_real', name: 'Real Artist' }],
              images: [
                {
                  url: 'https://i.scdn.co/image/ab67616d0000b273realcover',
                  width: 640,
                  height: 640,
                },
              ],
            },
          },
        },
      ],
    }

    const prodScored = scoreAndFilterAlbums(prodDataset, {
      rankingMode: 'weighted',
      customWeights: DEFAULT_WEIGHTS,
      minTotalTracks: 1,
      minLikedTracks: 1,
      fullAlbumsOnly: false,
      deduplicateEditions: true,
      searchQuery: '',
    })
    expect(prodScored[0]?.coverUrl).toBe(
      'https://i.scdn.co/image/ab67616d0000b273realcover',
    )
    expect(prodScored[0]?.fallbackCoverUrl).toBeUndefined()
  })

  it('uses CORS proxy with SVG fallback only for demo share exports and loads production covers directly', async () => {
    const loadedSrcs: string[] = []
    let failProxyLoads = false

    class MockExportImage {
      srcValue = ''
      naturalWidth = 400
      naturalHeight = 400
      width = 400
      height = 400
      crossOrigin: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(val: string) {
        this.srcValue = val
        loadedSrcs.push(val)
        queueMicrotask(() => {
          if (failProxyLoads && val.startsWith('https://wsrv.nl/')) {
            this.onerror?.()
          } else {
            this.onload?.()
          }
        })
      }

      get src(): string {
        return this.srcValue
      }
    }

    const drawnSrcs: string[] = []
    const createMockCanvas = () => ({
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
          fillText: () => {},
          drawImage: (asset: { src?: string }) => {
            if (asset?.src) drawnSrcs.push(asset.src)
          },
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
          putImageData: () => {},
        }
      },
    })

    vi.stubGlobal('Image', MockExportImage)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.stubGlobal('document', {
      createElement: () => createMockCanvas(),
    })

    const demoAlbum: ScoredAlbum = {
      key: 'demo-key',
      albumId: 'alb_currents',
      name: 'Currents',
      canonicalName: 'currents',
      mergedEditionNames: ['Currents'],
      albumType: 'album',
      artists: [{ id: 'art_tame', name: 'Tame Impala' }],
      primaryArtist: 'Tame Impala',
      releaseDate: '2015-07-17',
      releaseYear: '2015',
      coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/currents/600x600bb.jpg',
      fallbackCoverUrl: 'data:image/svg+xml;charset=utf-8,fallback-svg',
      spotifyUrl: 'https://open.spotify.com/search/Currents',
      likedCount: 12,
      totalTracks: 13,
      proportionLiked: 12 / 13,
      averagePopularity: 80,
      topTracksCount: 3,
      topTracksBoostScore: 70,
      recencyScore: 60,
      bayesianProportion: 0.88,
      finalScore: 91.2,
      scoreBreakdown: {
        proportionComponent: 88,
        volumeComponent: 80,
        topTracksComponent: 70,
        popularityComponent: 80,
        recencyComponent: 60,
      },
      latestLikedAt: '2026-10-28T23:05:00Z',
      tracks: [],
      isTracklistComplete: true,
    }

    // 1) Demo export proxies mzstatic.com via wsrv.nl
    await renderShareImageCanvas({
      viewLayout: 'grid',
      albums: [demoAlbum],
      userDisplayName: 'Demo User',
      totalLikedSongs: 12,
      noSkipCount: 0,
      topBoostedCount: 1,
      rankingMode: 'weighted',
      gradeBasedTiering: false,
      brandLogoSrc: 'data:image/png;base64,mock-logo',
      signatureSrc: 'data:image/png;base64,mock-sig',
      isDemo: true,
    })
    expect(
      loadedSrcs.some((src) =>
        src.startsWith(
          'https://wsrv.nl/?url=https%3A%2F%2Fis1-ssl.mzstatic.com%2F',
        ),
      ),
    ).toBe(true)

    // 2) Demo export falls back to SVG data URI if proxy load fails
    loadedSrcs.length = 0
    drawnSrcs.length = 0
    failProxyLoads = true
    await renderShareImageCanvas({
      viewLayout: 'grid',
      albums: [demoAlbum],
      userDisplayName: 'Demo User',
      totalLikedSongs: 12,
      noSkipCount: 0,
      topBoostedCount: 1,
      rankingMode: 'weighted',
      gradeBasedTiering: false,
      brandLogoSrc: 'data:image/png;base64,mock-logo',
      signatureSrc: 'data:image/png;base64,mock-sig',
      isDemo: true,
    })
    expect(
      loadedSrcs.includes('data:image/svg+xml;charset=utf-8,fallback-svg'),
    ).toBe(true)
    expect(
      drawnSrcs.includes('data:image/svg+xml;charset=utf-8,fallback-svg'),
    ).toBe(true)

    // 3) Production export loads coverUrl directly without wsrv.nl
    loadedSrcs.length = 0
    failProxyLoads = false
    const prodAlbum: ScoredAlbum = {
      ...demoAlbum,
      key: 'prod-key',
      coverUrl: 'https://i.scdn.co/image/ab67616d0000b273realcover',
      fallbackCoverUrl: undefined,
    }
    await renderShareImageCanvas({
      viewLayout: 'grid',
      albums: [prodAlbum],
      userDisplayName: 'Real User',
      totalLikedSongs: 12,
      noSkipCount: 0,
      topBoostedCount: 1,
      rankingMode: 'weighted',
      gradeBasedTiering: false,
      brandLogoSrc: 'data:image/png;base64,mock-logo',
      signatureSrc: 'data:image/png;base64,mock-sig',
      isDemo: false,
    })
    expect(loadedSrcs.some((src) => src.includes('wsrv.nl'))).toBe(false)
    expect(
      loadedSrcs.includes('https://i.scdn.co/image/ab67616d0000b273realcover'),
    ).toBe(true)
  })

  it('supports up to 8 cards per row without mobile/tablet media query column caps', async () => {
    expect(MIN_GRID_COLUMNS).toBe(2)
    expect(DEFAULT_GRID_COLUMNS).toBe(3)
    expect(MAX_GRID_COLUMNS).toBe(8)

    const fsModule = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readFileSync: (path: URL, encoding: 'utf8') => string
    }
    const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

    expect(appCss).toMatch(
      /\.albumsGridCards\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--grid-cols,\s*3\),\s*minmax\(0,\s*1fr\)\)/s,
    )
    expect(appCss).toMatch(
      /\.gridAlbumCard\s*\{[^}]*container-type:\s*inline-size/s,
    )

    // Ensure no @media rule overrides .albumsGridCards grid-template-columns
    const gridColsMatches = appCss.match(
      /\.albumsGridCards[^{]*\{[^}]*grid-template-columns\s*:[^}]*\}/gs,
    )
    expect(gridColsMatches).toHaveLength(1)
    expect(appCss).not.toContain('min(var(--grid-cols')
  })

  it('allocates sufficient Album column width in Ranking Table and switches to a grid list on mobile', async () => {
    const fsModule = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readFileSync: (path: URL, encoding: 'utf8') => string
    }
    const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

    const tableMinWidthMatch = appCss.match(
      /\.rankingTable\s*\{[^}]*min-width:\s*(\d+)px/s,
    )
    expect(tableMinWidthMatch).not.toBeNull()
    const minWidth = Number(tableMinWidthMatch![1])
    expect(minWidth).toBeGreaterThanOrEqual(1080)

    const fixedCols = [
      'colRank',
      'colYear',
      'colLiked',
      'colPct',
      'colTopHits',
      'colScore',
      'colTracklist',
    ]
    const fixedSum = fixedCols.reduce((sum, cls) => {
      const m = appCss.match(
        new RegExp(`\\.rankingTable\\s+th\\.${cls}\\s*\\{[^}]*width:\\s*(\\d+)px`, 's'),
      )
      expect(m).not.toBeNull()
      return sum + Number(m![1])
    }, 0)

    const artistMatch = appCss.match(
      /\.rankingTable\s+th\.colArtist\s*\{[^}]*width:\s*(\d+)%/s,
    )
    expect(artistMatch).not.toBeNull()
    const artistWidth = minWidth * (Number(artistMatch![1]) / 100)

    const albumWidthAtMin = minWidth - fixedSum - artistWidth
    expect(albumWidthAtMin).toBeGreaterThanOrEqual(200)

    // Ensure mobile media query resets table min-width and uses grid rows
    const mobileBlockMatch = appCss.match(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.rankingRow\s*\{[^}]*display:\s*grid/s,
    )
    expect(mobileBlockMatch).not.toBeNull()
    expect(appCss).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*?\.rankingTable\s*\{[^}]*min-width:\s*0/s,
    )
  })

  it('detects mobile and iPadOS devices for Save to Photos while excluding desktop macOS Safari', () => {
    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      }),
    ).toBe(true)

    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      }),
    ).toBe(true)

    // iPadOS Desktop Website mode reports Macintosh + MacIntel with maxTouchPoints > 1
    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true)

    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        maxTouchPoints: 5,
      }),
    ).toBe(true)

    expect(
      isMobileSaveToPhotosDevice({
        userAgent: 'CustomBrowser/1.0',
        userAgentData: { mobile: true },
      }),
    ).toBe(true)

    // Desktop macOS Safari must stay false
    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe(false)

    // Desktop Windows & Linux must stay false
    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        platform: 'Win32',
        maxTouchPoints: 0,
      }),
    ).toBe(false)
    expect(
      isMobileSaveToPhotosDevice({
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
        platform: 'Linux x86_64',
        maxTouchPoints: 0,
      }),
    ).toBe(false)
  })

  it('uses native file-only Web Share on mobile and opens Save to Photos preview fallback instead of anchor download', async () => {
    const anchorClicks: Array<{ download: string; href: string }> = []

    const setupDomStubs = () => {
      class MockExportImage {
        srcValue = ''
        naturalWidth = 400
        naturalHeight = 400
        width = 400
        height = 400
        crossOrigin: string | null = null
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(val: string) {
          this.srcValue = val
          queueMicrotask(() => this.onload?.())
        }
        get src(): string {
          return this.srcValue
        }
      }

      const createMockCanvas = () => ({
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
            fillText: () => {},
            drawImage: () => {},
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4),
              width: w,
              height: h,
            }),
            putImageData: () => {},
          }
        },
        toBlob: (cb: (b: Blob | null) => void) =>
          cb(new Blob(['mock-png'], { type: 'image/png' })),
        toDataURL: () => 'data:image/png;base64,bW9jay1wbmc=',
      })

      vi.stubGlobal('Image', MockExportImage)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      vi.stubGlobal('document', {
        body: { appendChild: () => {} },
        createElement: (tag: string) => {
          if (tag === 'a') {
            const anchor = {
              download: '',
              href: '',
              rel: '',
              style: { display: '' },
              click: () => {
                anchorClicks.push({
                  download: anchor.download,
                  href: anchor.href,
                })
              },
              remove: () => {},
            }
            return anchor
          }
          return createMockCanvas()
        },
      })
      vi.stubGlobal('URL', {
        createObjectURL: () => 'blob:mock-object-url',
        revokeObjectURL: () => {},
      })
    }

    const sampleAlbum: ScoredAlbum = {
      key: 'alb-share-1',
      albumId: 'alb-share-1',
      name: 'Test Album',
      canonicalName: 'test album',
      mergedEditionNames: ['Test Album'],
      albumType: 'album',
      artists: [{ id: 'art-1', name: 'Test Artist' }],
      primaryArtist: 'Test Artist',
      releaseDate: '2025-01-01',
      releaseYear: '2025',
      coverUrl: '',
      spotifyUrl: 'https://open.spotify.com/album/alb-share-1',
      likedCount: 8,
      totalTracks: 10,
      proportionLiked: 0.8,
      averagePopularity: 75,
      topTracksCount: 1,
      topTracksBoostScore: 20,
      recencyScore: 60,
      bayesianProportion: 0.72,
      finalScore: 80.5,
      scoreBreakdown: {
        proportionComponent: 72,
        volumeComponent: 70,
        topTracksComponent: 20,
        popularityComponent: 75,
        recencyComponent: 60,
      },
      latestLikedAt: '2026-01-01T00:00:00Z',
      tracks: [],
      isTracklistComplete: true,
    }

    const baseExportOptions: ShareImageExportOptions = {
      viewLayout: 'grid',
      albums: [sampleAlbum],
      userDisplayName: 'Mobile Listener',
      totalLikedSongs: 10,
      noSkipCount: 0,
      topBoostedCount: 1,
      rankingMode: 'weighted',
      gradeBasedTiering: false,
      brandLogoSrc: 'data:image/png;base64,mock-logo',
      signatureSrc: 'data:image/png;base64,mock-sig',
      isDemo: false,
    }

    // 1) iOS Safari: shares ONLY { files: [File] } and does not click <a>
    setupDomStubs()
    const shareMock = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      canShare: vi.fn(() => true),
      share: shareMock,
    })

    const sharedResult = await downloadShareImage(baseExportOptions)
    expect(sharedResult.delivery).toBe('shared')
    expect(shareMock).toHaveBeenCalledTimes(1)
    const shareArg = (shareMock.mock.calls as unknown[][])[0][0] as ShareData
    expect(Object.keys(shareArg)).toEqual(['files'])
    expect(shareArg.files).toHaveLength(1)
    expect(shareArg.files![0].name).toBe('spotkit-top-albums-grid.png')
    expect(shareArg.files![0].type).toBe('image/png')
    expect(anchorClicks).toHaveLength(0)

    // 2) iOS Safari user cancels share sheet -> returns 'cancelled', no <a> download
    const abortErr = Object.assign(new Error('Cancelled'), { name: 'AbortError' })
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      canShare: vi.fn(() => true),
      share: vi.fn(async () => {
        throw abortErr
      }),
    })
    const cancelledResult = await downloadShareImage(baseExportOptions)
    expect(cancelledResult.delivery).toBe('cancelled')
    expect(anchorClicks).toHaveLength(0)

    // 3) iOS Safari NotAllowedError (gesture expired) -> returns 'preview' with data URL, no <a> download
    const notAllowedErr = Object.assign(new Error('Not allowed'), {
      name: 'NotAllowedError',
    })
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      canShare: vi.fn(() => true),
      share: vi.fn(async () => {
        throw notAllowedErr
      }),
    })
    const blockedResult = await downloadShareImage(baseExportOptions)
    expect(blockedResult.delivery).toBe('preview')
    expect(blockedResult.preview?.previewUrl.startsWith('data:image/png')).toBe(
      true,
    )
    expect(blockedResult.preview?.canNativeShare).toBe(true)
    expect(anchorClicks).toHaveLength(0)

    // 4) Mobile browser without file sharing -> returns 'preview' with canNativeShare: false
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      canShare: vi.fn(() => false),
      share: vi.fn(async () => {}),
    })
    const unsupportedResult = await downloadShareImage(baseExportOptions)
    expect(unsupportedResult.delivery).toBe('preview')
    expect(unsupportedResult.preview?.canNativeShare).toBe(false)
    expect(anchorClicks).toHaveLength(0)

    // 5) Desktop macOS Safari -> skips navigator.share and triggers <a download>
    const desktopShareMock = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      canShare: vi.fn(() => true),
      share: desktopShareMock,
    })
    const desktopResult = await downloadShareImage(baseExportOptions)
    expect(desktopResult.delivery).toBe('downloaded')
    expect(desktopShareMock).not.toHaveBeenCalled()
    expect(anchorClicks).toHaveLength(1)
    expect(anchorClicks[0].download).toBe('spotkit-top-albums-grid.png')

    // Helper sanity check for direct shareImageFile / canShareImageFile
    const testFile = new File(['x'], 'test.png', { type: 'image/png' })
    expect(canShareImageFile(testFile, { canShare: () => true, share: async () => {} })).toBe(true)
    expect(await shareImageFile(testFile, { canShare: () => false })).toBe('unsupported')
  })
})
