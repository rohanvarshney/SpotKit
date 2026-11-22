// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { BASE_DEMO_ALBUMS } from './baseCatalogData'
import { EXPANDED_DANCE_ALBUMS } from './expandedDanceAlbums'
import { EXPANDED_MAINSTREAM_ALBUMS } from './expandedMainstreamAlbums'
import type { SharedMockAlbumSpec } from './types'

export const SPOTKIT_DEMO_CATALOG_VERSION = '2026.2-unified'

export const UNHYDRATED_DEMO_ALBUM_IDS = new Set([
  'alb_xx',
  'alb_oracular',
])

export const SPOTKIT_DEMO_ALBUMS: SharedMockAlbumSpec[] = [
  ...BASE_DEMO_ALBUMS,
  ...EXPANDED_MAINSTREAM_ALBUMS,
  ...EXPANDED_DANCE_ALBUMS,
]

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Generates a 400x400 vinyl-record SVG cover shared across TopAlbums, DJMyPlaylist, and MakeASet.
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
