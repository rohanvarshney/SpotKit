// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  camelotToPitchAndMode,
  parsePlaylistId,
} from '../lib/camelotEngine'
import type {
  AnalyzedCrate,
  AnalyzedTrack,
  CamelotCode,
  SourceMode,
  SpotifyPlaylistMeta,
  TrackSourceOrigin,
} from '../types/spotify'

export interface DemoPlaylistPreset {
  id: string
  name: string
  shortLabel: string
  description: string
  ownerName: string
  url: string
  accent: string
}

export const DEMO_PLAYLIST_PRESETS: DemoPlaylistPreset[] = [
  {
    id: '4rnleEAOdmFAbRcNCgZMpY',
    name: 'Afterhours & Rooftop Club',
    shortLabel: '🎛️ Afterhours & Rooftop',
    description: 'Deep melodic house, club tech, and warm late-night transitions.',
    ownerName: 'SpotKit Crate Curator',
    url: 'https://open.spotify.com/playlist/4rnleEAOdmFAbRcNCgZMpY?si=spotkit-demo',
    accent: '#38bdf8',
  },
  {
    id: '37i9dQZF1DX2aneNMeG90Y',
    name: 'Sunset Nu-Disco & Indie Groove',
    shortLabel: '🌅 Sunset Nu-Disco',
    description: 'Funky basslines, indie dance, and golden-hour rooftop grooves.',
    ownerName: 'SpotKit Rooftop Sessions',
    url: 'https://open.spotify.com/playlist/37i9dQZF1DX2aneNMeG90Y?si=spotkit-demo',
    accent: '#f59e0b',
  },
  {
    id: '5Rrf7mqN8uus2AaQQQNdc1',
    name: 'Warehouse Peak & UK Bass',
    shortLabel: '⚡ Warehouse & UK Bass',
    description: 'High-energy UK garage, melodic techno, halftime, and 174 BPM DnB.',
    ownerName: 'SpotKit Warehouse',
    url: 'https://open.spotify.com/playlist/5Rrf7mqN8uus2AaQQQNdc1?si=spotkit-demo',
    accent: '#a855f7',
  },
]

export const DEMO_SAMPLE_PLAYLIST_URL = DEMO_PLAYLIST_PRESETS[0].url

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generates a 400x400 vinyl-record SVG cover matching SpotKit's demo cover art style.
 */
