// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  SPOTKIT_DEMO_ALBUMS,
  SPOTKIT_DEMO_CATALOG_VERSION,
  UNHYDRATED_DEMO_ALBUM_IDS,
  createCoverSvg,
} from '../../../shared/spotkitDemoCatalog'
import { normalizeTrackTitle } from '../lib/albumScorer'
import type {
  RawLibraryDataset,
  SpotifyAlbumFull,
  SpotifySavedTrackItem,
  UserTopTrackEntry,
} from '../types/spotify'

export { SPOTKIT_DEMO_ALBUMS, SPOTKIT_DEMO_CATALOG_VERSION }

const DEMO_FULL_ALBUMS_MAP: Record<string, SpotifyAlbumFull> = {}

function buildSpotifySearchUrl(query: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`
}

export async function hydrateDemoAlbumById(
  albumId: string,
): Promise<SpotifyAlbumFull | null> {
  if (Object.keys(DEMO_FULL_ALBUMS_MAP).length === 0) {
    buildDemoLibraryDataset()
  }
  await new Promise((resolve) => setTimeout(resolve, 320))
  return DEMO_FULL_ALBUMS_MAP[albumId] ?? null
}

export function buildDemoLibraryDataset(): RawLibraryDataset {
  const savedTracks: SpotifySavedTrackItem[] = []
  const topTracksMap: Record<string, UserTopTrackEntry> = {}
  const hydratedAlbumsMap: Record<string, SpotifyAlbumFull> = {}

  for (const spec of SPOTKIT_DEMO_ALBUMS) {
    const coverUrl = createCoverSvg(
      spec.name,
      spec.artistName,
      spec.colorA,
      spec.colorB,
      spec.accent,
    )
    const artistObj = {
      id: spec.artistId,
      name: spec.artistName,
      external_urls: { spotify: buildSpotifySearchUrl(spec.artistName) },
    }

    const albumSimple = {
      id: spec.id,
      name: spec.name,
      album_type: spec.albumType,
      total_tracks: spec.tracks.length,
      release_date: spec.releaseDate,
      images: [{ url: coverUrl, height: 400, width: 400 }],
      artists: [artistObj],
      external_urls: {
        spotify: buildSpotifySearchUrl(`${spec.name} ${spec.artistName}`),
      },
    }

    const trackSimples = spec.tracks.map((t, index) => {
      const trackId = `${spec.id}_trk_${index + 1}`
      const trackSpotifyUrl = buildSpotifySearchUrl(
        `${t.name} ${spec.artistName}`,
      )
      if (t.topRank && t.topRanges) {
        const rankByRange = Object.fromEntries(
          t.topRanges.map((r, idx) => [r, Math.min(50, t.topRank! + idx * 2)]),
        )
        topTracksMap[trackId] = {
          trackId,
          normalizedTitle: normalizeTrackTitle(t.name),
          primaryArtistName: spec.artistName.toLowerCase(),
          bestRank: t.topRank,
          ranges: t.topRanges,
          rankByRange,
          scoreBoost: Math.min(
            1,
            (51 - t.topRank) / 50 + 0.1 * (t.topRanges.length - 1),
          ),
        }
      }

      if (t.liked) {
        savedTracks.push({
          added_at: t.addedAt || '2026-09-01T12:00:00Z',
          track: {
            id: trackId,
            name: t.name,
            track_number: index + 1,
            disc_number: 1,
            duration_ms: t.durationSec * 1000,
            artists: [artistObj],
            album: albumSimple,
            popularity: t.popularity ?? 75,
            external_urls: { spotify: trackSpotifyUrl },
          },
        })
      }

      return {
        id: trackId,
        name: t.name,
        track_number: index + 1,
        disc_number: 1,
        duration_ms: t.durationSec * 1000,
        artists: [artistObj],
        external_urls: { spotify: trackSpotifyUrl },
      }
    })

    const fullAlbum: SpotifyAlbumFull = {
      ...albumSimple,
      tracks: {
        items: trackSimples,
        total: trackSimples.length,
      },
    }
    DEMO_FULL_ALBUMS_MAP[spec.id] = fullAlbum
    if (!UNHYDRATED_DEMO_ALBUM_IDS.has(spec.id)) {
      hydratedAlbumsMap[spec.id] = fullAlbum
    }
  }

  return {
    user: {
      id: 'demo_listener',
      display_name: 'SpotKit Demo Listener',
      product: 'premium',
    },
    savedTracks,
    topTracksMap,
    hydratedAlbumsMap,
    isDemo: true,
    fetchedAt: new Date().toISOString(),
  }
}
