import type {
  LoadingProgress,
  RawLibraryDataset,
  SpotifyAlbumFull,
  SpotifySavedTrackItem,
  SpotifyTrackFull,
  SpotifyUserProfile,
  TopTrackTimeRange,
  UserTopTrackEntry,
} from '../types/spotify'
import { normalizeTrackTitle } from './albumScorer'

const API_BASE = 'https://api.spotify.com/v1'

async function spotifyFetch<T>(
  endpointOrUrl: string,
  accessToken: string,
  retries = 3,
): Promise<T> {
  const url = endpointOrUrl.startsWith('http')
    ? endpointOrUrl
    : `${API_BASE}${endpointOrUrl}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (response.status === 429 && retries > 0) {
    const retryAfterSec = Number(response.headers.get('Retry-After') || '2')
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, retryAfterSec) * 1000),
    )
    return spotifyFetch<T>(endpointOrUrl, accessToken, retries - 1)
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Spotify API error (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  next: string | null
}

export async function fetchUserLibraryAndMetadata(
  accessToken: string,
  onProgress: (progress: LoadingProgress) => void,
): Promise<RawLibraryDataset> {
  const recentItems: string[] = []
  const pushRecent = (label: string) => {
    recentItems.unshift(label)
    if (recentItems.length > 6) recentItems.pop()
  }

  // Stage 1: User Profile
  onProgress({
    stage: 'profile',
    stageLabel: 'Connecting to Spotify Profile',
    detail: 'Verifying account & library permissions…',
    likedFetched: 0,
    likedTotal: 0,
    albumsHydrated: 0,
    albumsTotal: 0,
    recentItems: [...recentItems],
    percent: 4,
  })

  const user = await spotifyFetch<SpotifyUserProfile>('/me', accessToken)
  pushRecent(`Connected as ${user.display_name || user.id}`)

  // Stage 2: Fetch all Liked Songs (/me/tracks)
  const savedTracks: SpotifySavedTrackItem[] = []
  let nextUrl: string | null = '/me/tracks?limit=50&offset=0'
  let totalLiked = 0

  while (nextUrl) {
    const page: PaginatedResponse<SpotifySavedTrackItem> =
      await spotifyFetch<PaginatedResponse<SpotifySavedTrackItem>>(
        nextUrl,
        accessToken,
      )
    totalLiked = page.total || savedTracks.length + page.items.length

    for (const item of page.items) {
      if (item?.track && item.track.album && item.track.id) {
        savedTracks.push(item)
      }
    }

    const sampleItem = page.items[0]?.track
    if (sampleItem) {
      pushRecent(
        `Liked: "${sampleItem.name}" — ${sampleItem.artists[0]?.name ?? 'Unknown'} (${sampleItem.album.name})`,
      )
    }

    const ratio = totalLiked > 0 ? Math.min(1, savedTracks.length / totalLiked) : 1
    onProgress({
      stage: 'liked_songs',
      stageLabel: 'Scanning Your Liked Songs',
      detail: `Loaded ${savedTracks.length.toLocaleString()} of ${totalLiked.toLocaleString()} liked tracks…`,
      likedFetched: savedTracks.length,
      likedTotal: totalLiked,
      albumsHydrated: 0,
      albumsTotal: 0,
      recentItems: [...recentItems],
      percent: Math.round(8 + ratio * 52),
    })

    nextUrl = page.next
  }

  // Stage 3: Fetch User's Top Tracks across short, medium, and long term
  onProgress({
    stage: 'top_tracks',
    stageLabel: 'Analyzing Heavy Rotation (Top Tracks)',
    detail: 'Checking short-term, 6-month, and all-time most played songs…',
    likedFetched: savedTracks.length,
    likedTotal: totalLiked,
    albumsHydrated: 0,
    albumsTotal: 0,
    recentItems: [...recentItems],
    percent: 64,
  })

  const topTracksMap: Record<string, UserTopTrackEntry> = {}
  const ranges: TopTrackTimeRange[] = ['short_term', 'medium_term', 'long_term']

  for (const range of ranges) {
    try {
      const topPage = await spotifyFetch<PaginatedResponse<SpotifyTrackFull>>(
        `/me/top/tracks?limit=50&time_range=${range}`,
        accessToken,
      )
      topPage.items.forEach((track, idx) => {
        if (!track?.id) return
        const rank = idx + 1
        const existing = topTracksMap[track.id]
        const rankBoost = (51 - rank) / 50 // 1.0 for #1 down to 0.02 for #50
        if (!existing) {
          topTracksMap[track.id] = {
            trackId: track.id,
            normalizedTitle: normalizeTrackTitle(track.name),
            primaryArtistName: (track.artists[0]?.name || '').toLowerCase(),
            bestRank: rank,
            ranges: [range],
            scoreBoost: rankBoost,
          }
        } else {
          existing.bestRank = Math.min(existing.bestRank, rank)
          if (!existing.ranges.includes(range)) {
            existing.ranges.push(range)
          }
          existing.scoreBoost = Math.min(
            1,
            Math.max(existing.scoreBoost, rankBoost) + 0.12 * (existing.ranges.length - 1),
          )
        }
      })
    } catch {
      // Continue gracefully if user-top-read has no data
    }
  }

  pushRecent(
    `Indexed ${Object.keys(topTracksMap).length} unique Top Tracks across time scopes`,
  )

  // Stage 4: Determine candidate albums to hydrate full tracklists (/v1/albums?ids=...)
  // We prioritize albums where the user has >= 2 liked songs (up to top 160 albums) so batch hydration is fast and respects rate limits.
  const albumLikedCounts = new Map<string, number>()
  for (const item of savedTracks) {
    const albId = item.track.album?.id
    if (!albId) continue
    albumLikedCounts.set(albId, (albumLikedCounts.get(albId) || 0) + 1)
  }

  const candidateAlbumIds = Array.from(albumLikedCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 180)
    .map(([id]) => id)

  const hydratedAlbumsMap: Record<string, SpotifyAlbumFull> = {}
  const batchSize = 20

  for (let i = 0; i < candidateAlbumIds.length; i += batchSize) {
    const batch = candidateAlbumIds.slice(i, i + batchSize)
    try {
      const res = await spotifyFetch<{ albums: (SpotifyAlbumFull | null)[] }>(
        `/albums?ids=${batch.join(',')}`,
        accessToken,
      )
      for (const alb of res.albums) {
        if (alb && alb.id) {
          hydratedAlbumsMap[alb.id] = alb
        }
      }
      const firstHydrated = res.albums.find(Boolean)
      if (firstHydrated) {
        pushRecent(`Hydrated tracklist: ${firstHydrated.name} (${firstHydrated.total_tracks} tracks)`)
      }
    } catch {
      // If a batch fails, we still fall back to simple album metadata from savedTracks
    }

    const hydratedCount = Math.min(candidateAlbumIds.length, i + batch.length)
    const ratio =
      candidateAlbumIds.length > 0
        ? hydratedCount / candidateAlbumIds.length
        : 1

    onProgress({
      stage: 'album_hydration',
      stageLabel: 'Hydrating Complete Album Tracklists',
      detail: `Fetched full tracklists for ${hydratedCount} of ${candidateAlbumIds.length} candidate albums…`,
      likedFetched: savedTracks.length,
      likedTotal: totalLiked,
      albumsHydrated: hydratedCount,
      albumsTotal: candidateAlbumIds.length,
      recentItems: [...recentItems],
      percent: Math.round(70 + ratio * 25),
    })
  }

  onProgress({
    stage: 'scoring',
    stageLabel: 'Computing Album Scores & Rankings',
    detail: 'Calculating proportions, Bayesian confidence, and Top Track boosts…',
    likedFetched: savedTracks.length,
    likedTotal: totalLiked,
    albumsHydrated: candidateAlbumIds.length,
    albumsTotal: candidateAlbumIds.length,
    recentItems: [...recentItems],
    percent: 100,
  })

  return {
    user,
    savedTracks,
    topTracksMap,
    hydratedAlbumsMap,
    isDemo: false,
    fetchedAt: new Date().toISOString(),
  }
}
