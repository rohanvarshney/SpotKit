// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type {
  LoadingProgress,
  RawLibraryDataset,
  SpotifyAlbumFull,
  SpotifyAlbumSimple,
  SpotifySavedTrackItem,
  SpotifyTrackFull,
  SpotifyTrackSimple,
  SpotifyUserProfile,
  TopTrackTimeRange,
  UserTopTrackEntry,
} from '../types/spotify'
import { normalizeAlbumTitle, normalizeTrackTitle } from './albumScorer'
import {
  getCachedHydratedAlbums,
  setCachedHydratedAlbum,
  setCachedLibraryDataset,
} from './libraryCache'

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

export function selectCandidateAlbumIdsToHydrate(
  savedTracks: SpotifySavedTrackItem[],
  maxCandidates = 200,
): string[] {
  const albumLikedCounts = new Map<string, number>()
  const albumMetaById = new Map<string, SpotifyAlbumSimple>()
  const artistLikedCounts = new Map<string, number>()

  for (const item of savedTracks) {
    const alb = item?.track?.album
    if (!alb || !alb.id) continue

    albumLikedCounts.set(alb.id, (albumLikedCounts.get(alb.id) || 0) + 1)
    if (!albumMetaById.has(alb.id)) {
      albumMetaById.set(alb.id, alb)
    }

    const artists = [
      ...(item.track.artists || []),
      ...(alb.artists || []),
    ]
    const seenArtistKeys = new Set<string>()
    for (const art of artists) {
      const key = art?.id || art?.name?.toLowerCase().trim()
      if (key && !seenArtistKeys.has(key)) {
        seenArtistKeys.add(key)
        artistLikedCounts.set(key, (artistLikedCounts.get(key) || 0) + 1)
      }
    }
  }

  const scoredCandidates: Array<{ id: string; priority: number }> = []

  for (const [albId, directLikes] of albumLikedCounts.entries()) {
    const alb = albumMetaById.get(albId)
    if (!alb) continue

    // 1-track singles already have their entire tracklist in savedTracks, so skip hydrating them
    if ((alb.total_tracks || 0) <= 1 && alb.album_type === 'single') {
      continue
    }

    let maxArtistLikes = directLikes
    for (const art of alb.artists || []) {
      const key = art?.id || art?.name?.toLowerCase().trim()
      if (key) {
        maxArtistLikes = Math.max(
          maxArtistLikes,
          artistLikedCounts.get(key) || 0,
        )
      }
    }

    // Other liked songs by the same artist (e.g. standalone singles like "Savana", "Ease My Mind", "Psycho")
    const extraArtistLikes = Math.max(0, maxArtistLikes - directLikes)

    // Prioritize full albums and multi-track releases, boosting albums whose artist has extra liked singles
    const isFullAlbumBonus = alb.album_type === 'album' ? 30 : 0
    const deepTracklistBonus = (alb.total_tracks || 0) >= 5 ? 15 : 0
    const priority =
      directLikes * 10 +
      extraArtistLikes * 6 +
      isFullAlbumBonus +
      deepTracklistBonus

    scoredCandidates.push({ id: albId, priority })
  }

  return scoredCandidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxCandidates)
    .map((c) => c.id)
}

