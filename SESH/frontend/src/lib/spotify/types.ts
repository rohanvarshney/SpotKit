// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

export type SpotifyReason =
  | 'trackdone'
  | 'fwdbtn'
  | 'backbtn'
  | 'clickrow'
  | 'appload'
  | 'unknown'
  | string

export type SpotifyExtendedStreamingRow = {
  ts: string
  platform?: string | null
  ms_played: number
  conn_country?: string | null

  master_metadata_track_name?: string | null
  master_metadata_album_artist_name?: string | null
  master_metadata_album_album_name?: string | null
  spotify_track_uri?: string | null

  episode_name?: string | null
  episode_show_name?: string | null
  spotify_episode_uri?: string | null

  audiobook_title?: string | null
  audiobook_uri?: string | null
  audiobook_chapter_uri?: string | null
  audiobook_chapter_title?: string | null

  reason_start?: SpotifyReason | null
  reason_end?: SpotifyReason | null
  shuffle?: boolean | null
  skipped?: boolean | null
  offline?: boolean | null
  offline_timestamp?: number | null
  incognito_mode?: boolean | null
}

export type MusicStream = {
  tsMs: number
  msPlayed: number

  trackUri: string | null
  trackName: string
  albumArtistName: string
  albumName: string

  skipped: boolean
}

export type TopEntity = {
  key: string
  label: string
  msPlayed: number
  playCount: number
  skipCount: number
  firstTsMs: number
  lastTsMs: number
}

export type TimeWindowKey = 'last_1_month' | 'last_1_year' | 'last_5_years' | 'all_time'

export type WindowedTopLists = Record<
  TimeWindowKey,
  {
    songs: TopEntity[]
    albums: TopEntity[]
    artists: TopEntity[]
  }
>

export type YearlyTopLists = Record<
  string,
  {
    songs: TopEntity[]
    albums: TopEntity[]
    artists: TopEntity[]
  }
>

export type SummaryResult = {
  generatedAtTsMs: number
  minTsMs: number | null
  maxTsMs: number | null

  totalMusicMsPlayed: number
  totalMusicPlays: number

  windows: WindowedTopLists
  yearly: YearlyTopLists
}

export type ProcessorProgressStage = 'unzip' | 'parse' | 'aggregate' | 'done'

export type ProcessorProgress =
  | {
      stage: Exclude<ProcessorProgressStage, 'done'>
      message: string
      processedFiles?: number
      totalFiles?: number
    }
  | { stage: 'done'; message: string }

export type WorkerRequest =
  | {
      type: 'processZip'
      zipFile: File
      topN: number
    }

export type WorkerResponse =
  | { type: 'progress'; progress: ProcessorProgress }
  | { type: 'result'; summary: SummaryResult }
  | { type: 'error'; error: string }
