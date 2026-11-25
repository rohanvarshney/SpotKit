// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type {
  AnalysisProgress,
  AnalyzedCrate,
  AnalyzedTrack,
  AudioFeatureSource,
  CreatedPlaylistResult,
  SourceMode,
  SpotifyAudioFeatures,
  SpotifyPlaylistMeta,
  SpotifyPlaylistTrackItem,
  SpotifySavedTrackItem,
  SpotifyTrackFull,
  SpotifyUserProfile,
  TrackSourceOrigin,
} from '../types/spotify'
import {
  estimateTrackAudioFeatures,
  parsePlaylistId,
  pitchAndModeToCamelot,
} from './camelotEngine'

const API_BASE = 'https://api.spotify.com/v1'
const RECCOBEATS_BASE = 'https://api.reccobeats.com/v1/audio-features'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  next: string | null
}

interface RawPlaylistItemWrapper {
  added_at?: string
  track?: SpotifyTrackFull | null
  item?: SpotifyTrackFull | null
}

interface RawPlaylistResponse {
  id: string
  name: string
  description?: string | null
  owner?: { display_name?: string | null; id?: string }
  images?: Array<{ url: string }>
  external_urls?: { spotify?: string }
  tracks?: PaginatedResponse<RawPlaylistItemWrapper>
  items?: PaginatedResponse<RawPlaylistItemWrapper>
}

export class InsufficientScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InsufficientScopeError'
  }
}