export async function discoverAndHydrateParentAlbumsForSingles(
  savedTracks: SpotifySavedTrackItem[],
  hydratedAlbumsMap: Record<string, SpotifyAlbumFull>,
  accessToken: string,
  maxArtists = 15,
): Promise<Record<string, SpotifyAlbumFull>> {
  // Build set of artist+track pairs already covered by hydrated full albums
  const coveredArtistTracks = new Set<string>()
  for (const alb of Object.values(hydratedAlbumsMap)) {
    if (!alb || alb.album_type !== 'album' || !alb.tracks?.items) continue
    for (const trk of alb.tracks.items) {
      const normTrack = normalizeTrackTitle(trk.name)
      const artists = [...(trk.artists || []), ...(alb.artists || [])]
      for (const art of artists) {
        if (art?.id) coveredArtistTracks.add(`${art.id}::${normTrack}`)
        if (art?.name) {
          coveredArtistTracks.add(`${art.name.toLowerCase().trim()}::${normTrack}`)
        }
      }
    }
  }

  // Group unmatched liked singles by artist ID
  const unmatchedSinglesByArtist = new Map<
    string,
    { artistId: string; artistName: string; normTitles: Set<string> }
  >()

  for (const item of savedTracks) {
    const alb = item?.track?.album
    if (!alb || alb.album_type !== 'single') continue

    const normTrack = normalizeTrackTitle(item.track.name)
    const primaryArtist = item.track.artists?.[0] || alb.artists?.[0]
    if (!primaryArtist?.id) continue

    const isCovered =
      coveredArtistTracks.has(`${primaryArtist.id}::${normTrack}`) ||
      (primaryArtist.name
        ? coveredArtistTracks.has(
            `${primaryArtist.name.toLowerCase().trim()}::${normTrack}`,
          )
        : false)

    if (isCovered) continue

    let entry = unmatchedSinglesByArtist.get(primaryArtist.id)
    if (!entry) {
      entry = {
        artistId: primaryArtist.id,
        artistName: primaryArtist.name || '',
        normTitles: new Set(),
      }
      unmatchedSinglesByArtist.set(primaryArtist.id, entry)
    }
    entry.normTitles.add(normTrack)
  }

  const candidateArtists = Array.from(unmatchedSinglesByArtist.values())
    .filter((a) => a.normTitles.size >= 2)
    .sort((a, b) => b.normTitles.size - a.normTitles.size)
    .slice(0, maxArtists)

  const discoveredMap: Record<string, SpotifyAlbumFull> = {}
  if (candidateArtists.length === 0) return discoveredMap

  const albumIdsToHydrate: Array<{
    albumId: string
    expectedTitles: Set<string>
  }> = []

  for (const artistEntry of candidateArtists) {
    try {
      const page = await spotifyFetch<PaginatedResponse<SpotifyAlbumSimple>>(
        `/artists/${artistEntry.artistId}/albums?include_groups=album&limit=6`,
        accessToken,
      )
      const seenCanonicalTitles = new Set<string>()
      for (const alb of page.items || []) {
        if (!alb?.id || alb.album_type !== 'album') continue
        if (hydratedAlbumsMap[alb.id]) continue
        const canon = normalizeAlbumTitle(alb.name).toLowerCase()
        if (seenCanonicalTitles.has(canon)) continue
        seenCanonicalTitles.add(canon)
        albumIdsToHydrate.push({
          albumId: alb.id,
          expectedTitles: artistEntry.normTitles,
        })
        if (seenCanonicalTitles.size >= 2) break
      }
    } catch {
      // Ignore per-artist lookup errors gracefully
    }
  }

  for (let i = 0; i < albumIdsToHydrate.length; i += 6) {
    const batch = albumIdsToHydrate.slice(i, i + 6)
    const settled = await Promise.allSettled(
      batch.map((b) => fetchSingleAlbumFull(b.albumId, accessToken)),
    )
    settled.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value?.id) {
        const fullAlb = res.value
        const expected = batch[idx].expectedTitles
        const matchesAnySingle = (fullAlb.tracks?.items || []).some((trk) =>
          expected.has(normalizeTrackTitle(trk.name)),
        )
        if (matchesAnySingle) {
          discoveredMap[fullAlb.id] = fullAlb
        }
      }
    })
  }

  return discoveredMap
}

