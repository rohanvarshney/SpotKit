// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

export type CamelotCode =
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

export type AudioFeatureSource =
  | 'spotify'
  | 'reccobeats'
  | 'estimated'
  | 'curated'
  | 'manual'

export type SourceMode = 'liked' | 'playlist' | 'both'
export type TrackSourceOrigin = 'liked' | 'playlist'

export interface SpotifyImage {
  url: string
  width: number | null
  height: number | null
}

export interface SpotifyArtistSimple {
  id: string
  name: string
  external_urls?: { spotify?: string }
}

export interface SpotifyAlbumSimple {
  id: string
  name: string
  images: SpotifyImage[]
  release_date?: string
  artists?: SpotifyArtistSimple[]
}

export interface SpotifyTrackFull {
  id: string
  uri?: string
  name: string
  duration_ms: number
  explicit?: boolean
  popularity?: number
  preview_url?: string | null
  external_ids?: { isrc?: string }
  external_urls?: { spotify?: string }
  artists: SpotifyArtistSimple[]
  album: SpotifyAlbumSimple
  is_local?: boolean
  type?: string
}

export interface SpotifySavedTrackItem {
  added_at: string
  track: SpotifyTrackFull | null
}

export interface SpotifyPlaylistTrackItem {
  added_at?: string
  track: SpotifyTrackFull | null
}

export interface SpotifyPlaylistMeta {
  id: string
  name: string
  description?: string | null
  ownerName: string
  totalTracks: number
  imageUrl: string | null
  externalUrl: string | null
}

export interface SpotifyUserProfile {
  id: string
  display_name: string | null
  email?: string
  images?: SpotifyImage[]
  product?: string
}

export interface SpotifyAudioFeatures {
  id: string
  tempo: number
  key: number
  mode: number
  energy: number
  danceability: number
  valence: number
}

export interface AnalyzedTrack {
  id: string
  uri: string
  name: string
  artists: string[]
  artistNames: string
  albumName: string
  albumId: string
  albumArtUrl: string | null
  durationMs: number
  popularity: number
  externalUrl: string | null
  previewUrl: string | null
  isrc: string | null
  addedAt?: string
  bpm: number
  camelot: CamelotCode
  musicalKey: string
  pitchClass: number
  mode: 0 | 1
  energy: number
  danceability: number
  valence: number
  featureSource: AudioFeatureSource
  sources: TrackSourceOrigin[]
  genreHint?: string
  vibeTags?: string
}

export type CohesionTier = 'perfect' | 'great' | 'good' | 'moderate' | 'clash'

export interface CohesionBreakdown {
  totalScore: number
  harmonicScore: number
  bpmScore: number
  energyScore: number
  wheelDistance: number
  sameMode: boolean
  bpmDiff: number
  effectiveBpmDiff: number
  usedHalfDoubleTime: boolean
  harmonicLabel: string
  bpmLabel: string
  tier: CohesionTier
}

export interface RankedCandidate {
  track: AnalyzedTrack
  cohesion: CohesionBreakdown
}

export type AnalysisStageId =
  | 'sources'
  | 'audio_features'
  | 'fallback_lookup'
  | 'camelot_mapping'
  | 'ready'

export interface AnalysisProgress {
  stage: AnalysisStageId
  stageLabel: string
  detail: string
  tracksFetched: number
  tracksTotal: number
  tracksAnalyzed: number
  spotifyMatchedCount: number
  reccoMatchedCount: number
  estimatedCount: number
  recentLogs: string[]
  percent: number
}

export interface FeatureSourceSummary {
  spotify: number
  reccobeats: number
  estimated: number
  curated: number
  manual: number
}

export interface AnalyzedCrate {
  user: SpotifyUserProfile
  sourceMode: SourceMode
  playlistMeta: SpotifyPlaylistMeta | null
  tracks: AnalyzedTrack[]
  likedCount: number
  playlistCount: number
  isDemo: boolean
  analyzedAt: string
  featureSummary: FeatureSourceSummary
}

export interface CreatedPlaylistResult {
  id: string
  name: string
  externalUrl: string
  trackCount: number
  isPublic: boolean
  isDemo: boolean
}

export type NarrationPhase =
  | 'scan'
  | 'cluster'
  | 'recursive'
  | 'backtrack'
  | 'iterate'
  | 'complete'

export interface NarrationLogEntry {
  id: string
  step: number
  phase: NarrationPhase
  badge: string
  message: string
  detail?: string
  scoreImpact?: string
}

export type SequenceStageId =
  | 'sources'
  | 'audio_features'
  | 'camelot_mapping'
  | 'recursive_search'
  | 'iterative_refine'
  | 'ready'

export interface SequencingProgress {
  stage: SequenceStageId
  stageLabel: string
  detail: string
  tracksFetched: number
  tracksTotal: number
  tracksAnalyzed: number
  branchesExplored: number
  currentCohesion: number
  narrationLogs: NarrationLogEntry[]
  percent: number
}

export interface SequencerOptions {
  maxTracks: number | null
  preferredOpenerId?: string | null
}

export interface SequencerResult {
  orderedTracks: AnalyzedTrack[]
  unselectedTracks: AnalyzedTrack[]
  transitions: CohesionBreakdown[]
  avgCohesion: number
  minCohesion: number
  maxCohesion: number
  baselineCohesion: number
  branchesExplored: number
  backtracksCount: number
  iterativeImprovements: number
  narrationLogs: NarrationLogEntry[]
  camelotCounts: Record<CamelotCode, number>
  bpmRange: {
    min: number
    max: number
    median: number
  }
}
