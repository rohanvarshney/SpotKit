// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type {
  AnalyzedTrack,
  CamelotCode,
  CohesionBreakdown,
  CohesionTier,
  RankedCandidate,
  SpotifyTrackFull,
} from '../types/spotify'

export const ALL_CAMELOT_CODES: CamelotCode[] = [
  '1A',
  '2A',
  '3A',
  '4A',
  '5A',
  '6A',
  '7A',
  '8A',
  '9A',
  '10A',
  '11A',
  '12A',
  '1B',
  '2B',
  '3B',
  '4B',
  '5B',
  '6B',
  '7B',
  '8B',
  '9B',
  '10B',
  '11B',
  '12B',
]

interface CamelotEntry {
  camelot: CamelotCode
  musicalKey: string
  pitchClass: number
  mode: 0 | 1
}

const MAJOR_CAMELOT_MAP: Record<number, { camelot: CamelotCode; label: string }> = {
  0: { camelot: '8B', label: 'C' },
  1: { camelot: '3B', label: 'Db' },
  2: { camelot: '10B', label: 'D' },
  3: { camelot: '5B', label: 'Eb' },
  4: { camelot: '12B', label: 'E' },
  5: { camelot: '7B', label: 'F' },
  6: { camelot: '2B', label: 'F#' },
  7: { camelot: '9B', label: 'G' },
  8: { camelot: '4B', label: 'Ab' },
  9: { camelot: '11B', label: 'A' },
  10: { camelot: '6B', label: 'Bb' },
  11: { camelot: '1B', label: 'B' },
}

const MINOR_CAMELOT_MAP: Record<number, { camelot: CamelotCode; label: string }> = {
  0: { camelot: '5A', label: 'Cm' },
  1: { camelot: '12A', label: 'C#m' },
  2: { camelot: '7A', label: 'Dm' },
  3: { camelot: '2A', label: 'Ebm' },
  4: { camelot: '9A', label: 'Em' },
  5: { camelot: '4A', label: 'Fm' },
  6: { camelot: '11A', label: 'F#m' },
  7: { camelot: '6A', label: 'Gm' },
  8: { camelot: '1A', label: 'Abm' },
  9: { camelot: '8A', label: 'Am' },
  10: { camelot: '3A', label: 'Bbm' },
  11: { camelot: '10A', label: 'Bm' },
}

const CAMELOT_REVERSE_MAP: Record<CamelotCode, CamelotEntry> = Object.fromEntries([
  ...Object.entries(MAJOR_CAMELOT_MAP).map(([pitch, info]) => [
    info.camelot,
    {
      camelot: info.camelot,
      musicalKey: info.label,
      pitchClass: Number(pitch),
      mode: 1 as const,
    },
  ]),
  ...Object.entries(MINOR_CAMELOT_MAP).map(([pitch, info]) => [
    info.camelot,
    {
      camelot: info.camelot,
      musicalKey: info.label,
      pitchClass: Number(pitch),
      mode: 0 as const,
    },
  ]),
]) as Record<CamelotCode, CamelotEntry>

/**
 * Converts Spotify audio features `key` (0..11) and `mode` (0=minor, 1=major)
 * to a Camelot Wheel code (`1A`..`12B`) and human-readable musical key label.
 */
export function pitchAndModeToCamelot(
  pitchClass: number,
  mode: number,
): { camelot: CamelotCode; musicalKey: string; pitchClass: number; mode: 0 | 1 } {
  const safePitch = ((Math.round(pitchClass) % 12) + 12) % 12
  const safeMode: 0 | 1 = mode === 1 ? 1 : 0
  const lookup =
    safeMode === 1 ? MAJOR_CAMELOT_MAP[safePitch] : MINOR_CAMELOT_MAP[safePitch]
  return {
    camelot: lookup.camelot,
    musicalKey: lookup.label,
    pitchClass: safePitch,
    mode: safeMode,
  }
}

export function camelotToPitchAndMode(camelot: CamelotCode): CamelotEntry {
  return CAMELOT_REVERSE_MAP[camelot]
}