export async function fetchSingleAlbumFull(
  albumId: string,
  accessToken: string,
): Promise<SpotifyAlbumFull> {
  const cached = await getCachedHydratedAlbums([albumId])
  if (cached[albumId]) {
    return cached[albumId]
  }

  const alb = await spotifyFetch<SpotifyAlbumFull>(
    `/albums/${albumId}`,
    accessToken,
  )

  // If the album has more than 50 tracks (or a paginated `tracks.next` cursor),
  // fetch all remaining pages from /v1/albums/{id}/tracks so the tracklist is complete.
  let nextTracksUrl: string | null =
    alb.tracks?.next ??
    (alb.total_tracks > (alb.tracks?.items?.length || 0)
      ? `/albums/${alb.id}/tracks?limit=50&offset=${alb.tracks?.items?.length || 50}`
      : null)

  while (nextTracksUrl) {
    try {
      const tracksPage = await spotifyFetch<
        PaginatedResponse<SpotifyTrackSimple>
      >(nextTracksUrl, accessToken)
      if (tracksPage.items?.length) {
        alb.tracks.items.push(...tracksPage.items)
      }
      nextTracksUrl = tracksPage.next
    } catch {
      // Stop paginating this album's extra tracks if an error occurs
      break
    }
  }

  if (alb.tracks) {
    alb.tracks.next = null
  }
  await setCachedHydratedAlbum(alb)
  return alb
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
            rankByRange: { [range]: rank },
            scoreBoost: rankBoost,
          }
        } else {
          existing.bestRank = Math.min(existing.bestRank, rank)
          if (!existing.ranges.includes(range)) {
            existing.ranges.push(range)
          }
          existing.rankByRange = {
            ...existing.rankByRange,
            [range]: Math.min(existing.rankByRange?.[range] ?? rank, rank),
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

  // Stage 4: Determine candidate albums to hydrate full tracklists (/v1/albums/{id})
  // Note: Spotify removed the bulk `GET /v1/albums?ids=...` endpoint in 2026 for Dev Mode apps,
  // so we fetch candidate albums individually via `GET /v1/albums/{id}` with bounded concurrency.
  const candidateAlbumIds = selectCandidateAlbumIdsToHydrate(savedTracks, 200)

  const cachedAlbumsMap = await getCachedHydratedAlbums(candidateAlbumIds)
  const hydratedAlbumsMap: Record<string, SpotifyAlbumFull> = {
    ...cachedAlbumsMap,
  }
  const uncachedAlbumIds = candidateAlbumIds.filter(
    (id) => !hydratedAlbumsMap[id],
  )
  const cachedCount = candidateAlbumIds.length - uncachedAlbumIds.length
  if (cachedCount > 0) {
    pushRecent(
      `Restored ${cachedCount} album tracklists from local cache`,
    )
  }

  const concurrency = 6

  for (let i = 0; i < uncachedAlbumIds.length; i += concurrency) {
    const batch = uncachedAlbumIds.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map((albId) => fetchSingleAlbumFull(albId, accessToken)),
    )

    let firstHydrated: SpotifyAlbumFull | null = null
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value?.id) {
        hydratedAlbumsMap[res.value.id] = res.value
        if (!firstHydrated) firstHydrated = res.value
      }
    }

    if (firstHydrated) {
      pushRecent(
        `Hydrated tracklist: ${firstHydrated.name} (${firstHydrated.total_tracks} tracks)`,
      )
    }

    const hydratedCount =
      cachedCount + Math.min(uncachedAlbumIds.length, i + batch.length)
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

  // Stage 4b: Discover parent LPs for artists where the user liked 2+ standalone singles (e.g. pre-release singles for an album)
  const discoveredParentAlbums = await discoverAndHydrateParentAlbumsForSingles(
    savedTracks,
    hydratedAlbumsMap,
    accessToken,
  )
  for (const alb of Object.values(discoveredParentAlbums)) {
    hydratedAlbumsMap[alb.id] = alb
    pushRecent(
      `Matched singles to parent album: ${alb.name} (${alb.total_tracks} tracks)`,
    )
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

  const datasetResult: RawLibraryDataset = {
    user,
    savedTracks,
    topTracksMap,
    hydratedAlbumsMap,
    isDemo: false,
    fetchedAt: new Date().toISOString(),
  }

  await setCachedLibraryDataset(datasetResult)
  return datasetResult
}