export function createCoverSvg(
  title: string,
  artist: string,
  colorA: string,
  colorB: string,
  accent: string,
): string {
  const safeTitle = escapeXml(
    title.length > 22 ? `${title.slice(0, 20)}…` : title,
  )
  const safeArtist = escapeXml(artist.toUpperCase())
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${colorA}" />
        <stop offset="100%" stop-color="${colorB}" />
      </linearGradient>
      <radialGradient id="glow" cx="75%" cy="25%" r="60%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${colorB}" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="400" height="400" fill="url(#bg)" />
    <rect width="400" height="400" fill="url(#glow)" />
    <circle cx="200" cy="175" r="112" fill="rgba(10,10,16,0.55)" stroke="rgba(255,255,255,0.22)" stroke-width="2" />
    <circle cx="200" cy="175" r="82" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-dasharray="6 4" />
    <circle cx="200" cy="175" r="54" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
    <circle cx="200" cy="175" r="28" fill="${accent}" opacity="0.9" />
    <circle cx="200" cy="175" r="8" fill="#0b0b10" />
    <rect x="24" y="308" width="352" height="68" rx="12" fill="rgba(10,10,16,0.62)" />
    <text x="40" y="335" fill="rgba(255,255,255,0.72)" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" letter-spacing="1.5">${safeArtist}</text>
    <text x="40" y="361" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="20">${safeTitle}</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

interface DemoSeed {
  id: string
  name: string
  artists: string[]
  albumName: string
  durationMs: number
  popularity: number
  bpm: number
  camelot: CamelotCode
  energy: number
  danceability: number
  valence: number
  inLiked: boolean
  playlistIds: string[]
  genreHint: string
  vibeTags: string
  colorA: string
  colorB: string
  accent: string
}

const P_AFTER = '4rnleEAOdmFAbRcNCgZMpY'
const P_SUNSET = '37i9dQZF1DX2aneNMeG90Y'
const P_WAREHOUSE = '5Rrf7mqN8uus2AaQQQNdc1'

const DEMO_SEEDS: DemoSeed[] = [
  {
    id: 'demo_t01',
    name: 'Midnight Horizon',
    artists: ['Kiasmos'],
    albumName: 'Kiasmos II',
    durationMs: 282000,
    popularity: 68,
    bpm: 120,
    camelot: '8A',
    energy: 0.56,
    danceability: 0.72,
    valence: 0.34,
    inLiked: true,
    playlistIds: [P_AFTER],
    genreHint: 'Melodic Techno',
    vibeTags: 'warm atmospheric hypnotic opener minimal piano',
    colorA: '#1e3a8a',
    colorB: '#4c1d95',
    accent: '#38bdf8',
  },
  {
    id: 'demo_t02',
    name: 'Velvet Echoes',
    artists: ['Ben Böhmer'],
    albumName: 'Bloom',
    durationMs: 264000,
    popularity: 74,
    bpm: 121,
    camelot: '8A',
    energy: 0.64,
    danceability: 0.75,
    valence: 0.42,
    inLiked: true,
    playlistIds: [P_AFTER],
    genreHint: 'Deep House',
    vibeTags: 'melodic lush emotional progressive sunrise',
    colorA: '#0f766e',
    colorB: '#1d4ed8',
    accent: '#2dd4bf',
  },
  {
    id: 'demo_t03',
    name: 'Coastline Drift',
    artists: ['Lane 8'],
    albumName: 'Brightest Lights',
    durationMs: 295000,
    popularity: 71,
    bpm: 122,
    camelot: '8B',
    energy: 0.68,
    danceability: 0.76,
    valence: 0.58,
    inLiked: true,
    playlistIds: [P_AFTER, P_SUNSET],
    genreHint: 'Deep House',
    vibeTags: 'dreamy melodic steady groove open air',
    colorA: '#0369a1',
    colorB: '#047857',
    accent: '#34d399',
  },
  {
    id: 'demo_t04',
    name: 'Innerbloom (Radio Edit)',
    artists: ['RÜFÜS DU SOL'],
    albumName: 'Bloom',
    durationMs: 312000,
    popularity: 82,
    bpm: 122,
    camelot: '9A',
    energy: 0.72,
    danceability: 0.74,
    valence: 0.44,
    inLiked: true,
    playlistIds: [P_AFTER],
    genreHint: 'Indie Dance',
    vibeTags: 'anthemic emotional euphoric synth build',
    colorA: '#6d28d9',
    colorB: '#be185d',
    accent: '#f472b6',
  },
  {
    id: 'demo_t05',
    name: 'Neon Boulevard',
    artists: ['Parcels'],
    albumName: 'Day/Night',
    durationMs: 238000,
    popularity: 73,
    bpm: 118,
    camelot: '9A',
    energy: 0.67,
    danceability: 0.84,
    valence: 0.72,
    inLiked: false,
    playlistIds: [P_SUNSET, P_AFTER],
    genreHint: 'Indie Dance',
    vibeTags: 'upbeat disco guitar groove vocal',
    colorA: '#b45309',
    colorB: '#be185d',
    accent: '#fbbf24',
  },
  {
    id: 'demo_t06',
    name: 'Golden Hour Drive',
    artists: ['L’Impératrice'],
    albumName: 'Tako Tsubo',
    durationMs: 229000,
    popularity: 76,
    bpm: 116,
    camelot: '9B',
    energy: 0.62,
    danceability: 0.86,
    valence: 0.81,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'Nu-Disco',
    vibeTags: 'sunny groovy funky bassline rooftop french touch',
    colorA: '#d97706',
    colorB: '#dc2626',
    accent: '#fde047',
  },
  {
    id: 'demo_t07',
    name: 'Mirage Club',
    artists: ['Disclosure'],
    albumName: 'Alchemy',
    durationMs: 245000,
    popularity: 78,
    bpm: 124,
    camelot: '9A',
    energy: 0.81,
    danceability: 0.85,
    valence: 0.55,
    inLiked: true,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'UK Garage / House',
    vibeTags: 'punchy bassline crisp percussion club groove',
    colorA: '#15803d',
    colorB: '#0f766e',
    accent: '#4ade80',
  },
  {
    id: 'demo_t08',
    name: 'Pulse of Saturn',
    artists: ['Anyma', 'Chris Avantgarde'],
    albumName: 'Genesys',
    durationMs: 258000,
    popularity: 79,
    bpm: 125,
    camelot: '10A',
    energy: 0.87,
    danceability: 0.73,
    valence: 0.29,
    inLiked: false,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'Melodic Techno',
    vibeTags: 'driving peak dark synth arpeggio festival',
    colorA: '#312e81',
    colorB: '#7e22ce',
    accent: '#c084fc',
  },
  {
    id: 'demo_t09',
    name: 'Savana',
    artists: ['Chris Lake'],
    albumName: 'Chemistry',
    durationMs: 214000,
    popularity: 80,
    bpm: 126,
    camelot: '10A',
    energy: 0.89,
    danceability: 0.88,
    valence: 0.62,
    inLiked: true,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'Tech House',
    vibeTags: 'peak hour rolling bassline tech house club',
    colorA: '#047857',
    colorB: '#1d4ed8',
    accent: '#22d3ee',
  },
  {
    id: 'demo_t10',
    name: 'Ease My Mind',
    artists: ['Chris Lake', 'Abel Balder'],
    albumName: 'Chemistry',
    durationMs: 226000,
    popularity: 77,
    bpm: 126,
    camelot: '11A',
    energy: 0.85,
    danceability: 0.83,
    valence: 0.49,
    inLiked: true,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'Tech House',
    vibeTags: 'hypnotic vocal chop peak energy warehouse',
    colorA: '#3730a3',
    colorB: '#0284c7',
    accent: '#60a5fa',
  },
  {
    id: 'demo_t11',
    name: 'Satin Overdrive',
    artists: ['Peggy Gou'],
    albumName: 'I Hear You',
    durationMs: 241000,
    popularity: 75,
    bpm: 127,
    camelot: '11A',
    energy: 0.84,
    danceability: 0.87,
    valence: 0.66,
    inLiked: false,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'House',
    vibeTags: 'piano stabs energetic club acid groove',
    colorA: '#be185d',
    colorB: '#ea580c',
    accent: '#fb923c',
  },
  {
    id: 'demo_t12',
    name: 'Afterglow Fade',
    artists: ['Bonobo'],
    albumName: 'Fragments',
    durationMs: 274000,
    popularity: 70,
    bpm: 119,
    camelot: '7A',
    energy: 0.54,
    danceability: 0.71,
    valence: 0.41,
    inLiked: true,
    playlistIds: [P_AFTER],
    genreHint: 'Deep House',
    vibeTags: 'organic percussion soulful warm cooldown',
    colorA: '#115e59',
    colorB: '#4d7c0f',
    accent: '#a3e635',
  },
  {
    id: 'demo_t13',
    name: 'Glass Terrace',
    artists: ['Four Tet'],
    albumName: 'Three',
    durationMs: 304000,
    popularity: 72,
    bpm: 120,
    camelot: '7A',
    energy: 0.61,
    danceability: 0.74,
    valence: 0.52,
    inLiked: true,
    playlistIds: [P_AFTER],
    genreHint: 'Electronica / House',
    vibeTags: 'shimmering harp textures gentle groove afterhours',
    colorA: '#0e7490',
    colorB: '#4338ca',
    accent: '#38bdf8',
  },
  {
    id: 'demo_t14',
    name: 'Breathe Deeper',
    artists: ['Tame Impala'],
    albumName: 'The Slow Rush',
    durationMs: 372000,
    popularity: 81,
    bpm: 115,
    camelot: '10B',
    energy: 0.71,
    danceability: 0.79,
    valence: 0.74,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'Psychedelic Disco',
    vibeTags: 'psychedelic synth bass bouncy disco transition',
    colorA: '#b91c1c',
    colorB: '#d97706',
    accent: '#fcd34d',
  },
  {
    id: 'demo_t15',
    name: 'The Less I Know The Better',
    artists: ['Tame Impala'],
    albumName: 'Currents',
    durationMs: 216000,
    popularity: 89,
    bpm: 117,
    camelot: '11B',
    energy: 0.74,
    danceability: 0.81,
    valence: 0.78,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'Indie Psych',
    vibeTags: 'iconic bassline crowd singalong indie groove',
    colorA: '#581c87',
    colorB: '#be185d',
    accent: '#f472b6',
  },
  {
    id: 'demo_t16',
    name: 'Delilah (pull me out of this)',
    artists: ['Fred again..'],
    albumName: 'Actual Life 3',
    durationMs: 250000,
    popularity: 85,
    bpm: 134,
    camelot: '12A',
    energy: 0.88,
    danceability: 0.76,
    valence: 0.59,
    inLiked: true,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'UK Stutter House',
    vibeTags: 'euphoric vocal chop fast festival closer',
    colorA: '#1d4ed8',
    colorB: '#047857',
    accent: '#34d399',
  },
  {
    id: 'demo_t17',
    name: 'ten',
    artists: ['Fred again..', 'Jozzy'],
    albumName: 'USB',
    durationMs: 198000,
    popularity: 83,
    bpm: 135,
    camelot: '1A',
    energy: 0.91,
    danceability: 0.78,
    valence: 0.54,
    inLiked: false,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'UK Garage / Club',
    vibeTags: 'high energy driving garage skippy drums',
    colorA: '#0f766e',
    colorB: '#4338ca',
    accent: '#818cf8',
  },
  {
    id: 'demo_t18',
    name: 'Solar Flare',
    artists: ['Caribou'],
    albumName: 'Honey',
    durationMs: 233000,
    popularity: 69,
    bpm: 128,
    camelot: '12A',
    energy: 0.82,
    danceability: 0.82,
    valence: 0.64,
    inLiked: true,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'House / Electronica',
    vibeTags: 'bright vocal loop club energy upward lift',
    colorA: '#ca8a04',
    colorB: '#c2410c',
    accent: '#facc15',
  },
  {
    id: 'demo_t19',
    name: 'Rumble',
    artists: ['Skrillex', 'Fred again..', 'Flowdan'],
    albumName: 'Quest For Fire',
    durationMs: 147000,
    popularity: 84,
    bpm: 140,
    camelot: '4A',
    energy: 0.93,
    danceability: 0.81,
    valence: 0.31,
    inLiked: false,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'Dubstep / Bass',
    vibeTags: 'heavy sub bass dark grime drop peak intensity',
    colorA: '#7f1d1d',
    colorB: '#111827',
    accent: '#f87171',
  },
  {
    id: 'demo_t20',
    name: 'Baddadan',
    artists: ['Chase & Status', 'Bou'],
    albumName: '2 RUFF, Vol. 1',
    durationMs: 178000,
    popularity: 86,
    bpm: 174,
    camelot: '4A',
    energy: 0.96,
    danceability: 0.72,
    valence: 0.36,
    inLiked: false,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'Drum & Bass',
    vibeTags: 'fast dnb neuro bass festival finale',
    colorA: '#991b1b',
    colorB: '#7c2d12',
    accent: '#fb923c',
  },
  {
    id: 'demo_t21',
    name: 'Supercut',
    artists: ['Lorde'],
    albumName: 'Melodrama',
    durationMs: 277000,
    popularity: 80,
    bpm: 125,
    camelot: '8B',
    energy: 0.75,
    danceability: 0.69,
    valence: 0.56,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'Synth-Pop',
    vibeTags: 'lush synth piano emotional pop closer',
    colorA: '#1e3a8a',
    colorB: '#0284c7',
    accent: '#60a5fa',
  },
  {
    id: 'demo_t22',
    name: 'Image',
    artists: ['Magdalena Bay'],
    albumName: 'Imaginal Disk',
    durationMs: 212000,
    popularity: 77,
    bpm: 123,
    camelot: '8A',
    energy: 0.77,
    danceability: 0.79,
    valence: 0.61,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'Synth-Pop / Nu-Disco',
    vibeTags: 'sparkling arpeggios crisp snare danceable pop',
    colorA: '#4f46e5',
    colorB: '#db2777',
    accent: '#f472b6',
  },
  {
    id: 'demo_t23',
    name: 'Midnight Pretenders',
    artists: ['Kaytranada'],
    albumName: 'TIMELESS',
    durationMs: 205000,
    popularity: 76,
    bpm: 112,
    camelot: '6A',
    energy: 0.66,
    danceability: 0.89,
    valence: 0.71,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'R&B / Bounce House',
    vibeTags: 'bouncy pocket groove warm Rhodes bassline',
    colorA: '#9d174d',
    colorB: '#6d28d9',
    accent: '#e879f9',
  },
  {
    id: 'demo_t24',
    name: '10%',
    artists: ['Kaytranada', 'Kali Uchis'],
    albumName: 'BUBBA',
    durationMs: 186000,
    popularity: 82,
    bpm: 110,
    camelot: '7A',
    energy: 0.65,
    danceability: 0.9,
    valence: 0.76,
    inLiked: true,
    playlistIds: [P_SUNSET, P_AFTER],
    genreHint: 'Soulful House',
    vibeTags: 'silky vocal funky bounce warmup pocket',
    colorA: '#7e22ce',
    colorB: '#d97706',
    accent: '#fbbf24',
  },
  {
    id: 'demo_t25',
    name: 'Pacific Dusk',
    artists: ['Jungle'],
    albumName: 'Volcano',
    durationMs: 194000,
    popularity: 78,
    bpm: 106,
    camelot: '6B',
    energy: 0.7,
    danceability: 0.88,
    valence: 0.79,
    inLiked: true,
    playlistIds: [P_SUNSET],
    genreHint: 'Funk / Neo-Soul',
    vibeTags: 'falsetto vocal groovy funk percussion sunset',
    colorA: '#b45309',
    colorB: '#0f766e',
    accent: '#fde047',
  },
  {
    id: 'demo_t26',
    name: 'Halftime Shadow',
    artists: ['Jamie xx'],
    albumName: 'In Waves',
    durationMs: 248000,
    popularity: 74,
    bpm: 64,
    camelot: '12A',
    energy: 0.74,
    danceability: 0.68,
    valence: 0.45,
    inLiked: true,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'Halftime / UK Bass',
    vibeTags: 'halftime 64bpm lock matches 128bpm club tracks',
    colorA: '#1e1b4b',
    colorB: '#0f172a',
    accent: '#38bdf8',
  },
  {
    id: 'demo_t27',
    name: 'Electric Bloom',
    artists: ['Romy', 'Fred again..'],
    albumName: 'Mid Air',
    durationMs: 215000,
    popularity: 79,
    bpm: 132,
    camelot: '2A',
    energy: 0.86,
    danceability: 0.77,
    valence: 0.63,
    inLiked: true,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'Trance / Club Pop',
    vibeTags: 'euphoric trance chords bright vocal peak',
    colorA: '#701a75',
    colorB: '#0369a1',
    accent: '#f0abfc',
  },
  {
    id: 'demo_t28',
    name: 'Velvet Skyline',
    artists: ['SG Lewis'],
    albumName: 'AudioLust & HigherLove',
    durationMs: 221000,
    popularity: 73,
    bpm: 118,
    camelot: '5A',
    energy: 0.72,
    danceability: 0.84,
    valence: 0.69,
    inLiked: false,
    playlistIds: [P_SUNSET],
    genreHint: 'Nu-Disco',
    vibeTags: 'french house filter synth rooftop groove',
    colorA: '#0369a1',
    colorB: '#7c3aed',
    accent: '#7dd3fc',
  },
  {
    id: 'demo_t29',
    name: 'Nocturne 3A',
    artists: ['Bicep'],
    albumName: 'Isles',
    durationMs: 298000,
    popularity: 78,
    bpm: 130,
    camelot: '3A',
    energy: 0.83,
    danceability: 0.76,
    valence: 0.37,
    inLiked: true,
    playlistIds: [P_AFTER, P_WAREHOUSE],
    genreHint: 'Breakbeat / Electronica',
    vibeTags: 'breakbeat rave pads emotional warehouse',
    colorA: '#0f172a',
    colorB: '#065f46',
    accent: '#34d399',
  },
  {
    id: 'demo_t30',
    name: 'Sunlit Mirage',
    artists: ['Polo & Pan'],
    albumName: 'Cyclorama',
    durationMs: 236000,
    popularity: 71,
    bpm: 114,
    camelot: '7B',
    energy: 0.66,
    danceability: 0.83,
    valence: 0.82,
    inLiked: false,
    playlistIds: [P_SUNSET],
    genreHint: 'Tropical House / Electro',
    vibeTags: 'playful marimba french electro sunny',
    colorA: '#ea580c',
    colorB: '#0284c7',
    accent: '#fdba74',
  },
  {
    id: 'demo_t31',
    name: 'Amber Horizon',
    artists: ['Overmono'],
    albumName: 'Good Lies',
    durationMs: 256000,
    popularity: 75,
    bpm: 136,
    camelot: '5B',
    energy: 0.84,
    danceability: 0.75,
    valence: 0.48,
    inLiked: true,
    playlistIds: [P_WAREHOUSE],
    genreHint: 'UK Breakbeat',
    vibeTags: 'pitched r&b vocal crisp breakbeat sub bass',
    colorA: '#78350f',
    colorB: '#312e81',
    accent: '#fbbf24',
  },
  {
    id: 'demo_t32',
    name: 'First Light',
    artists: ['Barry Can’t Swim'],
    albumName: 'When Will We Land?',
    durationMs: 244000,
    popularity: 80,
    bpm: 126,
    camelot: '12B',
    energy: 0.79,
    danceability: 0.85,
    valence: 0.68,
    inLiked: true,
    playlistIds: [P_AFTER, P_SUNSET],
    genreHint: 'Piano House',
    vibeTags: 'jazz piano chords uplifting break house closer',
    colorA: '#065f46',
    colorB: '#b45309',
    accent: '#fde047',
  },
]

function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function resolveDemoPlaylist(playlistUrl?: string): {
  meta: SpotifyPlaylistMeta
  trackFilter: (seed: DemoSeed) => boolean
} {
  const parsedId = parsePlaylistId(playlistUrl || '')
  const matchedPreset = DEMO_PLAYLIST_PRESETS.find((p) => p.id === parsedId)

  if (matchedPreset) {
    const count = DEMO_SEEDS.filter((s) =>
      s.playlistIds.includes(matchedPreset.id),
    ).length
    return {
      meta: {
        id: matchedPreset.id,
        name: matchedPreset.name,
        description: matchedPreset.description,
        ownerName: matchedPreset.ownerName,
        totalTracks: count,
        imageUrl: null,
        externalUrl: matchedPreset.url,
      },
      trackFilter: (seed) => seed.playlistIds.includes(matchedPreset.id),
    }
  }

  if (parsedId) {
    const seedHash = hashString(parsedId)
    const selectedIds = new Set(
      DEMO_SEEDS.filter((_, idx) => (seedHash + idx * 7) % 11 < 6).map(
        (s) => s.id,
      ),
    )
    if (selectedIds.size < 10) {
      DEMO_SEEDS.slice(0, 12).forEach((s) => selectedIds.add(s.id))
    }
    return {
      meta: {
        id: parsedId,
        name: `Custom Public Playlist (${parsedId.slice(0, 8)}…)`,
        description:
          'Simulated public playlist generated in Demo Mode from your pasted URL.',
        ownerName: 'Mock Spotify Listener',
        totalTracks: selectedIds.size,
        imageUrl: null,
        externalUrl: playlistUrl || DEMO_SAMPLE_PLAYLIST_URL,
      },
      trackFilter: (seed) => selectedIds.has(seed.id),
    }
  }

  const fallback = DEMO_PLAYLIST_PRESETS[0]
  const count = DEMO_SEEDS.filter((s) =>
    s.playlistIds.includes(fallback.id),
  ).length
  return {
    meta: {
      id: fallback.id,
      name: fallback.name,
      description: fallback.description,
      ownerName: fallback.ownerName,
      totalTracks: count,
      imageUrl: null,
      externalUrl: fallback.url,
    },
    trackFilter: (seed) => seed.playlistIds.includes(fallback.id),
  }
}

export function buildDemoTracksForMode(
  sourceMode: SourceMode,
  playlistUrl?: string,
): AnalyzedTrack[] {
  const { trackFilter } = resolveDemoPlaylist(playlistUrl)

  const tracks: AnalyzedTrack[] = []
  for (const seed of DEMO_SEEDS) {
    const inLiked = seed.inLiked
    const inPlaylist = trackFilter(seed)

    const include =
      sourceMode === 'liked'
        ? inLiked
        : sourceMode === 'playlist'
          ? inPlaylist
          : inLiked || inPlaylist

    if (!include) continue

    const origins: TrackSourceOrigin[] = []
    if (inLiked && (sourceMode === 'liked' || sourceMode === 'both')) {
      origins.push('liked')
    }
    if (inPlaylist && (sourceMode === 'playlist' || sourceMode === 'both')) {
      origins.push('playlist')
    }
    if (origins.length === 0) {
      if (inLiked) origins.push('liked')
      if (inPlaylist) origins.push('playlist')
    }

    const cam = camelotToPitchAndMode(seed.camelot)
    tracks.push({
      id: seed.id,
      uri: `spotify:track:${seed.id}`,
      name: seed.name,
      artists: seed.artists,
      artistNames: seed.artists.join(', '),
      albumName: seed.albumName,
      albumId: `alb_${seed.id}`,
      albumArtUrl: createCoverSvg(
        seed.name,
        seed.artists[0] || seed.albumName,
        seed.colorA,
        seed.colorB,
        seed.accent,
      ),
      durationMs: seed.durationMs,
      popularity: seed.popularity,
      externalUrl: null,
      previewUrl: null,
      isrc: null,
      bpm: seed.bpm,
      camelot: seed.camelot,
      musicalKey: cam.musicalKey,
      pitchClass: cam.pitchClass,
      mode: cam.mode,
      energy: seed.energy,
      danceability: seed.danceability,
      valence: seed.valence,
      featureSource: 'curated',
      sources: origins,
      genreHint: seed.genreHint,
      vibeTags: seed.vibeTags,
    })
  }

  return tracks
}

export function buildDemoCrate(
  sourceMode: SourceMode,
  playlistUrl?: string,
): AnalyzedCrate {
  const resolved = resolveDemoPlaylist(playlistUrl)
  const tracks = buildDemoTracksForMode(sourceMode, playlistUrl)
  const likedCount = tracks.filter((t) => t.sources.includes('liked')).length
  const playlistCount = tracks.filter((t) =>
    t.sources.includes('playlist'),
  ).length

  return {
    user: {
      id: 'spotkit_demo',
      display_name: 'SpotKit Demo DJ',
      product: 'premium',
    },
    sourceMode,
    playlistMeta:
      sourceMode === 'playlist' || sourceMode === 'both' ? resolved.meta : null,
    tracks,
    likedCount,
    playlistCount,
    isDemo: true,
    analyzedAt: new Date().toISOString(),
    featureSummary: {
      spotify: 0,
      reccobeats: 0,
      estimated: 0,
      curated: tracks.length,
      manual: 0,
    },
  }
}