export function parseCamelotCode(code: CamelotCode): {
  num: number
  letter: 'A' | 'B'
} {
  const letter = code.endsWith('B') ? 'B' : 'A'
  const num = Number.parseInt(code.slice(0, -1), 10)
  return { num, letter }
}

function wrapCamelotNumber(n: number): number {
  return ((n - 1 + 12) % 12) + 1
}

export function getCompatibleCamelotKeys(code: CamelotCode): {
  exact: CamelotCode
  relative: CamelotCode
  fifthUp: CamelotCode
  fifthDown: CamelotCode
  energyUp: CamelotCode
  energyDown: CamelotCode
} {
  const { num, letter } = parseCamelotCode(code)
  const opposite: 'A' | 'B' = letter === 'A' ? 'B' : 'A'
  return {
    exact: code,
    relative: `${num}${opposite}` as CamelotCode,
    fifthUp: `${wrapCamelotNumber(num + 1)}${letter}` as CamelotCode,
    fifthDown: `${wrapCamelotNumber(num - 1)}${letter}` as CamelotCode,
    energyUp: `${wrapCamelotNumber(num + 2)}${letter}` as CamelotCode,
    energyDown: `${wrapCamelotNumber(num - 2)}${letter}` as CamelotCode,
  }
}

/**
 * Extracts a Spotify Playlist ID from a public URL, URI, or raw 22-char ID.
 * Supports:
 * - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
 * - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc
 * - https://open.spotify.com/user/xyz/playlist/37i9dQZF1DXcBWIGoYBM5M
 * - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 * - 37i9dQZF1DXcBWIGoYBM5M
 */
export function parsePlaylistId(rawInput: string): string | null {
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]{15,32})$/i)
  if (uriMatch) return uriMatch[1]

  const urlMatch = trimmed.match(
    /(?:open\.spotify\.com|play\.spotify\.com)\/(?:user\/[^/]+\/)?playlist\/([A-Za-z0-9]{15,32})(?:[/?#]|$)/i,
  )
  if (urlMatch) return urlMatch[1]

  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) {
    return trimmed
  }

  return null
}

