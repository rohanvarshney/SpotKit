// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import demoArtworkManifest from '../assets/demoArtworkManifest.json'
import { createCoverSvg } from './demoCatalogCore'

export interface DemoArtworkManifestEntry {
  url: string
  source?: string
  width?: number
  height?: number
  matchedArtist?: string
  matchedAlbum?: string
}

export interface DemoArtworkSpec {
  albumId: string
  albumName: string
  artistName: string
  colorA: string
  colorB: string
  accent: string
}

export interface ResolvedDemoArtwork {
  url: string
  fallbackUrl: string
  width: number
  height: number
  isManifestArtwork: boolean
}

export interface DemoArtworkImage {
  url: string
  width: number
  height: number
}

export const DEMO_ARTWORK_MANIFEST_VERSION: string =
  demoArtworkManifest.catalogVersion

export const DEMO_ARTWORK_ALBUMS = demoArtworkManifest.albums as Record<
  string,
  DemoArtworkManifestEntry | undefined
>

export function getDemoArtworkEntry(
  albumId: string,
): DemoArtworkManifestEntry | undefined {
  return DEMO_ARTWORK_ALBUMS[albumId]
}

export function resolveDemoAlbumArtwork(
  spec: DemoArtworkSpec,
): ResolvedDemoArtwork {
  const fallbackUrl = createCoverSvg(
    spec.albumName,
    spec.artistName,
    spec.colorA,
    spec.colorB,
    spec.accent,
  )
  const entry = getDemoArtworkEntry(spec.albumId)
  if (entry?.url) {
    return {
      url: entry.url,
      fallbackUrl,
      width: entry.width ?? 600,
      height: entry.height ?? 600,
      isManifestArtwork: true,
    }
  }
  return {
    url: fallbackUrl,
    fallbackUrl,
    width: 400,
    height: 400,
    isManifestArtwork: false,
  }
}

export function buildDemoAlbumImages(
  spec: DemoArtworkSpec,
): DemoArtworkImage[] {
  const resolved = resolveDemoAlbumArtwork(spec)
  if (resolved.isManifestArtwork) {
    return [
      {
        url: resolved.url,
        height: resolved.height,
        width: resolved.width,
      },
      { url: resolved.fallbackUrl, height: 400, width: 400 },
    ]
  }
  return [{ url: resolved.fallbackUrl, height: 400, width: 400 }]
}

export function applyFallbackImageOnError(
  img: HTMLImageElement,
  fallbackUrl?: string | null,
): void {
  const currentSrc = img.getAttribute('src') || ''
  if (!fallbackUrl || currentSrc === fallbackUrl) return
  if (img.dataset.fallbackAppliedFor === currentSrc) return
  img.dataset.fallbackAppliedFor = currentSrc
  img.src = fallbackUrl
}
