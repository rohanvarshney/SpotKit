import type {
  AlbumTrackStatus,
  FilterAndSortOptions,
  RawLibraryDataset,
  ScoredAlbum,
  ScoringWeights,
  SpotifyAlbumSimple,
  SpotifySavedTrackItem,
  TopTrackTimeRange,
  UserTopTrackEntry,
} from '../types/spotify'

export const DEFAULT_WEIGHTS: ScoringWeights = {
  proportionWeight: 55,
  volumeWeight: 25,
  topTracksWeight: 15,
  recencyWeight: 5,
}

const EDITION_SUFFIX_PATTERNS: RegExp[] = [
  /\s*\((?:[^)]*\b(?:deluxe|remaster(?:ed)?|expanded|anniversary|bonus|special|collector|platinum|super deluxe|edition|version|reissue|complete)\b[^)]*)\)/gi,
  /\s*\[(?:[^\]]*\b(?:deluxe|remaster(?:ed)?|expanded|anniversary|bonus|special|collector|platinum|super deluxe|edition|version|reissue|complete)\b[^\]]*)\]/gi,
  /\s*-\s*(?:\d{4}\s+)?(?:deluxe|remaster(?:ed)?|expanded|anniversary|bonus\s+track|special)\b.*$/gi,
]

export function normalizeAlbumTitle(title: string): string {
  let cleaned = title.trim()
  for (const pattern of EDITION_SUFFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }
  return cleaned.replace(/\s+/g, ' ').trim()
}

export function normalizeTrackTitle(title: string): string {
  let cleaned = title.toLowerCase().trim()
  for (const pattern of EDITION_SUFFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }
  cleaned = cleaned
    .replace(/\s*\((?:feat\.?|ft\.?|with)\s+[^)]+\)/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || title.toLowerCase().trim()
}

export function getCanonicalAlbumKey(
  album: SpotifyAlbumSimple,
  deduplicateEditions: boolean,
): string {
  if (!deduplicateEditions) {
    return album.id
  }
  const primaryArtist = (album.artists[0]?.name || 'unknown')
    .toLowerCase()
    .trim()
  const normAlbum = normalizeAlbumTitle(album.name).toLowerCase()
  return `${primaryArtist}::${normAlbum}`
}

interface LikedTrackRecord {
  trackId: string
  name: string
  normalizedName: string
  trackNumber: number
  discNumber: number
  durationMs: number
  popularity: number
  addedAt: string
  spotifyUrl?: string
  sourceAlbumId: string
  topTrackInfo?: UserTopTrackEntry
}

interface AlbumBucket {
  key: string
  albumsByEdition: Map<string, SpotifyAlbumSimple>
  editionLikedCounts: Map<string, number>
  likedTracksByNormName: Map<string, LikedTrackRecord>
}

const CANONICAL_RANGES: TopTrackTimeRange[] = [
  'short_term',
  'medium_term',
  'long_term',
]

function mergeTopTrackEntries(
  a: UserTopTrackEntry,
  b: UserTopTrackEntry,
): UserTopTrackEntry {
  const rankByRange: Partial<Record<TopTrackTimeRange, number>> = {
    ...a.rankByRange,
  }
  for (const r of a.ranges) {
    if (rankByRange[r] === undefined) {
      rankByRange[r] = a.bestRank
    }
  }
  for (const r of b.ranges) {
    const bRank = b.rankByRange?.[r] ?? b.bestRank
    const prev = rankByRange[r]
    rankByRange[r] = prev === undefined ? bRank : Math.min(prev, bRank)
  }
  const mergedRanges = CANONICAL_RANGES.filter(
    (r) => a.ranges.includes(r) || b.ranges.includes(r),
  )
  const bestRank = Math.min(a.bestRank, b.bestRank)
  const baseBoost = (51 - bestRank) / 50
  const scoreBoost = Math.min(
    1,
    Math.max(a.scoreBoost, b.scoreBoost, baseBoost) +
      0.12 * Math.max(0, mergedRanges.length - 1),
  )
  return {
    trackId: a.trackId,
    normalizedTitle: a.normalizedTitle,
    primaryArtistName: a.primaryArtistName,
    bestRank,
    ranges: mergedRanges,
    rankByRange,
    scoreBoost,
  }
}

function findTopTrackMatch(
  trackId: string,
  normalizedName: string,
  primaryArtist: string,
  topTracksMap: Record<string, UserTopTrackEntry>,
): UserTopTrackEntry | undefined {
  let result: UserTopTrackEntry | undefined = topTracksMap[trackId]
  const artistLower = primaryArtist.toLowerCase()
  for (const entry of Object.values(topTracksMap)) {
    if (
      entry.normalizedTitle === normalizedName &&
      entry.primaryArtistName === artistLower
    ) {
      result = result ? mergeTopTrackEntries(result, entry) : entry
    }
  }
  return result
}