function fnv1aHash(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Deterministic fallback audio feature estimator used when Spotify `/v1/audio-features`
 * is restricted (e.g. 403 in Dev Mode) and public lookup has no entry for the track.
 */
export function estimateTrackAudioFeatures(
  track: Pick<
    SpotifyTrackFull,
    'id' | 'name' | 'duration_ms' | 'popularity' | 'artists' | 'album' | 'external_ids'
  >,
): {
  bpm: number
  pitchClass: number
  mode: 0 | 1
  camelot: CamelotCode
  musicalKey: string
  energy: number
  danceability: number
  valence: number
} {
  const seedKey = `${track.external_ids?.isrc || track.id}::${track.name.toLowerCase()}::${track.artists[0]?.name.toLowerCase() || ''}`
  const h1 = fnv1aHash(seedKey)
  const h2 = fnv1aHash(`${seedKey}::key`)
  const h3 = fnv1aHash(`${seedKey}::energy`)

  const textHint = `${track.name} ${track.album?.name || ''} ${track.artists.map((a) => a.name).join(' ')}`.toLowerCase()

  // Infer realistic tempo window from common track/mix cues while keeping deterministic precision
  let minBpm = 94
  let maxBpm = 132

  if (/\b(dnb|drum & bass|drum and bass|jungle|liquid)\b/.test(textHint)) {
    minBpm = 168
    maxBpm = 176
  } else if (/\b(techno|hardstyle|trance|psy)\b/.test(textHint)) {
    minBpm = 128
    maxBpm = 142
  } else if (/\b(house|club|extended mix|remix|vip|dub|disco|garage|afro)\b/.test(textHint)) {
    minBpm = 118
    maxBpm = 129
  } else if (/\b(slowed|reverb|acoustic|ballad|ambient|interlude|lofi|chill)\b/.test(textHint)) {
    minBpm = 76
    maxBpm = 104
  } else if ((track.duration_ms || 200000) > 330000) {
    // Longer electronic/club cuts typically sit in 118-128 BPM DJ pockets
    minBpm = 116
    maxBpm = 128
  }

  const bpm = minBpm + (h1 % (maxBpm - minBpm + 1))
  const pitchClass = h2 % 12
  const mode: 0 | 1 =
    /\b(sad|dark|night|midnight|shadow|minor|techno|trap)\b/.test(textHint)
      ? 0
      : /\b(sun|summer|happy|golden|bright|major|disco)\b/.test(textHint)
        ? 1
        : (h2 >> 4) % 2 === 1
          ? 1
          : 0

  const { camelot, musicalKey } = pitchAndModeToCamelot(pitchClass, mode)

  const popFactor = Math.min(1, Math.max(0, (track.popularity ?? 50) / 100))
  const rawEnergy = 0.42 + ((h3 % 48) / 100) + popFactor * 0.08
  const energy = Number(Math.min(0.96, Math.max(0.2, rawEnergy)).toFixed(2))
  const danceability = Number(
    Math.min(0.95, Math.max(0.32, 0.48 + (((h3 >> 6) % 40) / 100))).toFixed(2),
  )
  const valence = Number(
    Math.min(0.94, Math.max(0.15, (mode === 1 ? 0.45 : 0.25) + (((h3 >> 12) % 45) / 100))).toFixed(2),
  )

  return {
    bpm,
    pitchClass,
    mode,
    camelot,
    musicalKey,
    energy,
    danceability,
    valence,
  }
}

/**
 * Computes the DJ transition Cohesion Score (0–100) between `fromTrack` (current anchor)
 * and `toTrack` (candidate next track), combining Camelot Wheel harmonic compatibility (0–50),
 * BPM proximity including half/double-time lock (0–40), and energy continuity (0–10).
 */
export function computeCohesionScore(
  fromTrack: AnalyzedTrack,
  toTrack: AnalyzedTrack,
): CohesionBreakdown {
  const fromCam = parseCamelotCode(fromTrack.camelot)
  const toCam = parseCamelotCode(toTrack.camelot)

  const rawWheelDiff = Math.abs(fromCam.num - toCam.num)
  const wheelDistance = Math.min(rawWheelDiff, 12 - rawWheelDiff)
  const sameMode = fromCam.letter === toCam.letter

  // 1. Harmonic Camelot Score (0–50)
  let harmonicScore: number
  let harmonicLabel: string

  if (wheelDistance === 0 && sameMode) {
    harmonicScore = 50
    harmonicLabel = `Exact Key Lock (${toTrack.camelot})`
  } else if (wheelDistance === 0 && !sameMode) {
    harmonicScore = 46
    harmonicLabel = `Relative Major/Minor (${fromTrack.camelot} → ${toTrack.camelot})`
  } else if (wheelDistance === 1 && sameMode) {
    harmonicScore = 44
    harmonicLabel = `Harmonic ±1 Fifth (${fromTrack.camelot} → ${toTrack.camelot})`
  } else if (wheelDistance === 1 && !sameMode) {
    harmonicScore = 34
    harmonicLabel = `Diagonal Step (${fromTrack.camelot} → ${toTrack.camelot})`
  } else if (wheelDistance === 2 && sameMode) {
    harmonicScore = 28
    harmonicLabel = `Energy Shift ±2 (${fromTrack.camelot} → ${toTrack.camelot})`
  } else if (wheelDistance === 5 && sameMode) {
    // +7 semitone harmonic boost (7 steps on semitone circle = +1/5 fifth depending on direction; wheel +5 is energy boost)
    harmonicScore = 22
    harmonicLabel = `Modal Lift (${fromTrack.camelot} → ${toTrack.camelot})`
  } else {
    harmonicScore = Math.max(4, 28 - wheelDistance * 4 - (sameMode ? 0 : 4))
    harmonicLabel = `Key Jump (${fromTrack.camelot} → ${toTrack.camelot})`
  }

  // 2. BPM Proximity Score (0–40)
  const bpmDiff = Math.round(toTrack.bpm - fromTrack.bpm)
  const absDiff = Math.abs(fromTrack.bpm - toTrack.bpm)
  const halfTimeDiff = Math.abs(fromTrack.bpm - toTrack.bpm * 2)
  const doubleTimeDiff = Math.abs(fromTrack.bpm * 2 - toTrack.bpm)

  let effectiveBpmDiff = absDiff
  let usedHalfDoubleTime = false

  if (halfTimeDiff < absDiff && halfTimeDiff <= 6) {
    effectiveBpmDiff = halfTimeDiff
    usedHalfDoubleTime = true
  } else if (doubleTimeDiff < absDiff && doubleTimeDiff <= 6) {
    effectiveBpmDiff = doubleTimeDiff
    usedHalfDoubleTime = true
  }

  let bpmScore: number
  if (effectiveBpmDiff <= 0.5) {
    bpmScore = usedHalfDoubleTime ? 38 : 40
  } else if (effectiveBpmDiff <= 1.5) {
    bpmScore = usedHalfDoubleTime ? 36 : 39
  } else if (effectiveBpmDiff <= 3) {
    bpmScore = usedHalfDoubleTime ? 33 : 36
  } else {
    const penalty = usedHalfDoubleTime ? 4 : 0
    bpmScore = Math.max(0, Math.round(40 - effectiveBpmDiff * 2.1 - penalty))
  }

  let bpmLabel: string
  if (absDiff === 0) {
    bpmLabel = 'Exact BPM Lock'
  } else if (usedHalfDoubleTime) {
    bpmLabel = `Half/Double-Time (${bpmDiff > 0 ? '+' : ''}${bpmDiff} BPM)`
  } else {
    bpmLabel = `${bpmDiff > 0 ? '+' : ''}${bpmDiff} BPM`
  }

  // 3. Energy Flow Score (0–10)
  const energyDiff = Math.abs(fromTrack.energy - toTrack.energy)
  const energyScore =
    energyDiff <= 0.12
      ? 10
      : energyDiff <= 0.24
        ? 8
        : Math.max(1, Math.round(10 - energyDiff * 16))

  const totalScore = Math.min(
    100,
    Math.max(0, harmonicScore + bpmScore + energyScore),
  )

  let tier: CohesionTier
  if (totalScore >= 88) {
    tier = 'perfect'
  } else if (totalScore >= 74) {
    tier = 'great'
  } else if (totalScore >= 58) {
    tier = 'good'
  } else if (totalScore >= 40) {
    tier = 'moderate'
  } else {
    tier = 'clash'
  }

  return {
    totalScore,
    harmonicScore,
    bpmScore,
    energyScore,
    wheelDistance,
    sameMode,
    bpmDiff,
    effectiveBpmDiff: Math.round(effectiveBpmDiff),
    usedHalfDoubleTime,
    harmonicLabel,
    bpmLabel,
    tier,
  }
}

/**
 * Re-sorts all remaining tracks by Cohesion Score descending relative to the newest selected anchor track.
 */
export function rankRemainingTracksByCohesion(
  anchorTrack: AnalyzedTrack,
  remainingTracks: AnalyzedTrack[],
): RankedCandidate[] {
  return remainingTracks
    .map((track) => ({
      track,
      cohesion: computeCohesionScore(anchorTrack, track),
    }))
    .sort((a, b) => {
      if (b.cohesion.totalScore !== a.cohesion.totalScore) {
        return b.cohesion.totalScore - a.cohesion.totalScore
      }
      if (a.cohesion.effectiveBpmDiff !== b.cohesion.effectiveBpmDiff) {
        return a.cohesion.effectiveBpmDiff - b.cohesion.effectiveBpmDiff
      }
      if (a.cohesion.wheelDistance !== b.cohesion.wheelDistance) {
        return a.cohesion.wheelDistance - b.cohesion.wheelDistance
      }
      return b.track.popularity - a.track.popularity
    })
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
