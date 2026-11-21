// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  SPOTKIT_DEMO_ALBUMS,
  SPOTKIT_DEMO_CATALOG_VERSION,
  SPOTKIT_DEMO_CRATE_TRACKS,
  SPOTKIT_DEMO_LIKED_TRACK_COUNT,
  SPOTKIT_DEMO_PLAYLIST_PRESETS,
  buildSharedDemoCrate,
  buildSharedDemoTracksForMode,
  createCoverSvg,
  type SharedDemoPlaylistPreset,
} from '../../../shared/spotkitDemoCatalog'
import { camelotToPitchAndMode, parsePlaylistId } from '../lib/camelotEngine'
import type { AnalyzedCrate, AnalyzedTrack, SourceMode } from '../types/spotify'

export type DemoPlaylistPreset = SharedDemoPlaylistPreset

export {
  SPOTKIT_DEMO_ALBUMS,
  SPOTKIT_DEMO_CATALOG_VERSION,
  SPOTKIT_DEMO_CRATE_TRACKS,
  createCoverSvg,
}

export const DEMO_PLAYLIST_PRESETS: DemoPlaylistPreset[] =
  SPOTKIT_DEMO_PLAYLIST_PRESETS

export const DEMO_SAMPLE_PLAYLIST_URL = DEMO_PLAYLIST_PRESETS[0].url
export const DEMO_LIKED_TRACK_COUNT = SPOTKIT_DEMO_LIKED_TRACK_COUNT

const CRATE_DEPS = {
  parsePlaylistId,
  camelotToPitchAndMode,
}

export function buildDemoTracksForMode(
  sourceMode: SourceMode,
  playlistUrl?: string,
): AnalyzedTrack[] {
  return buildSharedDemoTracksForMode(CRATE_DEPS, sourceMode, playlistUrl)
}

export function buildDemoCrate(
  sourceMode: SourceMode,
  playlistUrl?: string,
): AnalyzedCrate {
  return buildSharedDemoCrate(CRATE_DEPS, sourceMode, playlistUrl)
}