export function scoreAndFilterAlbums(
  dataset: RawLibraryDataset,
  options: FilterAndSortOptions,
): ScoredAlbum[] {
  const { savedTracks, topTracksMap, hydratedAlbumsMap } = dataset
  const {
    rankingMode,
    customWeights,
    minTotalTracks,
    minLikedTracks,
    fullAlbumsOnly,
    deduplicateEditions,
    searchQuery,
  } = options

  const buckets = new Map<string, AlbumBucket>()

  // Determine earliest and latest timestamps across library for recency normalization
  let minTimestamp = Infinity
  let maxTimestamp = -Infinity
  for (const item of savedTracks) {
    const ts = Date.parse(item.added_at)
    if (!Number.isNaN(ts)) {
      if (ts < minTimestamp) minTimestamp = ts
      if (ts > maxTimestamp) maxTimestamp = ts
    }
  }
  if (!Number.isFinite(minTimestamp) || maxTimestamp <= minTimestamp) {
    minTimestamp = Date.now() - 365 * 24 * 3600 * 1000
    maxTimestamp = Date.now()
  }

  for (const item of savedTracks) {
    const album = item.track?.album
    if (!album || !album.id) continue

    const key = getCanonicalAlbumKey(album, deduplicateEditions)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        key,
        albumsByEdition: new Map(),
        editionLikedCounts: new Map(),
        likedTracksByNormName: new Map(),
      }
      buckets.set(key, bucket)
    }

    bucket.albumsByEdition.set(album.id, album)
    bucket.editionLikedCounts.set(
      album.id,
      (bucket.editionLikedCounts.get(album.id) || 0) + 1,
    )

    const normTrack = normalizeTrackTitle(item.track.name)
    const dedupTrackKey = deduplicateEditions ? normTrack : item.track.id
    const primaryArtist =
      item.track.artists[0]?.name || album.artists[0]?.name || ''

    const topMatch = findTopTrackMatch(
      item.track.id,
      normTrack,
      primaryArtist,
      topTracksMap,
    )

    const existingTrack = bucket.likedTracksByNormName.get(dedupTrackKey)
    if (!existingTrack) {
      bucket.likedTracksByNormName.set(dedupTrackKey, {
        trackId: item.track.id,
        name: item.track.name,
        normalizedName: normTrack,
        trackNumber: item.track.track_number,
        discNumber: item.track.disc_number || 1,
        durationMs: item.track.duration_ms,
        popularity: item.track.popularity ?? 50,
        addedAt: item.added_at,
        spotifyUrl: item.track.external_urls?.spotify,
        sourceAlbumId: album.id,
        topTrackInfo: topMatch,
      })
    } else {
      // Keep higher popularity, earlier/later addedAt, and preserve/merge any topTrackInfo
      if (topMatch) {
        existingTrack.topTrackInfo = existingTrack.topTrackInfo
          ? mergeTopTrackEntries(existingTrack.topTrackInfo, topMatch)
          : topMatch
      }
      if ((item.track.popularity ?? 0) > existingTrack.popularity) {
        existingTrack.popularity = item.track.popularity
      }
      if (item.added_at > existingTrack.addedAt) {
        existingTrack.addedAt = item.added_at
      }
    }
  }

  const activeWeights: ScoringWeights =
    rankingMode === 'custom' ? customWeights : DEFAULT_WEIGHTS
  const totalWeightSum = Math.max(
    1,
    activeWeights.proportionWeight +
      activeWeights.volumeWeight +
      activeWeights.topTracksWeight +
      activeWeights.recencyWeight,
  )

  const results: ScoredAlbum[] = []

  for (const bucket of buckets.values()) {
    // Pick the representative edition:
    // If deduplicating and a standard/base edition exists that is hydrated or has the cleanest name, prefer the edition with the most liked tracks (or shortest/canonical title on tie).
    const editions = Array.from(bucket.albumsByEdition.values())
    editions.sort((a, b) => {
      const aHydrated = hydratedAlbumsMap[a.id] ? 1 : 0
      const bHydrated = hydratedAlbumsMap[b.id] ? 1 : 0
      if (aHydrated !== bHydrated) return bHydrated - aHydrated
      const countA = bucket.editionLikedCounts.get(a.id) || 0
      const countB = bucket.editionLikedCounts.get(b.id) || 0
      if (countA !== countB) return countB - countA
      return a.name.length - b.name.length
    })

    const primaryAlbum = editions[0]
    if (!primaryAlbum) continue

    const canonicalName = normalizeAlbumTitle(primaryAlbum.name)
    const displayName =
      deduplicateEditions && editions.length > 1
        ? canonicalName
        : primaryAlbum.name

    // Determine effective total tracks:
    // If multiple editions were merged, use the base edition's track count if all liked tracks fit, or the representative edition's total_tracks
    const likedRecords = Array.from(bucket.likedTracksByNormName.values())
    const likedCount = likedRecords.length

    const hydrated =
      hydratedAlbumsMap[primaryAlbum.id] ||
      editions.map((e) => hydratedAlbumsMap[e.id]).find(Boolean)

    let totalTracks = hydrated
      ? hydrated.tracks.items.length || hydrated.total_tracks
      : primaryAlbum.total_tracks

    if (totalTracks < likedCount) {
      totalTracks = likedCount
    }

    // Apply filters
    if (fullAlbumsOnly && primaryAlbum.album_type !== 'album') {
      continue
    }
    if (totalTracks < minTotalTracks) {
      continue
    }
    if (likedCount < minLikedTracks) {
      continue
    }

    const primaryArtist = primaryAlbum.artists[0]?.name || 'Unknown Artist'
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const matchesTitle =
        displayName.toLowerCase().includes(q) ||
        primaryAlbum.name.toLowerCase().includes(q)
      const matchesArtist = primaryAlbum.artists.some((a) =>
        a.name.toLowerCase().includes(q),
      )
      if (!matchesTitle && !matchesArtist) {
        continue
      }
    }

    // Build complete tracklist (liked + unliked tracks if hydrated)
    const tracks: AlbumTrackStatus[] = []
    let isTracklistComplete = false

    if (hydrated && hydrated.tracks?.items?.length > 0) {
      isTracklistComplete = true
      const unmatchedLiked = new Map(
        likedRecords.map((r) => [r.normalizedName, r]),
      )
      const byIdLiked = new Map(likedRecords.map((r) => [r.trackId, r]))

      for (const albumTrack of hydrated.tracks.items) {
        const normName = normalizeTrackTitle(albumTrack.name)
        const matched =
          byIdLiked.get(albumTrack.id) || unmatchedLiked.get(normName)

        if (matched) {
          unmatchedLiked.delete(matched.normalizedName)
          byIdLiked.delete(matched.trackId)
        }

        const topMatch =
          matched?.topTrackInfo ||
          findTopTrackMatch(
            albumTrack.id,
            normName,
            primaryArtist,
            topTracksMap,
          )

        tracks.push({
          id: albumTrack.id,
          name: albumTrack.name,
          trackNumber: albumTrack.track_number,
          discNumber: albumTrack.disc_number || 1,
          durationMs: albumTrack.duration_ms,
          spotifyUrl: albumTrack.external_urls?.spotify,
          isLiked: Boolean(matched),
          addedAt: matched?.addedAt,
          popularity: matched?.popularity,
          topTrackInfo: topMatch,
        })
      }

      // If deduplicated deluxe tracks exist that weren't on the standard edition, append them as bonus liked tracks
      for (const extra of unmatchedLiked.values()) {
        tracks.push({
          id: extra.trackId,
          name: `${extra.name} (Bonus)`,
          trackNumber: tracks.length + 1,
          discNumber: extra.discNumber,
          durationMs: extra.durationMs,
          spotifyUrl: extra.spotifyUrl,
          isLiked: true,
          addedAt: extra.addedAt,
          popularity: extra.popularity,
          topTrackInfo: extra.topTrackInfo,
        })
      }

      totalTracks = Math.max(totalTracks, tracks.length)
    } else {
      // Fallback: only liked tracks are known locally
      const sortedLiked = [...likedRecords].sort(
        (a, b) =>
          a.discNumber - b.discNumber || a.trackNumber - b.trackNumber,
      )
      for (const rec of sortedLiked) {
        tracks.push({
          id: rec.trackId,
          name: rec.name,
          trackNumber: rec.trackNumber,
          discNumber: rec.discNumber,
          durationMs: rec.durationMs,
          spotifyUrl: rec.spotifyUrl,
          isLiked: true,
          addedAt: rec.addedAt,
          popularity: rec.popularity,
          topTrackInfo: rec.topTrackInfo,
        })
      }
    }

    const effectiveLikedCount = tracks.filter((t) => t.isLiked).length || likedCount
    const proportionLiked =
      totalTracks > 0 ? Math.min(1, effectiveLikedCount / totalTracks) : 0

    // Bayesian-smoothed proportion: pulls tiny 1-2 track releases toward prior (0.28) while rewarding deep album completion
    const priorK = 3.2
    const priorMean = 0.28
    const bayesianProportion =
      (effectiveLikedCount + priorK * priorMean) / (totalTracks + priorK)

    // Volume component (0..100): rewards having many liked tracks on an album (saturates smoothly around 14 tracks)
    const volumeComponent =
      Math.min(1, Math.log2(1 + effectiveLikedCount) / Math.log2(1 + 14)) * 100

    // Top tracks component (0..100)
    const topMatches = likedRecords
      .map((r) => r.topTrackInfo)
      .filter((t): t is UserTopTrackEntry => Boolean(t))
    const topTracksCount = topMatches.length
    const rawTopBoost = topMatches.reduce((acc, t) => acc + t.scoreBoost, 0)
    const topTracksBoostScore = Math.min(100, (rawTopBoost / 2.2) * 100)

    // Average popularity (0..100)
    const averagePopularity =
      likedRecords.length > 0
        ? likedRecords.reduce((sum, r) => sum + r.popularity, 0) /
          likedRecords.length
        : 50

    // Recency score (0..100)
    let latestLikedAt = ''
    let avgTimestamp = minTimestamp
    if (likedRecords.length > 0) {
      let tsSum = 0
      for (const r of likedRecords) {
        if (!latestLikedAt || r.addedAt > latestLikedAt) {
          latestLikedAt = r.addedAt
        }
        const ts = Date.parse(r.addedAt)
        tsSum += Number.isNaN(ts) ? minTimestamp : ts
      }
      avgTimestamp = tsSum / likedRecords.length
    }
    const recencyScore = Math.max(
      0,
      Math.min(
        100,
        ((avgTimestamp - minTimestamp) /
          Math.max(1, maxTimestamp - minTimestamp)) *
          100,
      ),
    )

    const proportionComponent = bayesianProportion * 100

    const weightedComposite =
      (proportionComponent * activeWeights.proportionWeight +
        volumeComponent * activeWeights.volumeWeight +
        topTracksBoostScore * activeWeights.topTracksWeight +
        recencyScore * activeWeights.recencyWeight) /
      totalWeightSum

    let finalScore = weightedComposite
    if (rankingMode === 'proportion') {
      finalScore = proportionLiked * 100
    } else if (rankingMode === 'count') {
      finalScore = Math.min(100, (effectiveLikedCount / 20) * 100)
    }

    const coverUrl =
      primaryAlbum.images?.[0]?.url ||
      primaryAlbum.images?.[1]?.url ||
      ''

    results.push({
      key: bucket.key,
      albumId: primaryAlbum.id,
      name: displayName,
      canonicalName,
      mergedEditionNames: Array.from(
        new Set(editions.map((e) => e.name)),
      ),
      albumType: primaryAlbum.album_type,
      artists: primaryAlbum.artists,
      primaryArtist,
      releaseDate: primaryAlbum.release_date || '',
      releaseYear: (primaryAlbum.release_date || '').slice(0, 4) || '—',
      coverUrl,
      spotifyUrl:
        primaryAlbum.external_urls?.spotify ||
        `https://open.spotify.com/album/${primaryAlbum.id}`,
      likedCount: effectiveLikedCount,
      totalTracks,
      proportionLiked,
      averagePopularity,
      topTracksCount,
      topTracksBoostScore,
      recencyScore,
      bayesianProportion,
      finalScore,
      scoreBreakdown: {
        proportionComponent,
        volumeComponent,
        topTracksComponent: topTracksBoostScore,
        popularityComponent: averagePopularity,
        recencyComponent: recencyScore,
      },
      latestLikedAt,
      tracks,
      isTracklistComplete,
    })
  }

  // Sort according to selected ranking mode
  results.sort((a, b) => {
    if (rankingMode === 'proportion') {
      if (Math.abs(b.proportionLiked - a.proportionLiked) > 0.0001) {
        return b.proportionLiked - a.proportionLiked
      }
      if (b.likedCount !== a.likedCount) {
        return b.likedCount - a.likedCount
      }
      return b.finalScore - a.finalScore
    }
    if (rankingMode === 'count') {
      if (b.likedCount !== a.likedCount) {
        return b.likedCount - a.likedCount
      }
      return b.proportionLiked - a.proportionLiked
    }
    return b.finalScore - a.finalScore
  })

  return results
}

export type { SpotifySavedTrackItem }