async function spotifyFetch<T>(
  endpointOrUrl: string,
  accessToken: string,
  options?: {
    method?: string
    body?: unknown
    retries?: number
  },
): Promise<T> {
  const retries = options?.retries ?? 3
  const url = endpointOrUrl.startsWith('http')
    ? endpointOrUrl
    : `${API_BASE}${endpointOrUrl}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  }
  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 429 && retries > 0) {
    const retryAfterSec = Number(response.headers.get('Retry-After') || '2')
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, retryAfterSec) * 1000),
    )
    return spotifyFetch<T>(endpointOrUrl, accessToken, {
      ...options,
      retries: retries - 1,
    })
  }

  if (!response.ok) {
    const text = await response.text()
    if (
      response.status === 403 &&
      /insufficient client scope/i.test(text)
    ) {
      throw new InsufficientScopeError(
        `Spotify API error (403): Insufficient client scope. ${text}`,
      )
    }
    throw new Error(`Spotify API error (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

interface RawTrackSeed {
  track: SpotifyTrackFull
  addedAt?: string
  sources: Set<TrackSourceOrigin>
}

function unwrapPlaylistTrack(
  wrapper: RawPlaylistItemWrapper | SpotifyPlaylistTrackItem,
): SpotifyTrackFull | null {
  const maybe =
    ('item' in wrapper ? wrapper.item : undefined) ?? wrapper.track ?? null
  if (!maybe || !maybe.id || maybe.is_local) return null
  if (maybe.type && maybe.type !== 'track') return null
  return maybe
}

async function fetchLikedTracks(
  accessToken: string,
  onProgress: (fetched: number, total: number, sampleTitle?: string) => void,
): Promise<SpotifySavedTrackItem[]> {
  const saved: SpotifySavedTrackItem[] = []
  let nextUrl: string | null = '/me/tracks?limit=50&offset=0'
  let total = 0

  while (nextUrl) {
    const page: PaginatedResponse<SpotifySavedTrackItem> = await spotifyFetch(
      nextUrl,
      accessToken,
    )
    total = page.total || saved.length + page.items.length
    for (const item of page.items) {
      if (item?.track && item.track.id && !item.track.is_local) {
        saved.push(item)
      }
    }
    const sample = page.items[0]?.track
    onProgress(
      saved.length,
      total,
      sample
        ? `${sample.name} — ${sample.artists[0]?.name ?? 'Unknown'}`
        : undefined,
    )
    nextUrl = page.next
  }

  return saved
}

async function fetchPlaylistTracks(
  playlistId: string,
  accessToken: string,
  onProgress: (fetched: number, total: number, sampleTitle?: string) => void,
): Promise<{
  meta: SpotifyPlaylistMeta
  items: Array<{ track: SpotifyTrackFull; addedAt?: string }>
}> {
  let playlist: RawPlaylistResponse
  try {
    playlist = await spotifyFetch<RawPlaylistResponse>(
      `/playlists/${playlistId}`,
      accessToken,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('(404)')) {
      throw new Error(
        'Could not load that playlist (404). Make sure the URL is a valid public user playlist (Spotify editorial playlists starting with "37i9..." are often blocked by Spotify in Dev Mode).',
      )
    }
    if (msg.includes('(403)')) {
      throw new Error(
        'Access denied (403) when reading this playlist. Confirm the playlist is public or owned by your account.',
      )
    }
    throw err
  }

  const initialContainer = playlist.items ?? playlist.tracks
  const total = initialContainer?.total ?? 0
  const meta: SpotifyPlaylistMeta = {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    ownerName: playlist.owner?.display_name || playlist.owner?.id || 'Spotify User',
    totalTracks: total,
    imageUrl: playlist.images?.[0]?.url ?? null,
    externalUrl: playlist.external_urls?.spotify ?? null,
  }

  const collected: Array<{ track: SpotifyTrackFull; addedAt?: string }> = []
  const appendWrappers = (wrappers: RawPlaylistItemWrapper[] | undefined) => {
    if (!wrappers) return
    for (const w of wrappers) {
      const trk = unwrapPlaylistTrack(w)
      if (trk) {
        collected.push({ track: trk, addedAt: w.added_at })
      }
    }
  }

  appendWrappers(initialContainer?.items)
  onProgress(
    collected.length,
    total || collected.length,
    collected[0]?.track
      ? `${collected[0].track.name} — ${collected[0].track.artists[0]?.name ?? 'Unknown'}`
      : undefined,
  )

  let nextUrl: string | null = initialContainer?.next ?? null
  if (!nextUrl && total > collected.length) {
    nextUrl = `/playlists/${playlistId}/items?limit=100&offset=${collected.length}`
  }

  while (nextUrl) {
    let page: PaginatedResponse<RawPlaylistItemWrapper>
    try {
      page = await spotifyFetch<PaginatedResponse<RawPlaylistItemWrapper>>(
        nextUrl,
        accessToken,
      )
    } catch {
      if (nextUrl.includes('/items')) {
        const legacyUrl = nextUrl.replace('/items', '/tracks')
        page = await spotifyFetch<PaginatedResponse<RawPlaylistItemWrapper>>(
          legacyUrl,
          accessToken,
        )
      } else {
        break
      }
    }

    appendWrappers(page.items)
    const sample = page.items?.[0] ? unwrapPlaylistTrack(page.items[0]) : null
    onProgress(
      collected.length,
      page.total || total || collected.length,
      sample
        ? `${sample.name} — ${sample.artists[0]?.name ?? 'Unknown'}`
        : undefined,
    )
    nextUrl = page.next
  }

  return { meta, items: collected }
}

interface ReccoBeatsFeatureItem {
  id?: string
  href?: string
  isrc?: string
  tempo?: number
  key?: number
  mode?: number
  energy?: number
  danceability?: number
  valence?: number
}

async function fetchReccoBeatsFeaturesBatch(
  tracks: SpotifyTrackFull[],
): Promise<Map<string, SpotifyAudioFeatures>> {
  const result = new Map<string, SpotifyAudioFeatures>()
  if (tracks.length === 0) return result

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 3800)

  try {
    const idsParam = tracks.map((t) => encodeURIComponent(t.id)).join(',')
    const resp = await fetch(`${RECCOBEATS_BASE}?ids=${idsParam}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!resp.ok) return result

    const payload = (await resp.json()) as
      | ReccoBeatsFeatureItem[]
      | {
          content?: ReccoBeatsFeatureItem[]
          audio_features?: ReccoBeatsFeatureItem[]
        }

    const list = Array.isArray(payload)
      ? payload
      : payload.content ?? payload.audio_features ?? []

    const idLookup = new Set(tracks.map((t) => t.id))
    const isrcToId = new Map<string, string>()
    for (const t of tracks) {
      if (t.external_ids?.isrc) {
        isrcToId.set(t.external_ids.isrc.toUpperCase(), t.id)
      }
    }

    for (const item of list) {
      if (
        !item ||
        typeof item.tempo !== 'number' ||
        item.tempo <= 0 ||
        typeof item.key !== 'number'
      ) {
        continue
      }

      let matchedSpotifyId: string | undefined
      if (item.id && idLookup.has(item.id)) {
        matchedSpotifyId = item.id
      } else if (item.href) {
        const m = item.href.match(/track\/([A-Za-z0-9]+)/)
        if (m && idLookup.has(m[1])) {
          matchedSpotifyId = m[1]
        }
      }
      if (!matchedSpotifyId && item.isrc) {
        matchedSpotifyId = isrcToId.get(item.isrc.toUpperCase())
      }

      if (matchedSpotifyId) {
        result.set(matchedSpotifyId, {
          id: matchedSpotifyId,
          tempo: item.tempo,
          key: item.key,
          mode: typeof item.mode === 'number' ? item.mode : 0,
          energy: typeof item.energy === 'number' ? item.energy : 0.65,
          danceability:
            typeof item.danceability === 'number' ? item.danceability : 0.65,
          valence: typeof item.valence === 'number' ? item.valence : 0.5,
        })
      }
    }
  } catch {
    // ReccoBeats lookup timed out or blocked; deterministic fallback handles remaining tracks
  } finally {
    window.clearTimeout(timeoutId)
  }

  return result
}

export async function fetchAndAnalyzeCrate(options: {
  accessToken: string
  sourceMode: SourceMode
  playlistUrl?: string
  onProgress: (progress: AnalysisProgress) => void
}): Promise<AnalyzedCrate> {
  const { accessToken, sourceMode, playlistUrl, onProgress } = options
  const recentLogs: string[] = []
  const pushLog = (entry: string) => {
    recentLogs.unshift(entry)
    if (recentLogs.length > 7) recentLogs.pop()
  }

  onProgress({
    stage: 'sources',
    stageLabel: 'Loading Your Selected Playlist / Crate',
    detail: 'Connecting to Spotify profile & preparing track import…',
    tracksFetched: 0,
    tracksTotal: 0,
    tracksAnalyzed: 0,
    spotifyMatchedCount: 0,
    reccoMatchedCount: 0,
    estimatedCount: 0,
    recentLogs: [...recentLogs],
    percent: 4,
  })

  const user = await spotifyFetch<SpotifyUserProfile>('/me', accessToken)
  pushLog(`Authenticated as ${user.display_name || user.id}`)

  const trackSeeds = new Map<string, RawTrackSeed>()
  let likedCount = 0
  let playlistCount = 0
  let playlistMeta: SpotifyPlaylistMeta | null = null

  if (sourceMode === 'liked' || sourceMode === 'both') {
    const savedItems = await fetchLikedTracks(
      accessToken,
      (fetched, total, sampleTitle) => {
        if (sampleTitle) pushLog(`Liked: ${sampleTitle}`)
        const ratio = total > 0 ? Math.min(1, fetched / total) : 0.5
        onProgress({
          stage: 'sources',
          stageLabel: 'Importing Your Liked Songs',
          detail: `Loaded ${fetched.toLocaleString()} of ${total.toLocaleString()} Liked Songs…`,
          tracksFetched: fetched,
          tracksTotal: total,
          tracksAnalyzed: 0,
          spotifyMatchedCount: 0,
          reccoMatchedCount: 0,
          estimatedCount: 0,
          recentLogs: [...recentLogs],
          percent: Math.round(6 + ratio * (sourceMode === 'both' ? 16 : 30)),
        })
      },
    )
    likedCount = savedItems.length
    for (const item of savedItems) {
      if (!item.track?.id) continue
      const existing = trackSeeds.get(item.track.id)
      if (existing) {
        existing.sources.add('liked')
      } else {
        trackSeeds.set(item.track.id, {
          track: item.track,
          addedAt: item.added_at,
          sources: new Set(['liked']),
        })
      }
    }
  }

  if (sourceMode === 'playlist' || sourceMode === 'both') {
    const parsedId = parsePlaylistId(playlistUrl || '')
    if (!parsedId) {
      throw new Error('Please enter a valid public Spotify playlist URL or URI.')
    }
    const { meta, items } = await fetchPlaylistTracks(
      parsedId,
      accessToken,
      (fetched, total, sampleTitle) => {
        if (sampleTitle) pushLog(`Playlist: ${sampleTitle}`)
        const ratio = total > 0 ? Math.min(1, fetched / total) : 0.5
        const basePct = sourceMode === 'both' ? 22 : 6
        const spanPct = sourceMode === 'both' ? 14 : 30
        onProgress({
          stage: 'sources',
          stageLabel: 'Importing Public Playlist',
          detail: `Loaded ${fetched.toLocaleString()} of ${total.toLocaleString()} tracks from playlist…`,
          tracksFetched: likedCount + fetched,
          tracksTotal: likedCount + total,
          tracksAnalyzed: 0,
          spotifyMatchedCount: 0,
          reccoMatchedCount: 0,
          estimatedCount: 0,
          recentLogs: [...recentLogs],
          percent: Math.round(basePct + ratio * spanPct),
        })
      },
    )
    playlistMeta = meta
    playlistCount = items.length
    pushLog(`Playlist loaded: "${meta.name}" (${items.length} tracks)`)

    for (const item of items) {
      const existing = trackSeeds.get(item.track.id)
      if (existing) {
        existing.sources.add('playlist')
      } else {
        trackSeeds.set(item.track.id, {
          track: item.track,
          addedAt: item.addedAt,
          sources: new Set(['playlist']),
        })
      }
    }
  }

  const allSeeds = Array.from(trackSeeds.values())
  if (allSeeds.length === 0) {
    throw new Error(
      'No playable Spotify tracks were found in the selected source.',
    )
  }

  const totalTracks = allSeeds.length
  const featureMap = new Map<
    string,
    { feat: SpotifyAudioFeatures; source: AudioFeatureSource }
  >()
  let spotifyMatchedCount = 0
  let reccoMatchedCount = 0
  let estimatedCount = 0

  let spotifyAudioFeaturesBlocked = false
  for (let i = 0; i < allSeeds.length; i += 100) {
    if (spotifyAudioFeaturesBlocked) break
    const batch = allSeeds.slice(i, i + 100)
    const ids = batch.map((s) => s.track.id).join(',')

    onProgress({
      stage: 'audio_features',
      stageLabel: 'Track-by-Track Spotify Audio Scan',
      detail: `Inspecting BPM, pitch class & energy for tracks ${i + 1}–${Math.min(totalTracks, i + batch.length)} of ${totalTracks}…`,
      tracksFetched: totalTracks,
      tracksTotal: totalTracks,
      tracksAnalyzed: featureMap.size,
      spotifyMatchedCount,
      reccoMatchedCount,
      estimatedCount,
      recentLogs: [...recentLogs],
      percent: Math.round(38 + ((i + batch.length) / totalTracks) * 16),
    })

    try {
      const res = await spotifyFetch<{
        audio_features: Array<SpotifyAudioFeatures | null>
      }>(`/audio-features?ids=${ids}`, accessToken, { retries: 1 })
      for (const item of res.audio_features || []) {
        if (item && item.id && typeof item.tempo === 'number' && item.tempo > 0) {
          featureMap.set(item.id, { feat: item, source: 'spotify' })
          spotifyMatchedCount += 1
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('(403)') || msg.includes('(401)') || msg.includes('(404)')) {
        spotifyAudioFeaturesBlocked = true
        pushLog(
          'Spotify /audio-features restricted in Dev Mode — switching to ReccoBeats lookup & harmonic estimator',
        )
      }
    }
  }

  const missingSeeds = allSeeds.filter((s) => !featureMap.has(s.track.id))
  if (missingSeeds.length > 0) {
    const maxExternalLookup = 350
    const lookupBatchTarget = missingSeeds.slice(0, maxExternalLookup)

    for (let i = 0; i < lookupBatchTarget.length; i += 35) {
      const batch = lookupBatchTarget.slice(i, i + 35)
      const reccoMap = await fetchReccoBeatsFeaturesBatch(
        batch.map((b) => b.track),
      )

      for (const [trackId, feat] of reccoMap.entries()) {
        featureMap.set(trackId, { feat, source: 'reccobeats' })
        reccoMatchedCount += 1
      }

      const sampleSeed = batch[0]
      if (sampleSeed && featureMap.has(sampleSeed.track.id)) {
        const f = featureMap.get(sampleSeed.track.id)!.feat
        const cam = pitchAndModeToCamelot(f.key, f.mode)
        pushLog(
          `Matched: "${sampleSeed.track.name}" → ${cam.camelot} (${cam.musicalKey}) • ${Math.round(f.tempo)} BPM`,
        )
      }

      onProgress({
        stage: 'fallback_lookup',
        stageLabel: 'Track-by-Track Harmonic & BPM Resolution',
        detail: `Cross-referencing metadata for ${Math.min(lookupBatchTarget.length, i + batch.length)} of ${lookupBatchTarget.length} remaining tracks…`,
        tracksFetched: totalTracks,
        tracksTotal: totalTracks,
        tracksAnalyzed: featureMap.size,
        spotifyMatchedCount,
        reccoMatchedCount,
        estimatedCount,
        recentLogs: [...recentLogs],
        percent: Math.round(
          54 + ((i + batch.length) / lookupBatchTarget.length) * 18,
        ),
      })
    }
  }

  onProgress({
    stage: 'camelot_mapping',
    stageLabel: 'Mapping Song Keys Across Playlist',
    detail: `Resolving song keys & BPM profiles across ${totalTracks.toLocaleString()} tracks…`,
    tracksFetched: totalTracks,
    tracksTotal: totalTracks,
    tracksAnalyzed: featureMap.size,
    spotifyMatchedCount,
    reccoMatchedCount,
    estimatedCount,
    recentLogs: [...recentLogs],
    percent: 76,
  })

  const analyzedTracks: AnalyzedTrack[] = []
  for (let idx = 0; idx < allSeeds.length; idx += 1) {
    const seed = allSeeds[idx]
    const raw = seed.track
    const resolved = featureMap.get(raw.id)

    let bpm: number
    let pitchClass: number
    let mode: 0 | 1
    let camelot: AnalyzedTrack['camelot']
    let musicalKey: string
    let energy: number
    let danceability: number
    let valence: number
    let featureSource: AudioFeatureSource

    if (resolved) {
      const f = resolved.feat
      const cam = pitchAndModeToCamelot(f.key < 0 ? 0 : f.key, f.mode)
      bpm = Math.round(f.tempo)
      pitchClass = cam.pitchClass
      mode = cam.mode
      camelot = cam.camelot
      musicalKey = cam.musicalKey
      energy = Number(Math.min(1, Math.max(0, f.energy)).toFixed(2))
      danceability = Number(
        Math.min(1, Math.max(0, f.danceability)).toFixed(2),
      )
      valence = Number(Math.min(1, Math.max(0, f.valence)).toFixed(2))
      featureSource = resolved.source
    } else {
      const est = estimateTrackAudioFeatures(raw)
      bpm = est.bpm
      pitchClass = est.pitchClass
      mode = est.mode
      camelot = est.camelot
      musicalKey = est.musicalKey
      energy = est.energy
      danceability = est.danceability
      valence = est.valence
      featureSource = 'estimated'
      estimatedCount += 1
    }

    if (idx < 4 || idx === allSeeds.length - 1) {
      pushLog(`Analyzed: "${raw.name}" → ${camelot} (${musicalKey}) • ${bpm} BPM`)
    }

    analyzedTracks.push({
      id: raw.id,
      uri: raw.uri || `spotify:track:${raw.id}`,
      name: raw.name,
      artists: raw.artists.map((a) => a.name),
      artistNames: raw.artists.map((a) => a.name).join(', ') || 'Unknown Artist',
      albumName: raw.album?.name || 'Unknown Album',
      albumId: raw.album?.id || '',
      albumArtUrl: raw.album?.images?.[0]?.url ?? null,
      durationMs: raw.duration_ms || 0,
      popularity: raw.popularity ?? 50,
      externalUrl: raw.external_urls?.spotify ?? null,
      previewUrl: raw.preview_url ?? null,
      isrc: raw.external_ids?.isrc ?? null,
      addedAt: seed.addedAt,
      bpm,
      camelot,
      musicalKey,
      pitchClass,
      mode,
      energy,
      danceability,
      valence,
      featureSource,
      sources: Array.from(seed.sources),
    })
  }

  onProgress({
    stage: 'ready',
    stageLabel: 'Song Key & BPM Map Complete',
    detail: `Mapped ${analyzedTracks.length.toLocaleString()} tracks — launching recursive sequencer…`,
    tracksFetched: totalTracks,
    tracksTotal: totalTracks,
    tracksAnalyzed: analyzedTracks.length,
    spotifyMatchedCount,
    reccoMatchedCount,
    estimatedCount,
    recentLogs: [...recentLogs],
    percent: 82,
  })

  return {
    user,
    sourceMode,
    playlistMeta,
    tracks: analyzedTracks,
    likedCount,
    playlistCount,
    isDemo: false,
    analyzedAt: new Date().toISOString(),
    featureSummary: {
      spotify: spotifyMatchedCount,
      reccobeats: reccoMatchedCount,
      estimated: estimatedCount,
      curated: 0,
      manual: 0,
    },
  }
}

export async function createSpotifyPlaylistFromSet(options: {
  accessToken: string
  name: string
  description: string
  isPublic: boolean
  tracks: AnalyzedTrack[]
}): Promise<CreatedPlaylistResult> {
  const { accessToken, name, description, isPublic, tracks } = options
  if (tracks.length === 0) {
    throw new Error('Cannot create an empty playlist.')
  }

  const created = await spotifyFetch<{
    id: string
    name: string
    external_urls?: { spotify?: string }
  }>('/me/playlists', accessToken, {
    method: 'POST',
    body: {
      name: name.trim() || 'DJMyPlaylist Mix',
      description: description.trim(),
      public: isPublic,
    },
  })

  const uris = tracks.map((t) => t.uri || `spotify:track:${t.id}`)

  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100)
    try {
      await spotifyFetch(`/playlists/${created.id}/items`, accessToken, {
        method: 'POST',
        body: { uris: chunk },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('(404)') || msg.includes('(405)')) {
        await spotifyFetch(`/playlists/${created.id}/tracks`, accessToken, {
          method: 'POST',
          body: { uris: chunk },
        })
      } else {
        throw err
      }
    }
  }

  return {
    id: created.id,
    name: created.name,
    externalUrl:
      created.external_urls?.spotify ||
      `https://open.spotify.com/playlist/${created.id}`,
    trackCount: tracks.length,
    isPublic,
    isDemo: false,
  }
}
