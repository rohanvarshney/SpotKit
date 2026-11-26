// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

export type SharedAlbumType = 'album' | 'single' | 'compilation'

export type SharedTopTimeRange = 'short_term' | 'medium_term' | 'long_term'

export type SharedCamelotCode =
  | '1A'
  | '2A'
  | '3A'
  | '4A'
  | '5A'
  | '6A'
  | '7A'
  | '8A'
  | '9A'
  | '10A'
  | '11A'
  | '12A'
  | '1B'
  | '2B'
  | '3B'
  | '4B'
  | '5B'
  | '6B'
  | '7B'
  | '8B'
  | '9B'
  | '10B'
  | '11B'
  | '12B'

export interface SharedMockTrackSpec {
  name: string
  durationSec: number
  liked: boolean
  addedAt?: string
  popularity?: number
  topRank?: number
  topRanges?: SharedTopTimeRange[]
}

export interface SharedMockAlbumSpec {
  id: string
  name: string
  artistId: string
  artistName: string
  albumType: SharedAlbumType
  releaseDate: string
  colorA: string
  colorB: string
  accent: string
  tracks: SharedMockTrackSpec[]
}

export interface SharedCompactAlbumSeed {
  id: string
  name: string
  artistId: string
  artistName: string
  albumType?: SharedAlbumType
  releaseDate: string
  totalTracks: number
  likedCount: number
  popularity: number
  topRank?: number
  topRanges?: SharedTopTimeRange[]
  tracks: string[]
}

export interface SharedDemoPlaylistPreset {
  id: string
  name: string
  shortLabel: string
  description: string
  ownerName: string
  url: string
  accent: string
}

export interface SharedDemoTrackSeed {
  id: string
  canonicalTrackId: string
  albumId: string
  name: string
  artists: string[]
  albumName: string
  durationMs: number
  popularity: number
  bpm: number
  camelot: SharedCamelotCode
  energy: number
  danceability: number
  valence: number
  inLiked: boolean
  playlistIds: string[]
  vibeTags: string
  colorA: string
  colorB: string
  accent: string
}
