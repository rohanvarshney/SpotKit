// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

export type AlbumType = 'album' | 'single' | 'compilation'

export interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

export interface SpotifyArtistSimple {
  id: string
  name: string
  external_urls?: {
    spotify?: string
  }
}

export interface SpotifyAlbumSimple {
  id: string
  name: string
  album_type: AlbumType
  total_tracks: number
  release_date: string
  images: SpotifyImage[]
  artists: SpotifyArtistSimple[]
  external_urls?: {
    spotify?: string
  }
}

export interface SpotifyTrackSimple {
  id: string
  name: string
  track_number: number
  disc_number: number
  duration_ms: number
  explicit?: boolean
  artists: SpotifyArtistSimple[]
  external_urls?: {
    spotify?: string
  }
}

export interface SpotifyTrackFull extends SpotifyTrackSimple {
  album: SpotifyAlbumSimple
  popularity: number
}

export interface SpotifySavedTrackItem {
  added_at: string
  track: SpotifyTrackFull
}

export interface SpotifyAlbumFull extends SpotifyAlbumSimple {
  popularity?: number
  label?: string
  tracks: {
    items: SpotifyTrackSimple[]
    total: number
    next?: string | null
  }
}

export interface SpotifyUserProfile {
  id: string
  display_name: string
  images?: SpotifyImage[]
  product?: string
  external_urls?: {
    spotify?: string
  }
}

export type TopTrackTimeRange = 'short_term' | 'medium_term' | 'long_term'

export interface UserTopTrackEntry {
  trackId: string
  normalizedTitle: string
  primaryArtistName: string
  bestRank: number // 1..50
  ranges: TopTrackTimeRange[]
  rankByRange?: Partial<Record<TopTrackTimeRange, number>>
  scoreBoost: number // 0..1 normalized boost for this track
}

export interface RawLibraryDataset {
  user: SpotifyUserProfile
  savedTracks: SpotifySavedTrackItem[]
  topTracksMap: Record<string, UserTopTrackEntry>
  hydratedAlbumsMap: Record<string, SpotifyAlbumFull>
  isDemo: boolean
  fetchedAt: string
}

export type LoadingStageId =
  | 'profile'
  | 'liked_songs'
  | 'top_tracks'
  | 'album_hydration'
  | 'scoring'

export interface LoadingProgress {
  stage: LoadingStageId
  stageLabel: string
  detail: string
  likedFetched: number
  likedTotal: number
  albumsHydrated: number
  albumsTotal: number
  recentItems: string[]
  percent: number
}

export type RankingMode = 'weighted' | 'proportion' | 'count' | 'custom'

export interface ScoringWeights {
  proportionWeight: number // 0..100
  volumeWeight: number // 0..100
  topTracksWeight: number // 0..100
  recencyWeight: number // 0..100
}

export interface FilterAndSortOptions {
  rankingMode: RankingMode
  customWeights: ScoringWeights
  minTotalTracks: number
  minLikedTracks: number
  fullAlbumsOnly: boolean
  deduplicateEditions: boolean
  searchQuery: string
}

export interface AlbumTrackStatus {
  id: string
  name: string
  trackNumber: number
  discNumber: number
  durationMs: number
  spotifyUrl?: string
  isLiked: boolean
  addedAt?: string
  popularity?: number
  topTrackInfo?: UserTopTrackEntry
}

export interface ScoredAlbum {
  key: string
  albumId: string
  name: string
  canonicalName: string
  mergedEditionNames: string[]
  albumType: AlbumType
  artists: SpotifyArtistSimple[]
  primaryArtist: string
  releaseDate: string
  releaseYear: string
  coverUrl: string
  spotifyUrl: string
  likedCount: number
  totalTracks: number
  proportionLiked: number // 0..1
  averagePopularity: number // 0..100
  topTracksCount: number
  topTracksBoostScore: number // 0..100
  recencyScore: number // 0..100
  bayesianProportion: number // 0..1
  finalScore: number // 0..100
  scoreBreakdown: {
    proportionComponent: number
    volumeComponent: number
    topTracksComponent: number
    popularityComponent: number
    recencyComponent: number
  }
  latestLikedAt: string
  tracks: AlbumTrackStatus[]
  isTracklistComplete: boolean
}
