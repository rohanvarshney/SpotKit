import type {
  AlbumType,
  RawLibraryDataset,
  SpotifyAlbumFull,
  SpotifySavedTrackItem,
  UserTopTrackEntry,
} from '../types/spotify'
import { normalizeTrackTitle } from '../lib/albumScorer'

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function createCoverSvg(
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
    <text x="40" y="335" fill="rgba(255,255,255,0.7)" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="12" letter-spacing="1.5">${safeArtist}</text>
    <text x="40" y="361" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="20">${safeTitle}</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

interface MockAlbumSpec {
  id: string
  name: string
  artistId: string
  artistName: string
  albumType: AlbumType
  releaseDate: string
  colorA: string
  colorB: string
  accent: string
  tracks: {
    name: string
    durationSec: number
    liked: boolean
    addedAt?: string
    popularity?: number
    topRank?: number
    topRanges?: ('short_term' | 'medium_term' | 'long_term')[]
  }[]
}

const MOCK_ALBUMS: MockAlbumSpec[] = [
  {
    id: 'alb_currents',
    name: 'Currents',
    artistId: 'art_tame',
    artistName: 'Tame Impala',
    albumType: 'album',
    releaseDate: '2015-07-17',
    colorA: '#581c87',
    colorB: '#be185d',
    accent: '#f472b6',
    tracks: [
      { name: 'Let It Happen', durationSec: 467, liked: true, addedAt: '2026-10-18T14:22:00Z', popularity: 86, topRank: 2, topRanges: ['short_term', 'medium_term', 'long_term'] },
      { name: 'Nangs', durationSec: 107, liked: true, addedAt: '2026-09-12T10:15:00Z', popularity: 76 },
      { name: 'The Moment', durationSec: 255, liked: true, addedAt: '2026-09-14T19:00:00Z', popularity: 75 },
      { name: "Yes I'm Changing", durationSec: 270, liked: true, addedAt: '2026-08-03T11:30:00Z', popularity: 78 },
      { name: 'Eventually', durationSec: 318, liked: true, addedAt: '2026-10-01T21:10:00Z', popularity: 84, topRank: 9, topRanges: ['medium_term', 'long_term'] },
      { name: 'Gossip', durationSec: 55, liked: false, popularity: 64 },
      { name: 'The Less I Know The Better', durationSec: 216, liked: true, addedAt: '2026-10-25T18:00:00Z', popularity: 92, topRank: 1, topRanges: ['short_term', 'medium_term', 'long_term'] },
      { name: 'Past Life', durationSec: 228, liked: true, addedAt: '2026-07-19T12:00:00Z', popularity: 69 },
      { name: 'Disciples', durationSec: 108, liked: true, addedAt: '2026-08-22T15:40:00Z', popularity: 74 },
      { name: "'Cause I'm A Man", durationSec: 241, liked: true, addedAt: '2026-09-01T09:12:00Z', popularity: 73 },
      { name: 'Reality In Motion', durationSec: 252, liked: true, addedAt: '2026-09-05T16:40:00Z', popularity: 70 },
      { name: 'Love/Paranoia', durationSec: 185, liked: true, addedAt: '2026-10-02T20:15:00Z', popularity: 77 },
      { name: 'New Person, Same Old Mistakes', durationSec: 363, liked: true, addedAt: '2026-10-28T23:05:00Z', popularity: 85, topRank: 6, topRanges: ['short_term', 'medium_term'] },
    ],
  },
  {
    id: 'alb_currents_b',
    name: 'Currents (Deluxe B-Sides & Remixes)',
    artistId: 'art_tame',
    artistName: 'Tame Impala',
    albumType: 'album',
    releaseDate: '2017-11-17',
    colorA: '#4c1d95',
    colorB: '#9d174d',
    accent: '#e879f9',
    tracks: [
      { name: 'Let It Happen', durationSec: 467, liked: true, addedAt: '2026-10-19T08:00:00Z', popularity: 84 },
      { name: 'List of People (To Try and Forget About)', durationSec: 280, liked: true, addedAt: '2026-10-20T14:00:00Z', popularity: 74 },
      { name: 'Powerlines', durationSec: 257, liked: false, popularity: 68 },
      { name: 'Taxi’s Here', durationSec: 294, liked: false, popularity: 67 },
    ],
  },
  {
    id: 'alb_melodrama',
    name: 'Melodrama',
    artistId: 'art_lorde',
    artistName: 'Lorde',
    albumType: 'album',
    releaseDate: '2017-06-16',
    colorA: '#1e3a8a',
    colorB: '#312e81',
    accent: '#60a5fa',
    tracks: [
      { name: 'Green Light', durationSec: 234, liked: true, addedAt: '2026-10-10T18:20:00Z', popularity: 84, topRank: 4, topRanges: ['short_term', 'medium_term'] },
      { name: 'Sober', durationSec: 197, liked: true, addedAt: '2026-09-20T13:10:00Z', popularity: 76 },
      { name: 'Homemade Dynamite', durationSec: 189, liked: true, addedAt: '2026-09-21T14:50:00Z', popularity: 78 },
      { name: 'The Louvre', durationSec: 271, liked: true, addedAt: '2026-10-14T22:10:00Z', popularity: 79, topRank: 11, topRanges: ['medium_term'] },
      { name: 'Liability', durationSec: 172, liked: true, addedAt: '2026-08-15T20:00:00Z', popularity: 82 },
      { name: 'Hard Feelings/Loveless', durationSec: 367, liked: true, addedAt: '2026-09-28T17:30:00Z', popularity: 75 },
      { name: 'Sober II (Melodrama)', durationSec: 178, liked: true, addedAt: '2026-09-29T18:00:00Z', popularity: 72 },
      { name: 'Writer in the Dark', durationSec: 216, liked: true, addedAt: '2026-10-03T21:45:00Z', popularity: 76 },
      { name: 'Supercut', durationSec: 277, liked: true, addedAt: '2026-11-01T19:15:00Z', popularity: 85, topRank: 3, topRanges: ['short_term', 'long_term'] },
      { name: 'Liability (Reprise)', durationSec: 136, liked: true, addedAt: '2026-09-30T11:20:00Z', popularity: 70 },
      { name: 'Perfect Places', durationSec: 221, liked: true, addedAt: '2026-10-11T16:40:00Z', popularity: 80 },
    ],
  },
  {
    id: 'alb_in_rainbows',
    name: 'In Rainbows',
    artistId: 'art_radiohead',
    artistName: 'Radiohead',
    albumType: 'album',
    releaseDate: '2007-10-10',
    colorA: '#9a3412',
    colorB: '#b45309',
    accent: '#facc15',
    tracks: [
      { name: '15 Step', durationSec: 237, liked: true, addedAt: '2026-06-12T10:00:00Z', popularity: 79 },
      { name: 'Bodysnatchers', durationSec: 242, liked: true, addedAt: '2026-06-12T10:05:00Z', popularity: 77 },
      { name: 'Nude', durationSec: 255, liked: true, addedAt: '2026-07-04T23:10:00Z', popularity: 81, topRank: 14, topRanges: ['long_term'] },
      { name: 'Weird Fishes/ Arpeggi', durationSec: 318, liked: true, addedAt: '2026-10-15T20:00:00Z', popularity: 86, topRank: 5, topRanges: ['medium_term', 'long_term'] },
      { name: 'All I Need', durationSec: 228, liked: true, addedAt: '2026-08-19T19:30:00Z', popularity: 84 },
      { name: 'Faust Arp', durationSec: 129, liked: false, popularity: 68 },
      { name: 'Reckoner', durationSec: 290, liked: true, addedAt: '2026-09-09T15:10:00Z', popularity: 82 },
      { name: 'House of Cards', durationSec: 328, liked: true, addedAt: '2026-07-22T14:00:00Z', popularity: 78 },
      { name: 'Jigsaw Falling Into Place', durationSec: 248, liked: true, addedAt: '2026-10-29T21:40:00Z', popularity: 88, topRank: 7, topRanges: ['short_term', 'long_term'] },
      { name: 'Videotape', durationSec: 279, liked: true, addedAt: '2026-06-14T22:00:00Z', popularity: 75 },
    ],
  },
  {
    id: 'alb_blonde',
    name: 'Blonde',
    artistId: 'art_frank',
    artistName: 'Frank Ocean',
    albumType: 'album',
    releaseDate: '2016-08-20',
    colorA: '#065f46',
    colorB: '#115e59',
    accent: '#34d399',
    tracks: [
      { name: 'Nikes', durationSec: 314, liked: true, addedAt: '2026-08-10T11:00:00Z', popularity: 84 },
      { name: 'Ivy', durationSec: 249, liked: true, addedAt: '2026-10-22T17:00:00Z', popularity: 89, topRank: 8, topRanges: ['short_term', 'medium_term'] },
      { name: 'Pink + White', durationSec: 184, liked: true, addedAt: '2026-10-23T18:30:00Z', popularity: 91, topRank: 10, topRanges: ['medium_term', 'long_term'] },
      { name: 'Be Yourself', durationSec: 86, liked: false, popularity: 62 },
      { name: 'Solo', durationSec: 257, liked: true, addedAt: '2026-07-30T14:20:00Z', popularity: 83 },
      { name: 'Skyline To', durationSec: 184, liked: true, addedAt: '2026-05-19T12:10:00Z', popularity: 76 },
      { name: 'Self Control', durationSec: 249, liked: true, addedAt: '2026-09-18T22:50:00Z', popularity: 87, topRank: 12, topRanges: ['long_term'] },
      { name: 'Good Guy', durationSec: 66, liked: false, popularity: 67 },
      { name: 'Nights', durationSec: 307, liked: true, addedAt: '2026-11-02T23:15:00Z', popularity: 89, topRank: 4, topRanges: ['short_term', 'long_term'] },
      { name: 'Solo (Reprise)', durationSec: 78, liked: false, popularity: 68 },
      { name: 'Pretty Sweet', durationSec: 158, liked: false, popularity: 66 },
      { name: 'Facebook Story', durationSec: 68, liked: false, popularity: 60 },
      { name: 'Close to You', durationSec: 85, liked: true, addedAt: '2026-05-22T09:00:00Z', popularity: 73 },
      { name: 'White Ferrari', durationSec: 248, liked: true, addedAt: '2026-10-08T21:00:00Z', popularity: 88 },
      { name: 'Seigfried', durationSec: 334, liked: true, addedAt: '2026-08-29T20:10:00Z', popularity: 82 },
      { name: 'Godspeed', durationSec: 177, liked: true, addedAt: '2026-09-04T19:40:00Z', popularity: 84 },
      { name: 'Futura Free', durationSec: 564, liked: false, popularity: 71 },
    ],
  },
  {
    id: 'alb_ram',
    name: 'Random Access Memories',
    artistId: 'art_daft',
    artistName: 'Daft Punk',
    albumType: 'album',
    releaseDate: '2013-05-17',
    colorA: '#1e293b',
    colorB: '#713f12',
    accent: '#fbbf24',
    tracks: [
      { name: 'Give Life Back to Music', durationSec: 275, liked: true, addedAt: '2026-04-10T14:00:00Z', popularity: 79 },
      { name: 'The Game of Love', durationSec: 322, liked: false, popularity: 71 },
      { name: 'Giorgio by Moroder', durationSec: 544, liked: true, addedAt: '2026-04-12T16:20:00Z', popularity: 80 },
      { name: 'Within', durationSec: 228, liked: true, addedAt: '2026-04-15T19:00:00Z', popularity: 73 },
      { name: 'Instant Crush (feat. Julian Casablancas)', durationSec: 337, liked: true, addedAt: '2026-09-10T18:10:00Z', popularity: 88, topRank: 15, topRanges: ['medium_term'] },
      { name: 'Lose Yourself to Dance', durationSec: 353, liked: true, addedAt: '2026-05-01T12:00:00Z', popularity: 82 },
      { name: 'Touch', durationSec: 498, liked: true, addedAt: '2026-06-08T21:40:00Z', popularity: 76 },
      { name: 'Get Lucky', durationSec: 369, liked: true, addedAt: '2026-05-03T15:30:00Z', popularity: 89 },
      { name: 'Beyond', durationSec: 290, liked: false, popularity: 70 },
      { name: 'Motherboard', durationSec: 341, liked: false, popularity: 68 },
      { name: 'Fragments of Time', durationSec: 279, liked: true, addedAt: '2026-07-11T17:00:00Z', popularity: 75 },
      { name: "Doin' it Right", durationSec: 251, liked: true, addedAt: '2026-07-12T18:00:00Z', popularity: 78 },
      { name: 'Contact', durationSec: 381, liked: true, addedAt: '2026-08-01T22:00:00Z', popularity: 77 },
    ],
  },
  {
    id: 'alb_imaginal',
    name: 'Imaginal Disk',
    artistId: 'art_magbay',
    artistName: 'Magdalena Bay',
    albumType: 'album',
    releaseDate: '2024-08-23',
    colorA: '#0369a1',
    colorB: '#86198f',
    accent: '#38bdf8',
    tracks: [
      { name: 'She Looked Like Me!', durationSec: 193, liked: true, addedAt: '2026-10-30T10:00:00Z', popularity: 75 },
      { name: 'Killing Time', durationSec: 233, liked: true, addedAt: '2026-10-30T10:05:00Z', popularity: 79 },
      { name: 'True Blue Interlude', durationSec: 109, liked: false, popularity: 66 },
      { name: 'Image', durationSec: 212, liked: true, addedAt: '2026-11-04T15:00:00Z', popularity: 85, topRank: 3, topRanges: ['short_term'] },
      { name: 'Death & Romance', durationSec: 314, liked: true, addedAt: '2026-11-03T14:20:00Z', popularity: 83, topRank: 9, topRanges: ['short_term'] },
      { name: 'Fear, Sex', durationSec: 152, liked: true, addedAt: '2026-10-31T12:00:00Z', popularity: 74 },
      { name: 'Vampire in the Corner', durationSec: 201, liked: true, addedAt: '2026-11-01T16:00:00Z', popularity: 76 },
      { name: 'Watching T.V.', durationSec: 245, liked: true, addedAt: '2026-11-01T16:10:00Z', popularity: 74 },
      { name: 'Tunnel Vision', durationSec: 305, liked: true, addedAt: '2026-11-02T11:30:00Z', popularity: 77 },
      { name: 'Love Is Everywhere', durationSec: 194, liked: false, popularity: 70 },
      { name: 'Feeling DiskInserted?', durationSec: 58, liked: false, popularity: 62 },
      { name: "That's My Floor", durationSec: 196, liked: true, addedAt: '2026-11-05T18:20:00Z', popularity: 80 },
      { name: 'Cry for Me', durationSec: 307, liked: true, addedAt: '2026-11-06T20:00:00Z', popularity: 82, topRank: 12, topRanges: ['short_term'] },
      { name: 'Angel on a Satellite', durationSec: 243, liked: true, addedAt: '2026-11-06T20:10:00Z', popularity: 75 },
      { name: 'The Ballad of Matt & Mica', durationSec: 240, liked: true, addedAt: '2026-11-07T09:30:00Z', popularity: 78 },
    ],
  },
  {
    id: 'alb_single_demo',
    name: 'Breathe Deeper (Lil Yachty Remix)',
    artistId: 'art_tame',
    artistName: 'Tame Impala',
    albumType: 'single',
    releaseDate: '2021-10-29',
    colorA: '#991b1b',
    colorB: '#9a3412',
    accent: '#fb923c',
    tracks: [
      { name: 'Breathe Deeper - Lil Yachty Remix', durationSec: 288, liked: true, addedAt: '2026-10-12T10:00:00Z', popularity: 72 },
    ],
  },
]

export function buildDemoLibraryDataset(): RawLibraryDataset {
  const savedTracks: SpotifySavedTrackItem[] = []
  const topTracksMap: Record<string, UserTopTrackEntry> = {}
  const hydratedAlbumsMap: Record<string, SpotifyAlbumFull> = {}

  for (const spec of MOCK_ALBUMS) {
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
      external_urls: { spotify: `https://open.spotify.com/artist/${spec.artistId}` },
    }

    const albumSimple = {
      id: spec.id,
      name: spec.name,
      album_type: spec.albumType,
      total_tracks: spec.tracks.length,
      release_date: spec.releaseDate,
      images: [{ url: coverUrl, height: 400, width: 400 }],
      artists: [artistObj],
      external_urls: { spotify: `https://open.spotify.com/album/${spec.id}` },
    }

    const trackSimples = spec.tracks.map((t, index) => {
      const trackId = `${spec.id}_trk_${index + 1}`
      if (t.topRank && t.topRanges) {
        topTracksMap[trackId] = {
          trackId,
          normalizedTitle: normalizeTrackTitle(t.name),
          primaryArtistName: spec.artistName.toLowerCase(),
          bestRank: t.topRank,
          ranges: t.topRanges,
          scoreBoost: Math.min(1, (51 - t.topRank) / 50 + 0.1 * (t.topRanges.length - 1)),
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
            external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
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
        external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
      }
    })

    hydratedAlbumsMap[spec.id] = {
      ...albumSimple,
      tracks: {
        items: trackSimples,
        total: trackSimples.length,
      },
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
