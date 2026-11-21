// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  buildFibonacciTierGroups,
  buildGradeTierGroups,
  isNoSkipAlbum,
  type FibonacciTierGroup,
} from '../components/DashboardView'
import type {
  RankingMode,
  ScoredAlbum,
  TopTrackTimeRange,
} from '../types/spotify'

export type ViewLayoutMode = 'grid' | 'list' | 'tier' | 'artist'
export type ArtistExportMode = 'cards' | 'custom-tier'

export const TIER_LETTER_LIST = ['S', 'A', 'B', 'C', 'D', 'F'] as const
export type TierLetter = (typeof TIER_LETTER_LIST)[number]
export type CustomArtistTierMap = Record<TierLetter, ScoredAlbum[]>

export interface ArtistTopTrackSummary {
  trackId: string
  trackName: string
  albumName: string
  bestRank: number
  ranges: TopTrackTimeRange[]
}

export interface ArtistGroupSummary {
  artistKey: string
  artistId: string
  artistName: string
  artistSpotifyUrl: string
  albums: { album: ScoredAlbum; globalRank: number; artistRank: number }[]
  totalLikedTracks: number
  totalCatalogTracks: number
  catalogCompletionProportion: number
  averageScore: number
  peakScore: number
  peakAlbum: ScoredAlbum
  bestGlobalRank: number
  noSkipCount: number
  topTracksCount: number
  eraSpan: string
  topTracksList: ArtistTopTrackSummary[]
}

export interface ShareImageExportOptions {
  viewLayout: ViewLayoutMode
  albums: ScoredAlbum[]
  userDisplayName: string
  totalLikedSongs: number
  noSkipCount: number
  topBoostedCount: number
  rankingMode: RankingMode
  gradeBasedTiering: boolean
  brandLogoSrc: string
  signatureSrc: string
  size?: number
  artistSummary?: ArtistGroupSummary
  artistExportMode?: ArtistExportMode
  customArtistTiers?: CustomArtistTierMap
  isDemo?: boolean
}

export interface ShareImageLayoutSpec {
  viewLayout: ViewLayoutMode
  width: number
  height: number
  aspectRatio: '1:1'
  filename: string
  layoutBadge: string
  rankingLabel: string
  subtitle: string
  includesJointSignature: true
  featuredAlbumsCount: number
  tierMode?: 'fibonacci' | 'grade'
}

const BASE_SIZE = 1440
export const DEFAULT_EXPORT_SIZE = 2880
const FONT_SANS =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"

const RANKING_MODE_LABELS: Record<RankingMode, string> = {
  weighted: 'Weighted Score',
  proportion: 'Pure % Liked',
  count: '# of Liked Songs',
  custom: 'Custom Formula',
}

const TIER_GRADIENTS: Record<string, [string, string, string]> = {
  S: ['#facc15', '#f97316', '#09090b'],
  A: ['#4ade80', '#10b981', '#052e16'],
  B: ['#38bdf8', '#3b82f6', '#082f49'],
  C: ['#c084fc', '#8b5cf6', '#1e1b4b'],
  D: ['#f472b6', '#db2777', '#ffffff'],
  F: ['#94a3b8', '#475569', '#f8fafc'],
}

const GRADE_THRESHOLD_LABELS: Record<string, string> = {
  S: '100%',
  A: '≥ 90%',
  B: '≥ 80%',
  C: '≥ 70%',
  D: '≥ 60%',
  F: '< 60%',
}

const FIB_TIER_SUB_LABELS: Record<string, string> = {
  S: '100% No-Skip',
  A: 'Levels 3 + 5',
  B: 'Levels 8 + 13',
  C: 'Levels 21 + 34',
  D: 'Levels 55 + 89',
  F: 'Levels 144+',
}

export function buildArtistGroups(albums: ScoredAlbum[]): ArtistGroupSummary[] {
  if (albums.length === 0) return []

  const grouped = new Map<
    string,
    {
      artistKey: string
      artistId: string
      artistName: string
      artistSpotifyUrl: string
      albums: { album: ScoredAlbum; globalRank: number }[]
    }
  >()

  albums.forEach((album, idx) => {
    const globalRank = idx + 1
    const primaryObj = album.artists[0]
    const artistName =
      album.primaryArtist || primaryObj?.name || 'Unknown Artist'
    const artistKey = artistName.toLowerCase().trim() || 'unknown'
    const artistId = primaryObj?.id || artistKey
    const artistSpotifyUrl =
      primaryObj?.external_urls?.spotify ||
      `https://open.spotify.com/search/${encodeURIComponent(artistName)}`

    let bucket = grouped.get(artistKey)
    if (!bucket) {
      bucket = {
        artistKey,
        artistId,
        artistName,
        artistSpotifyUrl,
        albums: [],
      }
      grouped.set(artistKey, bucket)
    }
    bucket.albums.push({ album, globalRank })
  })

  const summaries: ArtistGroupSummary[] = []
  for (const bucket of grouped.values()) {
    const rankedAlbums = bucket.albums.map((entry, idx) => ({
      album: entry.album,
      globalRank: entry.globalRank,
      artistRank: idx + 1,
    }))

    let totalLikedTracks = 0
    let totalCatalogTracks = 0
    let scoreSum = 0
    let peakScore = -Infinity
    let peakAlbum = rankedAlbums[0].album
    let noSkipCount = 0
    const years: number[] = []
    const topTracksByKey = new Map<string, ArtistTopTrackSummary>()

    for (const { album } of rankedAlbums) {
      totalLikedTracks += album.likedCount
      totalCatalogTracks += album.totalTracks
      scoreSum += album.finalScore
      if (album.finalScore > peakScore) {
        peakScore = album.finalScore
        peakAlbum = album
      }
      if (isNoSkipAlbum(album)) {
        noSkipCount += 1
      }
      const parsedYear = Number.parseInt(album.releaseYear, 10)
      if (!Number.isNaN(parsedYear) && parsedYear > 1900) {
        years.push(parsedYear)
      }
      for (const track of album.tracks) {
        if (!track.topTrackInfo) continue
        const dedupKey =
          track.topTrackInfo.normalizedTitle ||
          track.topTrackInfo.trackId ||
          track.id
        const existing = topTracksByKey.get(dedupKey)
        if (!existing || track.topTrackInfo.bestRank < existing.bestRank) {
          topTracksByKey.set(dedupKey, {
            trackId: track.topTrackInfo.trackId || track.id,
            trackName: track.name,
            albumName: album.name,
            bestRank: track.topTrackInfo.bestRank,
            ranges: track.topTrackInfo.ranges,
          })
        }
      }
    }

    const topTracksList = Array.from(topTracksByKey.values()).sort(
      (a, b) => a.bestRank - b.bestRank,
    )
    const minYear = years.length > 0 ? Math.min(...years) : null
    const maxYear = years.length > 0 ? Math.max(...years) : null
    const eraSpan =
      minYear === null || maxYear === null
        ? '—'
        : minYear === maxYear
          ? String(minYear)
          : `${minYear}–${maxYear}`

    summaries.push({
      artistKey: bucket.artistKey,
      artistId: bucket.artistId,
      artistName: bucket.artistName,
      artistSpotifyUrl: bucket.artistSpotifyUrl,
      albums: rankedAlbums,
      totalLikedTracks,
      totalCatalogTracks,
      catalogCompletionProportion:
        totalCatalogTracks > 0 ? totalLikedTracks / totalCatalogTracks : 0,
      averageScore: scoreSum / rankedAlbums.length,
      peakScore: Number.isFinite(peakScore) ? peakScore : 0,
      peakAlbum,
      bestGlobalRank: rankedAlbums[0].globalRank,
      noSkipCount,
      topTracksCount: topTracksList.length,
      eraSpan,
      topTracksList,
    })
  }

  return summaries.sort(
    (a, b) =>
      b.albums.length - a.albums.length ||
      b.peakScore - a.peakScore ||
      b.totalLikedTracks - a.totalLikedTracks ||
      a.artistName.localeCompare(b.artistName),
  )
}

export function buildDefaultArtistTierMap(
  artistSummary: ArtistGroupSummary,
): CustomArtistTierMap {
  const tiers: CustomArtistTierMap = {
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
    F: [],
  }

  const remaining: ScoredAlbum[] = []
  for (const { album } of artistSummary.albums) {
    if (isNoSkipAlbum(album)) {
      tiers.S.push(album)
    } else {
      remaining.push(album)
    }
  }

  if (remaining.length === 0) return tiers

  const bucketForScore = (score: number): TierLetter => {
    if (score >= 85) return 'A'
    if (score >= 75) return 'B'
    if (score >= 65) return 'C'
    if (score >= 55) return 'D'
    return 'F'
  }

  const assignedBuckets = remaining.map((a) => bucketForScore(a.finalScore))
  const distinctBuckets = new Set(assignedBuckets)

  if (remaining.length >= 2 && distinctBuckets.size === 1) {
    const spreadTiers: TierLetter[] = ['A', 'B', 'C', 'D', 'F']
    remaining.forEach((album, idx) => {
      const target = spreadTiers[Math.min(spreadTiers.length - 1, idx)]
      tiers[target].push(album)
    })
  } else {
    remaining.forEach((album, idx) => {
      tiers[assignedBuckets[idx]].push(album)
    })
  }

  return tiers
}

export function buildShareImageFilename(
  viewLayout: ViewLayoutMode,
  gradeBasedTiering = false,
  artistName?: string,
  artistExportMode: ArtistExportMode = 'cards',
): string {
  if (viewLayout === 'grid') return 'spotkit-top-albums-grid.png'
  if (viewLayout === 'list') return 'spotkit-top-albums-table.png'
  if (viewLayout === 'artist') {
    const slug =
      (artistName || 'artist')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'artist'
    return artistExportMode === 'custom-tier'
      ? `spotkit-artist-${slug}-tier-list.png`
      : `spotkit-artist-${slug}-cards.png`
  }
  return gradeBasedTiering
    ? 'spotkit-top-albums-tier-grades.png'
    : 'spotkit-top-albums-tier-fibonacci.png'
}

export function getShareImageLayoutSpec(
  options: ShareImageExportOptions,
): ShareImageLayoutSpec {
  const size = options.size ?? DEFAULT_EXPORT_SIZE
  const rankingLabel = RANKING_MODE_LABELS[options.rankingMode]

  if (options.viewLayout === 'artist') {
    const artistSummary =
      options.artistSummary ?? buildArtistGroups(options.albums)[0]
    const artistName = artistSummary?.artistName || 'Artist'
    const mode: ArtistExportMode = options.artistExportMode ?? 'cards'
    return {
      viewLayout: 'artist',
      width: size,
      height: size,
      aspectRatio: '1:1',
      filename: buildShareImageFilename('artist', false, artistName, mode),
      layoutBadge:
        mode === 'custom-tier'
          ? '🎤 ARTIST TIER LIST'
          : '🎤 ARTIST DISCOGRAPHY',
      rankingLabel,
      subtitle:
        mode === 'custom-tier'
          ? `${artistName} • Custom Discography Tier Ranking`
          : `${artistName} • Artist Catalog & Metadata View`,
      includesJointSignature: true,
      featuredAlbumsCount: artistSummary ? artistSummary.albums.length : 0,
    }
  }

  const filename = buildShareImageFilename(
    options.viewLayout,
    options.gradeBasedTiering,
  )

  if (options.viewLayout === 'grid') {
    return {
      viewLayout: 'grid',
      width: size,
      height: size,
      aspectRatio: '1:1',
      filename,
      layoutBadge: '⊞ TOP ALBUMS GRID',
      rankingLabel,
      subtitle: 'Top 9 Bento Album Art Grid',
      includesJointSignature: true,
      featuredAlbumsCount: Math.min(9, options.albums.length),
    }
  }

  if (options.viewLayout === 'list') {
    return {
      viewLayout: 'list',
      width: size,
      height: size,
      aspectRatio: '1:1',
      filename,
      layoutBadge: '☰ RANKING LEADERBOARD',
      rankingLabel,
      subtitle: 'Top 10 Album Ranking Chart',
      includesJointSignature: true,
      featuredAlbumsCount: Math.min(10, options.albums.length),
    }
  }

  return {
    viewLayout: 'tier',
    width: size,
    height: size,
    aspectRatio: '1:1',
    filename,
    layoutBadge: options.gradeBasedTiering
      ? '🏆 GRADE TIER BOARD'
      : '🏆 FIBONACCI TIER BOARD',
    rankingLabel,
    subtitle: options.gradeBasedTiering
      ? 'S–F Score Threshold Tier List'
      : 'S–F Fibonacci Pyramid Tier List',
    includesJointSignature: true,
    featuredAlbumsCount: options.albums.length,
    tierMode: options.gradeBasedTiering ? 'grade' : 'fibonacci',
  }
}

type DrawableAsset = HTMLImageElement | HTMLCanvasElement

function getDrawableSize(asset: DrawableAsset): { w: number; h: number } {
  if ('naturalWidth' in asset) {
    return {
      w: asset.naturalWidth || asset.width || 100,
      h: asset.naturalHeight || asset.height || 100,
    }
  }
  return {
    w: asset.width || 100,
    h: asset.height || 100,
  }
}

function loadImageElement(
  src: string,
  useCors: boolean,
  timeoutMs = 4000,
): Promise<HTMLImageElement | null> {
  if (!src || typeof Image === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const timer =
      typeof window !== 'undefined'
        ? window.setTimeout(() => {
            if (!settled) {
              settled = true
              resolve(null)
            }
          }, timeoutMs)
        : null

    const finish = (result: HTMLImageElement | null) => {
      if (settled) return
      settled = true
      if (timer !== null && typeof window !== 'undefined') {
        window.clearTimeout(timer)
      }
      resolve(result)
    }

    if (useCors && !src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    img.src = src
  })
}

async function loadImageSafe(
  src: string,
  timeoutMs = 4000,
): Promise<{ asset: DrawableAsset | null; revoke?: () => void }> {
  if (!src) return { asset: null }

  const direct = await loadImageElement(src, true, timeoutMs)
  if (direct) {
    return { asset: direct }
  }

  // Fallback for HTTP cache entries previously fetched without CORS headers
  if (
    !src.startsWith('data:') &&
    !src.startsWith('blob:') &&
    typeof fetch === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null
      const abortTimer =
        controller && typeof window !== 'undefined'
          ? window.setTimeout(() => controller.abort(), timeoutMs)
          : null
      const res = await fetch(src, {
        mode: 'cors',
        cache: 'no-store',
        signal: controller?.signal,
      })
      if (abortTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(abortTimer)
      }
      if (res.ok) {
        const blob = await res.blob()
        const objUrl = URL.createObjectURL(blob)
        const blobImg = await loadImageElement(objUrl, false, timeoutMs)
        if (blobImg) {
          return {
            asset: blobImg,
            revoke: () => URL.revokeObjectURL(objUrl),
          }
        }
        URL.revokeObjectURL(objUrl)
      }
    } catch {
      // Fall through to vinyl placeholder
    }
  }

  return { asset: null }
}

const DEMO_NON_CORS_HOST_SUFFIXES = [
  'mzstatic.com',
  'coverartarchive.org',
  'archive.org',
  'dzcdn.net',
]

function buildDemoCorsProxyUrl(src: string): string | null {
  if (!src) return null
  try {
    const parsed = new URL(src)
    if (parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    const matchesKnownDemoHost = DEMO_NON_CORS_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    )
    if (!matchesKnownDemoHost) return null
    return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=600&h=600&fit=cover&output=png`
  } catch {
    return null
  }
}

async function loadAlbumCoverSafe(
  album: ScoredAlbum,
  isDemo: boolean,
): Promise<{ asset: DrawableAsset | null; revoke?: () => void }> {
  if (!isDemo) {
    return loadImageSafe(album.coverUrl)
  }
  const proxyUrl = buildDemoCorsProxyUrl(album.coverUrl)
  const primary = await loadImageSafe(proxyUrl ?? album.coverUrl)
  if (primary.asset) {
    return primary
  }
  if (album.fallbackCoverUrl) {
    return loadImageSafe(album.fallbackCoverUrl)
  }
  return primary
}

function processSignatureAsset(
  img: DrawableAsset | null,
  mode: 'invert-white-bg' | 'invert-alpha',
): DrawableAsset | null {
  if (!img || typeof document === 'undefined') return img
  try {
    const { w: rawW, h: rawH } = getDrawableSize(img)
    if (rawW <= 0 || rawH <= 0) return img
    const targetH = Math.min(rawH, 600)
    const targetW = Math.max(1, Math.round((rawW / rawH) * targetH))

    const off = document.createElement('canvas')
    off.width = targetW
    off.height = targetH
    const offCtx = off.getContext('2d')
    if (!offCtx) return img

    offCtx.imageSmoothingEnabled = true
    offCtx.imageSmoothingQuality = 'high'
    offCtx.drawImage(img, 0, 0, targetW, targetH)
    const imageData = offCtx.getImageData(0, 0, targetW, targetH)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]

      if (mode === 'invert-white-bg') {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b
        const dark = lum > 242 ? 0 : Math.max(0, 255 - lum)
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        data[i + 3] = Math.round((dark / 255) * a * 0.92)
      } else {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        data[i + 3] = a > 0 ? Math.round(a * 0.92) : 0
      }
    }

    offCtx.putImageData(imageData, 0, 0)
    return off
  } catch {
    return img
  }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle: string | CanvasGradient,
  strokeStyle?: string | CanvasGradient,
  lineWidth = 1,
): void {
  drawRoundedRectPath(ctx, x, y, w, h, r)
  ctx.fillStyle = fillStyle
  ctx.fill()
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return ''
  if (ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = '…'
  const ellipsisWidth = ctx.measureText(ellipsis).width
  if (ellipsisWidth >= maxWidth) return ''
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const slice = text.slice(0, mid)
    if (ctx.measureText(slice).width + ellipsisWidth <= maxWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return `${text.slice(0, low).trimEnd()}${ellipsis}`
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts: {
    font: string
    textColor: string
    bgColor: string | CanvasGradient
    borderColor?: string
    padX?: number
    height?: number
  },
): number {
  ctx.save()
  ctx.font = opts.font
  const padX = opts.padX ?? 14
  const height = opts.height ?? 30
  const textWidth = ctx.measureText(text).width
  const width = textWidth + padX * 2
  fillRoundedRect(
    ctx,
    x,
    y,
    width,
    height,
    height / 2,
    opts.bgColor,
    opts.borderColor,
    1.2,
  )
  ctx.fillStyle = opts.textColor
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(text, x + padX, y + height / 2 + 0.5)
  ctx.restore()
  return width
}

function getRankBadgeColors(rank: number): {
  bg: string | CanvasGradient
  text: string
  border: string
  ctxGradient?: [string, string]
} {
  if (rank === 1) {
    return {
      bg: '#facc15',
      ctxGradient: ['#facc15', '#eab308'],
      text: '#09090b',
      border: '#fef08a',
    }
  }
  if (rank === 2) {
    return {
      bg: '#e2e8f0',
      ctxGradient: ['#e2e8f0', '#94a3b8'],
      text: '#09090b',
      border: 'rgba(255, 255, 255, 0.5)',
    }
  }
  if (rank === 3) {
    return {
      bg: '#fb923c',
      ctxGradient: ['#fb923c', '#ea580c'],
      text: '#09090b',
      border: 'rgba(254, 215, 170, 0.55)',
    }
  }
  return {
    bg: 'rgba(15, 15, 22, 0.88)',
    text: '#ffffff',
    border: 'rgba(255, 255, 255, 0.24)',
  }
}

function drawRankBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rank: number,
  opts?: { height?: number; fontSize?: number; padX?: number },
): number {
  const palette = getRankBadgeColors(rank)
  let fill: string | CanvasGradient = palette.bg
  const h = opts?.height ?? 28
  const fontSize = opts?.fontSize ?? 13
  const padX = opts?.padX ?? 11
  if (palette.ctxGradient) {
    const grad = ctx.createLinearGradient(x, y, x + 56, y + h)
    grad.addColorStop(0, palette.ctxGradient[0])
    grad.addColorStop(1, palette.ctxGradient[1])
    fill = grad
  }
  return drawPill(ctx, x, y, `#${rank}`, {
    font: `800 ${fontSize}px ${FONT_MONO}`,
    textColor: palette.text,
    bgColor: fill,
    borderColor: palette.border,
    padX,
    height: h,
  })
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
): void {
  const clamped = Math.max(0, Math.min(100, pct))
  fillRoundedRect(ctx, x, y, w, h, h / 2, 'rgba(255, 255, 255, 0.1)')
  if (clamped <= 0) return
  const fillW = Math.max(h, (w * clamped) / 100)
  const grad = ctx.createLinearGradient(x, y, x + w, y)
  grad.addColorStop(0, '#1ed760')
  grad.addColorStop(1, '#a855f7')
  fillRoundedRect(ctx, x, y, fillW, h, h / 2, grad)
}

function drawVinylPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  fillRoundedRect(
    ctx,
    x,
    y,
    size,
    size,
    Math.min(14, size * 0.12),
    '#14141d',
    'rgba(255,255,255,0.12)',
  )
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size * 0.34
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#09090b'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
  ctx.fillStyle = '#1ed760'
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.1, 0, Math.PI * 2)
  ctx.fillStyle = '#0b0b10'
  ctx.fill()
  ctx.restore()
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  asset: DrawableAsset | null,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  if (!asset) {
    drawVinylPlaceholder(ctx, x, y, Math.min(w, h))
    return
  }
  ctx.save()
  drawRoundedRectPath(ctx, x, y, w, h, radius)
  ctx.clip()
  const { w: iw, h: ih } = getDrawableSize(asset)
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.drawImage(asset, dx, dy, dw, dh)
  ctx.restore()
}

function drawJointLogoSignaturePill(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
  opts?: {
    height?: number
    logoHeight?: number
    signatureHeight?: number
    reverseOrder?: boolean
  },
): number {
  const pillH = opts?.height ?? 44
  const logoH = opts?.logoHeight ?? 20
  const sigH = opts?.signatureHeight ?? 28
  const padX = 20
  const gap = 14

  const logoDim = logoAsset ? getDrawableSize(logoAsset) : { w: 2402, h: 972 }
  const sigDim = signatureAsset
    ? getDrawableSize(signatureAsset)
    : { w: 600, h: 340 }

  const logoW = Math.round((logoDim.w / Math.max(1, logoDim.h)) * logoH)
  const sigW = Math.round((sigDim.w / Math.max(1, sigDim.h)) * sigH)
  const dotW = 8
  const totalW = padX * 2 + logoW + sigW + dotW + gap * 2

  const x = centerX - totalW / 2
  const y = centerY - pillH / 2

  fillRoundedRect(
    ctx,
    x,
    y,
    totalW,
    pillH,
    pillH / 2,
    'rgba(255, 255, 255, 0.045)',
    'rgba(255, 255, 255, 0.12)',
    1.2,
  )

  const firstIsSig = Boolean(opts?.reverseOrder)
  const firstW = firstIsSig ? sigW : logoW
  const secondW = firstIsSig ? logoW : sigW

  const firstX = x + padX
  const dotX = firstX + firstW + gap + dotW / 2
  const secondX = firstX + firstW + gap + dotW + gap

  const drawLogoAt = (lx: number) => {
    if (logoAsset) {
      ctx.drawImage(logoAsset, lx, centerY - logoH / 2, logoW, logoH)
    } else {
      ctx.save()
      ctx.font = `700 ${Math.round(logoH * 0.9)}px Georgia, serif`
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('RovA', lx + logoW / 2, centerY)
      ctx.restore()
    }
  }

  const drawSigAt = (sx: number) => {
    if (signatureAsset) {
      ctx.drawImage(signatureAsset, sx, centerY - sigH / 2, sigW, sigH)
    } else {
      ctx.save()
      ctx.font = `italic 600 ${Math.round(sigH * 0.65)}px cursive, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('RovA', sx + sigW / 2, centerY)
      ctx.restore()
    }
  }

  if (firstIsSig) {
    drawSigAt(firstX)
    drawLogoAt(secondX)
  } else {
    drawLogoAt(firstX)
    drawSigAt(secondX)
  }

  // Green brand break dot
  ctx.save()
  ctx.beginPath()
  ctx.arc(dotX, centerY, 3.2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(30, 215, 96, 0.78)'
  ctx.fill()
  ctx.restore()

  // Suppress unused variable warning for secondW while keeping symmetric layout clarity
  void secondW
  return totalW
}

function drawBrandSignatureBreak(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  width: number,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
  reverseOrder = false,
): void {
  const centerX = x + width / 2
  const pillW = drawJointLogoSignaturePill(
    ctx,
    centerX,
    centerY,
    logoAsset,
    signatureAsset,
    {
      height: 38,
      logoHeight: 17,
      signatureHeight: 24,
      reverseOrder,
    },
  )

  const lineGap = 18
  const leftEnd = centerX - pillW / 2 - lineGap
  const rightStart = centerX + pillW / 2 + lineGap

  if (leftEnd > x) {
    const leftGrad = ctx.createLinearGradient(x, centerY, leftEnd, centerY)
    leftGrad.addColorStop(0, 'rgba(255, 255, 255, 0)')
    leftGrad.addColorStop(1, 'rgba(255, 255, 255, 0.18)')
    ctx.strokeStyle = leftGrad
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, centerY)
    ctx.lineTo(leftEnd, centerY)
    ctx.stroke()
  }

  const rightEnd = x + width
  if (rightEnd > rightStart) {
    const rightGrad = ctx.createLinearGradient(
      rightStart,
      centerY,
      rightEnd,
      centerY,
    )
    rightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)')
    rightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.strokeStyle = rightGrad
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(rightStart, centerY)
    ctx.lineTo(rightEnd, centerY)
    ctx.stroke()
  }
}

function drawBackgroundAndHeader(
  ctx: CanvasRenderingContext2D,
  options: ShareImageExportOptions,
  spec: ShareImageLayoutSpec,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  // Base background
  ctx.fillStyle = '#0b0b10'
  ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE)

  // Radial SpotKit atmospheric glows
  const gGreen = ctx.createRadialGradient(280, 200, 10, 280, 200, 760)
  gGreen.addColorStop(0, 'rgba(29, 185, 84, 0.18)')
  gGreen.addColorStop(1, 'rgba(29, 185, 84, 0)')
  ctx.fillStyle = gGreen
  ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE)

  const gPurple = ctx.createRadialGradient(1180, 160, 10, 1180, 160, 760)
  gPurple.addColorStop(0, 'rgba(139, 92, 246, 0.22)')
  gPurple.addColorStop(1, 'rgba(139, 92, 246, 0)')
  ctx.fillStyle = gPurple
  ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE)

  const gCyan = ctx.createRadialGradient(720, 1280, 10, 720, 1280, 620)
  gCyan.addColorStop(0, 'rgba(56, 189, 248, 0.10)')
  gCyan.addColorStop(1, 'rgba(56, 189, 248, 0)')
  ctx.fillStyle = gCyan
  ctx.fillRect(0, 0, BASE_SIZE, BASE_SIZE)

  // Outer glass frame
  fillRoundedRect(
    ctx,
    24,
    24,
    1392,
    1392,
    32,
    'rgba(255, 255, 255, 0.02)',
    'rgba(255, 255, 255, 0.10)',
    1.5,
  )

  // Header Row 1: Brand + Layout pills on left, Joint Logo Signature capsule on right
  let px = 48
  const py = 48
  px +=
    drawPill(ctx, px, py, 'SPOTKIT / TOPALBUMS', {
      font: `800 12px ${FONT_MONO}`,
      textColor: '#4ade80',
      bgColor: 'rgba(30, 215, 96, 0.14)',
      borderColor: 'rgba(30, 215, 96, 0.34)',
      padX: 14,
      height: 30,
    }) + 10

  px +=
    drawPill(ctx, px, py, spec.layoutBadge, {
      font: `800 12px ${FONT_SANS}`,
      textColor: '#e9d5ff',
      bgColor: 'rgba(168, 85, 247, 0.18)',
      borderColor: 'rgba(168, 85, 247, 0.42)',
      padX: 14,
      height: 30,
    }) + 10

  drawPill(ctx, px, py, `Rank: ${spec.rankingLabel}`, {
    font: `700 12px ${FONT_SANS}`,
    textColor: 'rgba(255, 255, 255, 0.85)',
    bgColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    padX: 14,
    height: 30,
  })

  // Measure and place Joint Logo Signature pill aligned to right edge x=1392
  const logoDim = logoAsset ? getDrawableSize(logoAsset) : { w: 2402, h: 972 }
  const sigDim = signatureAsset
    ? getDrawableSize(signatureAsset)
    : { w: 600, h: 340 }
  const approxPillW =
    40 +
    Math.round((logoDim.w / Math.max(1, logoDim.h)) * 20) +
    Math.round((sigDim.w / Math.max(1, sigDim.h)) * 28) +
    8 +
    28
  drawJointLogoSignaturePill(
    ctx,
    1392 - approxPillW / 2,
    66,
    logoAsset,
    signatureAsset,
    { height: 46, logoHeight: 20, signatureHeight: 28 },
  )

  // Header Row 2: Main Title + Subtitle on left
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const rawName = options.userDisplayName.trim() || 'Listener'
  const titleText = `${rawName}'s Top Albums`
  ctx.font = `800 40px ${FONT_SANS}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncateText(ctx, titleText, 730), 48, 144)

  ctx.font = `500 16px ${FONT_SANS}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.64)'
  ctx.fillText(
    truncateText(
      ctx,
      `${spec.subtitle} • Weighted by Liked Songs & Heavy Rotation`,
      730,
    ),
    48,
    176,
  )
  ctx.restore()

  // Header Row 2 Right: 4 compact KPI stat badges
  const kpis: { value: string; label: string; color: string }[] = [
    {
      value: options.totalLikedSongs.toLocaleString(),
      label: 'LIKED SONGS',
      color: '#ffffff',
    },
    {
      value: String(options.albums.length),
      label: 'ALBUMS',
      color: '#ffffff',
    },
    {
      value: String(options.noSkipCount),
      label: '★ NO-SKIP',
      color: '#4ade80',
    },
    {
      value: String(options.topBoostedCount),
      label: '🔥 TOP 50',
      color: '#c084fc',
    },
  ]
  const kpiW = 132
  const kpiH = 64
  const kpiGap = 10
  const kpiStartX = 1392 - (kpis.length * kpiW + (kpis.length - 1) * kpiGap)
  const kpiY = 114
  kpis.forEach((k, idx) => {
    const kx = kpiStartX + idx * (kpiW + kpiGap)
    fillRoundedRect(
      ctx,
      kx,
      kpiY,
      kpiW,
      kpiH,
      14,
      'rgba(0, 0, 0, 0.28)',
      'rgba(255, 255, 255, 0.09)',
      1,
    )
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `800 22px ${FONT_MONO}`
    ctx.fillStyle = k.color
    ctx.fillText(k.value, kx + 14, kpiY + 34)

    ctx.font = `700 10px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
    ctx.fillText(k.label, kx + 14, kpiY + 52)
    ctx.restore()
  })

  // Divider line under header
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(48, 198)
  ctx.lineTo(1392, 198)
  ctx.stroke()
}

function drawGridAlbumCard(
  ctx: CanvasRenderingContext2D,
  album: ScoredAlbum,
  rank: number,
  x: number,
  y: number,
  w: number,
  h: number,
  coverAsset: DrawableAsset | null,
): void {
  const isTop1 = rank === 1
  fillRoundedRect(
    ctx,
    x,
    y,
    w,
    h,
    22,
    'rgba(255, 255, 255, 0.045)',
    isTop1 ? 'rgba(250, 204, 21, 0.45)' : 'rgba(255, 255, 255, 0.11)',
    isTop1 ? 1.8 : 1.2,
  )

  const coverBannerH = Math.round(h * 0.62)

  // Backdrop cover tint clipped to top rounded corners
  ctx.save()
  drawRoundedRectPath(ctx, x, y, w, coverBannerH, 22)
  ctx.clip()
  ctx.fillStyle = '#14141d'
  ctx.fillRect(x, y, w, coverBannerH)
  if (coverAsset) {
    ctx.globalAlpha = 0.28
    drawCoverImage(ctx, coverAsset, x - 20, y - 20, w + 40, coverBannerH + 40, 0)
    ctx.globalAlpha = 1
  }
  const fade = ctx.createLinearGradient(x, y, x, y + coverBannerH)
  fade.addColorStop(0, 'rgba(11, 11, 16, 0.25)')
  fade.addColorStop(1, 'rgba(11, 11, 16, 0.85)')
  ctx.fillStyle = fade
  ctx.fillRect(x, y, w, coverBannerH)
  ctx.restore()

  // Centered crisp 1:1 square cover inside banner
  const sqSize = Math.min(w - 48, coverBannerH - 22)
  const sqX = x + (w - sqSize) / 2
  const sqY = y + (coverBannerH - sqSize) / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 8
  fillRoundedRect(ctx, sqX, sqY, sqSize, sqSize, 12, '#14141d')
  ctx.restore()
  drawCoverImage(ctx, coverAsset, sqX, sqY, sqSize, sqSize, 12)

  // Rank badge top-left
  drawRankBadge(ctx, x + 14, y + 14, rank, { height: 28, fontSize: 13 })

  // Score pill top-right
  const scoreText = `${album.finalScore.toFixed(1)} pts`
  ctx.save()
  ctx.font = `800 12px ${FONT_MONO}`
  const scoreW = ctx.measureText(scoreText).width + 22
  ctx.restore()
  drawPill(ctx, x + w - 14 - scoreW, y + 14, scoreText, {
    font: `800 12px ${FONT_MONO}`,
    textColor: '#d8b4fe',
    bgColor: 'rgba(15, 15, 24, 0.88)',
    borderColor: 'rgba(168, 85, 247, 0.48)',
    padX: 11,
    height: 28,
  })

  // Metadata footer
  const bodyY = y + coverBannerH
  const padX = 18
  const innerW = w - padX * 2

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.font = `800 19px ${FONT_SANS}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncateText(ctx, album.name, innerW), x + padX, bodyY + 28)

  const artistStr = album.artists.map((a) => a.name).join(', ')
  const subStr = `${artistStr} • ${album.releaseYear}`
  ctx.font = `500 13.5px ${FONT_SANS}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.66)'
  ctx.fillText(truncateText(ctx, subStr, innerW), x + padX, bodyY + 51)

  const pct = Math.round(album.proportionLiked * 100)
  const unlikedCount = Math.max(0, album.totalTracks - album.likedCount)

  ctx.font = `800 13px ${FONT_MONO}`
  ctx.fillStyle = '#4ade80'
  const pctStr = `${pct}%`
  ctx.fillText(pctStr, x + padX, bodyY + 80)
  const pctW = ctx.measureText(pctStr).width

  ctx.font = `600 12.5px ${FONT_SANS}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.fillText(
    ` (${album.likedCount}/${album.totalTracks} liked)`,
    x + padX + pctW,
    bodyY + 80,
  )

  // Right-aligned tag on completion line
  ctx.textAlign = 'right'
  if (isNoSkipAlbum(album)) {
    ctx.font = `700 12px ${FONT_SANS}`
    ctx.fillStyle = '#facc15'
    ctx.fillText('★ No-Skip', x + w - padX, bodyY + 80)
  } else if (album.topTracksCount > 0) {
    ctx.font = `700 12px ${FONT_SANS}`
    ctx.fillStyle = '#fdba74'
    ctx.fillText(
      `🔥 ${album.topTracksCount} Top`,
      x + w - padX,
      bodyY + 80,
    )
  } else {
    ctx.font = `500 12px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.48)'
    ctx.fillText(`${unlikedCount} left`, x + w - padX, bodyY + 80)
  }
  ctx.restore()

  drawProgressBar(ctx, x + padX, bodyY + 94, innerW, 8, pct)
}

function drawGridLayout(
  ctx: CanvasRenderingContext2D,
  albums: ScoredAlbum[],
  covers: Map<string, DrawableAsset | null>,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  const featured = albums.slice(0, 9)
  if (featured.length === 0) return

  const areaX = 48
  const areaY = 212
  const areaW = 1344
  const areaH = 1104

  if (featured.length <= 4) {
    const cols = featured.length === 1 ? 1 : 2
    const rows = featured.length <= 2 ? 1 : 2
    const gapX = 28
    const cardW = cols === 1 ? 520 : 486
    const cardH = rows === 1 ? 540 : 478
    const totalGridW = cols * cardW + (cols - 1) * gapX
    const startX = areaX + (areaW - totalGridW) / 2
    const breakH = 58
    const totalH = rows * cardH + breakH + (rows > 1 ? 20 : 28)
    const startY = areaY + Math.max(12, (areaH - totalH) / 2)

    featured.forEach((album, idx) => {
      const r = Math.floor(idx / cols)
      const c = idx % cols
      const cx = startX + c * (cardW + gapX)
      const cy = startY + r * (cardH + (rows > 1 ? breakH + 20 : 0))
      drawGridAlbumCard(
        ctx,
        album,
        idx + 1,
        cx,
        cy,
        cardW,
        cardH,
        covers.get(album.key) ?? null,
      )
    })

    const breakY =
      rows === 1
        ? startY + cardH + 38
        : startY + cardH + (breakH + 20) / 2
    drawBrandSignatureBreak(
      ctx,
      areaX,
      breakY,
      areaW,
      logoAsset,
      signatureAsset,
      true,
    )
    return
  }

  // 5..9 albums: 3-column bento grid with Joint Logo Signature Break after Row 2
  const cols = 3
  const rows = Math.ceil(featured.length / cols)
  const gapX = 20
  const cardW = (areaW - gapX * (cols - 1)) / cols
  const cardH = 338
  const rowGap = 16
  const breakH = 52

  const totalContentH =
    rows * cardH +
    (rows > 1 ? rowGap : 0) +
    (rows >= 2 ? breakH : 0) +
    (rows === 3 ? 12 : 0)
  const startY = areaY + Math.max(0, (areaH - totalContentH) / 2)

  featured.forEach((album, idx) => {
    const r = Math.floor(idx / cols)
    const c = idx % cols
    const cx = areaX + c * (cardW + gapX)
    const extraBreakOffset = r >= 2 ? breakH + 12 : 0
    const cy = startY + r * (cardH + rowGap) + extraBreakOffset
    drawGridAlbumCard(
      ctx,
      album,
      idx + 1,
      cx,
      cy,
      cardW,
      cardH,
      covers.get(album.key) ?? null,
    )
  })

  // Render Joint Logo Signature Break between Row 2 and Row 3 (or below Row 2 if <= 6)
  const breakY = startY + 2 * cardH + rowGap + breakH / 2 + 4
  drawBrandSignatureBreak(
    ctx,
    areaX,
    breakY,
    areaW,
    logoAsset,
    signatureAsset,
    true,
  )
}

function drawListLayout(
  ctx: CanvasRenderingContext2D,
  albums: ScoredAlbum[],
  covers: Map<string, DrawableAsset | null>,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  const featured = albums.slice(0, 10)
  if (featured.length === 0) return

  const x = 48
  const y = 212
  const w = 1344
  const h = 1104

  fillRoundedRect(
    ctx,
    x,
    y,
    w,
    h,
    22,
    'rgba(255, 255, 255, 0.04)',
    'rgba(255, 255, 255, 0.11)',
    1.2,
  )

  // Table Header Strip
  const headerH = 54
  ctx.save()
  drawRoundedRectPath(ctx, x, y, w, headerH, 22)
  ctx.clip()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)'
  ctx.fillRect(x, y, w, headerH)
  ctx.restore()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y + headerH)
  ctx.lineTo(x + w, y + headerH)
  ctx.stroke()

  const cols = {
    rank: 76,
    album: 160,
    artist: 572,
    year: 828,
    liked: 904,
    pct: 1008,
    topHits: 1172,
    scoreRight: 1364,
  }

  ctx.save()
  ctx.font = `800 11px ${FONT_SANS}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
  ctx.textBaseline = 'middle'
  const hy = y + headerH / 2
  ctx.textAlign = 'left'
  ctx.fillText('RANK', cols.rank, hy)
  ctx.fillText('ALBUM', cols.album, hy)
  ctx.fillText('ARTIST', cols.artist, hy)
  ctx.fillText('YEAR', cols.year, hy)
  ctx.fillText('LIKED', cols.liked, hy)
  ctx.fillText('% LIKED', cols.pct, hy)
  ctx.fillText('TOP 50 HITS', cols.topHits, hy)
  ctx.textAlign = 'right'
  ctx.fillText('SCORE', cols.scoreRight, hy)
  ctx.restore()

  const dividerAfterIdx = featured.length >= 5 ? 4 : featured.length - 1
  const dividerH = 62
  const availRowsH = h - headerH - dividerH - 12
  const rowH = Math.min(98, Math.floor(availRowsH / featured.length))

  let cursorY = y + headerH + 4
  featured.forEach((album, idx) => {
    const rank = idx + 1
    const midY = cursorY + rowH / 2

    if (idx % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.015)'
      ctx.fillRect(x + 2, cursorY, w - 4, rowH)
    }

    // Rank pill
    drawRankBadge(ctx, cols.rank, midY - 14, rank, {
      height: 28,
      fontSize: 13,
      padX: 11,
    })

    // Cover + Album Title + Badges
    const thumbSize = Math.min(58, rowH - 24)
    drawCoverImage(
      ctx,
      covers.get(album.key) ?? null,
      cols.album,
      midY - thumbSize / 2,
      thumbSize,
      thumbSize,
      10,
    )

    const textX = cols.album + thumbSize + 14
    const maxAlbumTitleW = cols.artist - textX - 18
    const hasSubBadge =
      isNoSkipAlbum(album) || album.mergedEditionNames.length > 1

    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `800 16px ${FONT_SANS}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(
      truncateText(ctx, album.name, maxAlbumTitleW),
      textX,
      hasSubBadge ? midY - 4 : midY + 5,
    )
    ctx.restore()

    if (hasSubBadge) {
      let bx = textX
      const by = midY + 7
      if (isNoSkipAlbum(album)) {
        bx +=
          drawPill(ctx, bx, by, '★ No-Skip', {
            font: `700 10.5px ${FONT_SANS}`,
            textColor: '#facc15',
            bgColor: 'rgba(250, 204, 21, 0.14)',
            borderColor: 'rgba(250, 204, 21, 0.34)',
            padX: 8,
            height: 20,
          }) + 6
      }
      if (album.mergedEditionNames.length > 1) {
        drawPill(
          ctx,
          bx,
          by,
          `✨ ${album.mergedEditionNames.length} editions`,
          {
            font: `700 10.5px ${FONT_SANS}`,
            textColor: '#7dd3fc',
            bgColor: 'rgba(56, 189, 248, 0.14)',
            borderColor: 'rgba(56, 189, 248, 0.30)',
            padX: 8,
            height: 20,
          },
        )
      }
    }

    // Artist
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = `500 14.5px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.fillText(
      truncateText(
        ctx,
        album.artists.map((a) => a.name).join(', '),
        cols.year - cols.artist - 16,
      ),
      cols.artist,
      midY,
    )

    // Year
    ctx.font = `600 14px ${FONT_MONO}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
    ctx.fillText(album.releaseYear, cols.year, midY)

    // Liked / Total
    ctx.font = `700 14px ${FONT_MONO}`
    ctx.fillStyle = '#ffffff'
    const likedStr = `${album.likedCount}`
    ctx.fillText(likedStr, cols.liked, midY)
    const likedW = ctx.measureText(likedStr).width
    ctx.font = `500 14px ${FONT_MONO}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
    ctx.fillText(` / ${album.totalTracks}`, cols.liked + likedW, midY)

    // % Liked + mini bar
    const pct = Math.round(album.proportionLiked * 100)
    ctx.font = `800 14px ${FONT_MONO}`
    ctx.fillStyle = '#4ade80'
    ctx.fillText(`${pct}%`, cols.pct, midY)
    ctx.restore()
    drawProgressBar(ctx, cols.pct + 48, midY - 4, 92, 8, pct)

    // Top 50 Hits badge
    if (album.topTracksCount > 0) {
      drawPill(
        ctx,
        cols.topHits,
        midY - 12,
        `🔥 ${album.topTracksCount} Top`,
        {
          font: `700 11.5px ${FONT_SANS}`,
          textColor: '#fdba74',
          bgColor: 'rgba(249, 115, 22, 0.16)',
          borderColor: 'rgba(249, 115, 22, 0.34)',
          padX: 10,
          height: 24,
        },
      )
    } else {
      ctx.save()
      ctx.font = `600 14px ${FONT_SANS}`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.textBaseline = 'middle'
      ctx.fillText('—', cols.topHits + 8, midY)
      ctx.restore()
    }

    // Score pill right-aligned
    const scoreStr = album.finalScore.toFixed(1)
    ctx.save()
    ctx.font = `800 13px ${FONT_MONO}`
    const pillW = ctx.measureText(scoreStr).width + 22
    ctx.restore()
    drawPill(ctx, cols.scoreRight - pillW, midY - 14, scoreStr, {
      font: `800 13px ${FONT_MONO}`,
      textColor: '#d8b4fe',
      bgColor: 'rgba(168, 85, 247, 0.2)',
      borderColor: 'rgba(168, 85, 247, 0.42)',
      padX: 11,
      height: 28,
    })

    cursorY += rowH

    // Row separator
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + 20, cursorY)
    ctx.lineTo(x + w - 20, cursorY)
    ctx.stroke()

    if (idx === dividerAfterIdx) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.022)'
      ctx.fillRect(x + 2, cursorY, w - 4, dividerH)
      drawBrandSignatureBreak(
        ctx,
        x + 24,
        cursorY + dividerH / 2,
        w - 48,
        logoAsset,
        signatureAsset,
        false,
      )
      cursorY += dividerH
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
      ctx.beginPath()
      ctx.moveTo(x + 20, cursorY)
      ctx.lineTo(x + w - 20, cursorY)
      ctx.stroke()
    }
  })
}

function drawTierLayout(
  ctx: CanvasRenderingContext2D,
  options: ShareImageExportOptions,
  covers: Map<string, DrawableAsset | null>,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  const groups: FibonacciTierGroup[] = options.gradeBasedTiering
    ? buildGradeTierGroups(options.albums)
    : buildFibonacciTierGroups(options.albums)

  if (groups.length === 0) return

  const areaX = 48
  const areaY = 212
  const areaW = 1344
  const areaH = 1104

  const breakAfterIdx =
    groups.length > 3 ? 2 : Math.max(0, groups.length - 1)
  const breakH = 48
  const gapY = 12
  const totalGapSpace = gapY * groups.length
  const rowH = Math.min(
    186,
    Math.floor((areaH - breakH - totalGapSpace) / groups.length),
  )

  const totalUsedH =
    groups.length * rowH + breakH + gapY * groups.length
  let cursorY = areaY + Math.max(0, Math.floor((areaH - totalUsedH) / 2))

  groups.forEach((group, gIdx) => {
    const rowX = areaX
    const rowW = areaW

    fillRoundedRect(
      ctx,
      rowX,
      cursorY,
      rowW,
      rowH,
      18,
      'rgba(255, 255, 255, 0.04)',
      'rgba(255, 255, 255, 0.10)',
      1.2,
    )

    // Left badge column
    const badgeColW = 132
    ctx.save()
    drawRoundedRectPath(ctx, rowX, cursorY, rowW, rowH, 18)
    ctx.clip()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'
    ctx.fillRect(rowX, cursorY, badgeColW, rowH)
    ctx.restore()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(rowX + badgeColW, cursorY)
    ctx.lineTo(rowX + badgeColW, cursorY + rowH)
    ctx.stroke()

    const [gStart, gEnd, letterFg] =
      TIER_GRADIENTS[group.tierLetter] ?? TIER_GRADIENTS.F
    const badgeSize = Math.min(58, rowH - 54)
    const badgeX = rowX + (badgeColW - badgeSize) / 2
    const badgeY = cursorY + Math.max(14, (rowH - badgeSize - 38) / 2)

    const grad = ctx.createLinearGradient(
      badgeX,
      badgeY,
      badgeX + badgeSize,
      badgeY + badgeSize,
    )
    grad.addColorStop(0, gStart)
    grad.addColorStop(1, gEnd)
    fillRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 14, grad)

    ctx.save()
    ctx.font = `900 ${Math.round(badgeSize * 0.52)}px ${FONT_SANS}`
    ctx.fillStyle = letterFg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(group.tierLetter, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1)

    const subLabel = options.gradeBasedTiering
      ? GRADE_THRESHOLD_LABELS[group.tierLetter]
      : FIB_TIER_SUB_LABELS[group.tierLetter]
    ctx.font = `700 11px ${FONT_MONO}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(
      subLabel ?? '',
      rowX + badgeColW / 2,
      badgeY + badgeSize + 18,
    )

    ctx.font = `500 11px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.48)'
    ctx.fillText(
      `${group.totalItems} ${group.totalItems === 1 ? 'album' : 'albums'}`,
      rowX + badgeColW / 2,
      badgeY + badgeSize + 34,
    )
    ctx.restore()

    // Right tiles strip
    const flatItems = group.levels.flatMap((l) => l.items)
    const stripX = rowX + badgeColW + 18
    const stripW = rowW - badgeColW - 36

    if (flatItems.length === 0) {
      ctx.save()
      ctx.font = `500 14px ${FONT_SANS}`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.46)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('No albums in this score range', stripX + 6, cursorY + rowH / 2)
      ctx.restore()
    } else {
      const maxSlots = 7
      const tileGap = 12
      const tileW = Math.floor((stripW - (maxSlots - 1) * tileGap) / maxSlots)
      const tileH = rowH - 24
      const tileY = cursorY + 12

      const hasOverflow = flatItems.length > maxSlots
      const visibleItems = hasOverflow
        ? flatItems.slice(0, maxSlots - 1)
        : flatItems

      visibleItems.forEach(({ album, rank }, tIdx) => {
        const tx = stripX + tIdx * (tileW + tileGap)
        fillRoundedRect(
          ctx,
          tx,
          tileY,
          tileW,
          tileH,
          12,
          'rgba(255, 255, 255, 0.035)',
          'rgba(255, 255, 255, 0.09)',
          1,
        )

        const coverPad = 8
        const maxCoverW = tileW - coverPad * 2
        const maxCoverH = tileH - 52
        const coverSize = Math.max(40, Math.min(maxCoverW, maxCoverH))
        const coverX = tx + (tileW - coverSize) / 2
        const coverY = tileY + 8

        drawCoverImage(
          ctx,
          covers.get(album.key) ?? null,
          coverX,
          coverY,
          coverSize,
          coverSize,
          8,
        )

        // Small #rank overlay
        drawRankBadge(ctx, coverX + 4, coverY + 4, rank, {
          height: 19,
          fontSize: 10,
          padX: 6,
        })

        // Small %/pts overlay bottom-right of cover
        const pct = Math.round(album.proportionLiked * 100)
        const metricLabel =
          group.tierLetter === 'S'
            ? '100%'
            : options.gradeBasedTiering
              ? `${album.finalScore.toFixed(0)} pts`
              : `${pct}%`
        ctx.save()
        ctx.font = `800 9.5px ${FONT_MONO}`
        const mW = ctx.measureText(metricLabel).width + 12
        ctx.restore()
        drawPill(
          ctx,
          coverX + coverSize - mW - 4,
          coverY + coverSize - 22,
          metricLabel,
          {
            font: `800 9.5px ${FONT_MONO}`,
            textColor: '#4ade80',
            bgColor: 'rgba(12, 12, 18, 0.88)',
            borderColor: 'rgba(74, 222, 128, 0.38)',
            padX: 6,
            height: 18,
          },
        )

        // Title + Artist
        ctx.save()
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.font = `700 12px ${FONT_SANS}`
        ctx.fillStyle = '#ffffff'
        ctx.fillText(
          truncateText(ctx, album.name, tileW - 14),
          tx + 7,
          coverY + coverSize + 17,
        )

        ctx.font = `500 10.5px ${FONT_SANS}`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
        ctx.fillText(
          truncateText(ctx, album.primaryArtist, tileW - 14),
          tx + 7,
          coverY + coverSize + 32,
        )
        ctx.restore()
      })

      if (hasOverflow) {
        const overflowCount = flatItems.length - (maxSlots - 1)
        const ox = stripX + (maxSlots - 1) * (tileW + tileGap)
        fillRoundedRect(
          ctx,
          ox,
          tileY,
          tileW,
          tileH,
          12,
          'rgba(255, 255, 255, 0.025)',
          'rgba(255, 255, 255, 0.14)',
          1.2,
        )
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `800 24px ${FONT_MONO}`
        ctx.fillStyle = '#c084fc'
        ctx.fillText(`+${overflowCount}`, ox + tileW / 2, tileY + tileH / 2 - 12)
        ctx.font = `600 11.5px ${FONT_SANS}`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.68)'
        ctx.fillText('more in', ox + tileW / 2, tileY + tileH / 2 + 12)
        ctx.fillText(
          `${group.tierLetter} tier`,
          ox + tileW / 2,
          tileY + tileH / 2 + 28,
        )
        ctx.restore()
      }
    }

    cursorY += rowH + gapY

    if (gIdx === breakAfterIdx) {
      drawBrandSignatureBreak(
        ctx,
        areaX,
        cursorY + breakH / 2 - gapY / 2,
        areaW,
        logoAsset,
        signatureAsset,
        false,
      )
      cursorY += breakH
    }
  })
}

function drawFooterSignatureBar(
  ctx: CanvasRenderingContext2D,
  spec: ShareImageLayoutSpec,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  const centerY = 1364

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(48, 1326)
  ctx.lineTo(1392, 1326)
  ctx.stroke()

  drawBrandSignatureBreak(
    ctx,
    270,
    centerY,
    900,
    logoAsset,
    signatureAsset,
    false,
  )

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `800 15px ${FONT_SANS}`
  ctx.fillStyle = '#1ed760'
  ctx.fillText('SpotKit', 48, centerY)
  const spotW = ctx.measureText('SpotKit').width
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillText(' / TopAlbums', 48 + spotW, centerY)

  ctx.textAlign = 'right'
  ctx.font = `600 13px ${FONT_MONO}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
  ctx.fillText(`1:1 Share Card • ${spec.layoutBadge}`, 1392, centerY)
  ctx.restore()
}

function drawArtistAlbumCard(
  ctx: CanvasRenderingContext2D,
  entry: { album: ScoredAlbum; globalRank: number; artistRank: number },
  artistSummary: ArtistGroupSummary,
  x: number,
  y: number,
  w: number,
  h: number,
  coverAsset: DrawableAsset | null,
): void {
  const { album, globalRank, artistRank } = entry
  const isTop1 = artistRank === 1

  fillRoundedRect(
    ctx,
    x,
    y,
    w,
    h,
    22,
    'rgba(255, 255, 255, 0.045)',
    isTop1 ? 'rgba(250, 204, 21, 0.45)' : 'rgba(255, 255, 255, 0.11)',
    isTop1 ? 1.8 : 1.2,
  )

  const coverBannerH = Math.round(h * 0.56)

  ctx.save()
  drawRoundedRectPath(ctx, x, y, w, coverBannerH, 22)
  ctx.clip()
  ctx.fillStyle = '#14141d'
  ctx.fillRect(x, y, w, coverBannerH)
  if (coverAsset) {
    ctx.globalAlpha = 0.28
    drawCoverImage(ctx, coverAsset, x - 20, y - 20, w + 40, coverBannerH + 40, 0)
    ctx.globalAlpha = 1
  }
  const fade = ctx.createLinearGradient(x, y, x, y + coverBannerH)
  fade.addColorStop(0, 'rgba(11, 11, 16, 0.24)')
  fade.addColorStop(1, 'rgba(11, 11, 16, 0.88)')
  ctx.fillStyle = fade
  ctx.fillRect(x, y, w, coverBannerH)
  ctx.restore()

  const sqSize = Math.min(w - 48, coverBannerH - 18)
  const sqX = x + (w - sqSize) / 2
  const sqY = y + (coverBannerH - sqSize) / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 6
  fillRoundedRect(ctx, sqX, sqY, sqSize, sqSize, 12, '#14141d')
  ctx.restore()
  drawCoverImage(ctx, coverAsset, sqX, sqY, sqSize, sqSize, 12)

  // Top-left: Artist #rank badge + Global #rank pill
  const rankBadgeW = drawPill(ctx, x + 12, y + 12, `Artist #${artistRank}`, {
    font: `800 11.5px ${FONT_MONO}`,
    textColor: isTop1 ? '#09090b' : '#ffffff',
    bgColor: isTop1 ? '#facc15' : 'rgba(15, 15, 22, 0.88)',
    borderColor: isTop1 ? '#fef08a' : 'rgba(255, 255, 255, 0.24)',
    padX: 10,
    height: 26,
  })
  drawPill(ctx, x + 12 + rankBadgeW + 6, y + 12, `Global #${globalRank}`, {
    font: `700 11px ${FONT_MONO}`,
    textColor: 'rgba(255, 255, 255, 0.85)',
    bgColor: 'rgba(15, 15, 22, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    padX: 9,
    height: 26,
  })

  // Top-right: score pill
  const scoreText = `${album.finalScore.toFixed(1)} pts`
  ctx.save()
  ctx.font = `800 11.5px ${FONT_MONO}`
  const scoreW = ctx.measureText(scoreText).width + 20
  ctx.restore()
  drawPill(ctx, x + w - 12 - scoreW, y + 12, scoreText, {
    font: `800 11.5px ${FONT_MONO}`,
    textColor: '#d8b4fe',
    bgColor: 'rgba(15, 15, 24, 0.88)',
    borderColor: 'rgba(168, 85, 247, 0.48)',
    padX: 10,
    height: 26,
  })

  // Metadata footer with extra artist comparison metadata
  const bodyY = y + coverBannerH
  const padX = 16
  const innerW = w - padX * 2

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.font = `700 12.5px ${FONT_MONO}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
  const yearW = ctx.measureText(album.releaseYear).width

  ctx.font = `800 17.5px ${FONT_SANS}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(
    truncateText(ctx, album.name, innerW - yearW - 10),
    x + padX,
    bodyY + 25,
  )

  ctx.textAlign = 'right'
  ctx.font = `700 12.5px ${FONT_MONO}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.58)'
  ctx.fillText(album.releaseYear, x + w - padX, bodyY + 25)

  // Extra artist metadata line
  const sharePct =
    artistSummary.totalLikedTracks > 0
      ? Math.round((album.likedCount / artistSummary.totalLikedTracks) * 100)
      : 0
  const delta = album.finalScore - artistSummary.averageScore
  const deltaStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs avg`
  ctx.textAlign = 'left'
  ctx.font = `600 12.5px ${FONT_SANS}`
  ctx.fillStyle = '#7dd3fc'
  ctx.fillText(
    truncateText(ctx, `${sharePct}% of artist likes • ${deltaStr}`, innerW),
    x + padX,
    bodyY + 47,
  )

  const pct = Math.round(album.proportionLiked * 100)
  const unlikedCount = Math.max(0, album.totalTracks - album.likedCount)

  ctx.font = `800 12.5px ${FONT_MONO}`
  ctx.fillStyle = '#4ade80'
  const pctStr = `${pct}%`
  ctx.fillText(pctStr, x + padX, bodyY + 74)
  const pctW = ctx.measureText(pctStr).width

  ctx.font = `600 12px ${FONT_SANS}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.fillText(
    ` (${album.likedCount}/${album.totalTracks} liked)`,
    x + padX + pctW,
    bodyY + 74,
  )

  ctx.textAlign = 'right'
  if (isNoSkipAlbum(album)) {
    ctx.font = `700 11.5px ${FONT_SANS}`
    ctx.fillStyle = '#facc15'
    ctx.fillText('★ No-Skip', x + w - padX, bodyY + 74)
  } else if (album.topTracksCount > 0) {
    ctx.font = `700 11.5px ${FONT_SANS}`
    ctx.fillStyle = '#fdba74'
    ctx.fillText(
      `🔥 ${album.topTracksCount} Top`,
      x + w - padX,
      bodyY + 74,
    )
  } else {
    ctx.font = `500 11.5px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.48)'
    ctx.fillText(`${unlikedCount} left`, x + w - padX, bodyY + 74)
  }
  ctx.restore()

  drawProgressBar(ctx, x + padX, bodyY + 88, innerW, 7.5, pct)
}

function drawArtistCardsLayout(
  ctx: CanvasRenderingContext2D,
  artistSummary: ArtistGroupSummary | undefined,
  covers: Map<string, DrawableAsset | null>,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  if (!artistSummary) return

  const areaX = 48
  const areaW = 1344
  const spotlightY = 212
  const spotlightH = 142

  // Artist Metadata Spotlight Card
  const cardGrad = ctx.createLinearGradient(
    areaX,
    spotlightY,
    areaX + areaW,
    spotlightY + spotlightH,
  )
  cardGrad.addColorStop(0, 'rgba(30, 215, 96, 0.11)')
  cardGrad.addColorStop(1, 'rgba(168, 85, 247, 0.12)')
  fillRoundedRect(
    ctx,
    areaX,
    spotlightY,
    areaW,
    spotlightH,
    22,
    cardGrad,
    'rgba(74, 222, 128, 0.30)',
    1.4,
  )

  let px = areaX + 22
  const py = spotlightY + 18
  px +=
    drawPill(ctx, px, py, 'ARTIST SPOTLIGHT', {
      font: `800 11px ${FONT_MONO}`,
      textColor: '#052e16',
      bgColor: '#4ade80',
      padX: 11,
      height: 24,
    }) + 8
  px +=
    drawPill(ctx, px, py, `Era ${artistSummary.eraSpan}`, {
      font: `700 11px ${FONT_MONO}`,
      textColor: '#e9d5ff',
      bgColor: 'rgba(168, 85, 247, 0.24)',
      borderColor: 'rgba(168, 85, 247, 0.45)',
      padX: 11,
      height: 24,
    }) + 8
  drawPill(ctx, px, py, `Best Global #${artistSummary.bestGlobalRank}`, {
    font: `700 11px ${FONT_MONO}`,
    textColor: '#fde68a',
    bgColor: 'rgba(250, 204, 21, 0.16)',
    borderColor: 'rgba(250, 204, 21, 0.36)',
    padX: 11,
    height: 24,
  })

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 34px ${FONT_SANS}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(
    truncateText(ctx, artistSummary.artistName, 580),
    areaX + 22,
    spotlightY + 90,
  )

  const topTracksTicker =
    artistSummary.topTracksList.length > 0
      ? `🔥 Top 50 Hits: ${artistSummary.topTracksList
          .slice(0, 3)
          .map((t) => `#${t.bestRank} ${t.trackName}`)
          .join(' • ')}`
      : `${artistSummary.albums.length} qualifying ${artistSummary.albums.length === 1 ? 'album' : 'albums'} • Peak: ${artistSummary.peakAlbum.name}`
  ctx.font = `600 13px ${FONT_SANS}`
  ctx.fillStyle =
    artistSummary.topTracksList.length > 0
      ? '#fdba74'
      : 'rgba(255, 255, 255, 0.68)'
  ctx.fillText(
    truncateText(ctx, topTracksTicker, 580),
    areaX + 22,
    spotlightY + 120,
  )
  ctx.restore()

  // Right 4 Artist Metadata KPI cards
  const artistKpis = [
    {
      label: 'CATALOG LIKED',
      val: `${Math.round(artistSummary.catalogCompletionProportion * 100)}%`,
      sub: `${artistSummary.totalLikedTracks}/${artistSummary.totalCatalogTracks} tracks`,
      color: '#4ade80',
    },
    {
      label: 'ALBUMS RANKED',
      val: String(artistSummary.albums.length),
      sub: `${artistSummary.noSkipCount} ★ No-Skip`,
      color: '#ffffff',
    },
    {
      label: 'AVG / PEAK',
      val: artistSummary.averageScore.toFixed(1),
      sub: `Peak ${artistSummary.peakScore.toFixed(1)} pts`,
      color: '#c084fc',
    },
    {
      label: 'TOP 50 HITS',
      val: String(artistSummary.topTracksCount),
      sub: 'Heavy Rotation',
      color: '#fdba74',
    },
  ]
  const kpiW = 166
  const kpiH = 104
  const kpiGap = 10
  const kpiStartX =
    areaX + areaW - 22 - (artistKpis.length * kpiW + (artistKpis.length - 1) * kpiGap)
  const kpiY = spotlightY + 19

  artistKpis.forEach((k, idx) => {
    const kx = kpiStartX + idx * (kpiW + kpiGap)
    fillRoundedRect(
      ctx,
      kx,
      kpiY,
      kpiW,
      kpiH,
      14,
      'rgba(11, 11, 16, 0.56)',
      'rgba(255, 255, 255, 0.10)',
      1,
    )
    ctx.save()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 10px ${FONT_MONO}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.54)'
    ctx.fillText(k.label, kx + 14, kpiY + 24)

    ctx.font = `800 28px ${FONT_MONO}`
    ctx.fillStyle = k.color
    ctx.fillText(k.val, kx + 14, kpiY + 62)

    ctx.font = `500 11.5px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.68)'
    ctx.fillText(truncateText(ctx, k.sub, kpiW - 24), kx + 14, kpiY + 86)
    ctx.restore()
  })

  // Album Grid below spotlight
  const gridY = 370
  const gridH = 946
  const featured = artistSummary.albums.slice(0, 9)
  if (featured.length === 0) return

  if (featured.length <= 2) {
    const cols = featured.length
    const gapX = 28
    const cardW = cols === 1 ? 520 : 496
    const cardH = 520
    const totalW = cols * cardW + (cols - 1) * gapX
    const startX = areaX + (areaW - totalW) / 2
    const breakH = 54
    const startY = gridY + Math.max(12, (gridH - (cardH + breakH + 24)) / 2)

    featured.forEach((entry, idx) => {
      const cx = startX + idx * (cardW + gapX)
      drawArtistAlbumCard(
        ctx,
        entry,
        artistSummary,
        cx,
        startY,
        cardW,
        cardH,
        covers.get(entry.album.key) ?? null,
      )
    })

    drawBrandSignatureBreak(
      ctx,
      areaX,
      startY + cardH + 38,
      areaW,
      logoAsset,
      signatureAsset,
      true,
    )
    return
  }

  if (featured.length <= 4) {
    const cols = 2
    const gapX = 28
    const cardW = 500
    const cardH = 416
    const breakH = 48
    const totalW = cols * cardW + gapX
    const startX = areaX + (areaW - totalW) / 2
    const totalH = cardH * 2 + breakH + 18
    const startY = gridY + Math.max(0, (gridH - totalH) / 2)

    featured.forEach((entry, idx) => {
      const r = Math.floor(idx / cols)
      const c = idx % cols
      const cx = startX + c * (cardW + gapX)
      const cy = startY + r * (cardH + breakH + 18)
      drawArtistAlbumCard(
        ctx,
        entry,
        artistSummary,
        cx,
        cy,
        cardW,
        cardH,
        covers.get(entry.album.key) ?? null,
      )
    })

    drawBrandSignatureBreak(
      ctx,
      areaX,
      startY + cardH + (breakH + 18) / 2,
      areaW,
      logoAsset,
      signatureAsset,
      true,
    )
    return
  }

  const cols = 3
  const rows = Math.ceil(featured.length / cols)
  const gapX = 20
  const cardW = (areaW - gapX * (cols - 1)) / cols
  const cardH = rows === 2 ? 408 : 286
  const rowGap = rows === 2 ? 18 : 14
  const breakH = 46
  const totalH =
    rows * cardH +
    (rows > 1 ? rowGap : 0) +
    breakH +
    (rows === 3 ? 12 : 0)
  const startY = gridY + Math.max(0, (gridH - totalH) / 2)

  featured.forEach((entry, idx) => {
    const r = Math.floor(idx / cols)
    const c = idx % cols
    const cx = areaX + c * (cardW + gapX)
    const extraBreak = r >= 2 ? breakH + 12 : 0
    const cy = startY + r * (cardH + rowGap) + extraBreak
    drawArtistAlbumCard(
      ctx,
      entry,
      artistSummary,
      cx,
      cy,
      cardW,
      cardH,
      covers.get(entry.album.key) ?? null,
    )
  })

  const breakY =
    rows === 2
      ? startY + 2 * cardH + rowGap + breakH / 2 + 4
      : startY + 2 * cardH + rowGap + breakH / 2 + 4
  drawBrandSignatureBreak(
    ctx,
    areaX,
    breakY,
    areaW,
    logoAsset,
    signatureAsset,
    true,
  )
}

function drawArtistCustomTierLayout(
  ctx: CanvasRenderingContext2D,
  options: ShareImageExportOptions,
  artistSummary: ArtistGroupSummary | undefined,
  covers: Map<string, DrawableAsset | null>,
  logoAsset: DrawableAsset | null,
  signatureAsset: DrawableAsset | null,
): void {
  if (!artistSummary) return

  const areaX = 48
  const areaW = 1344
  const bannerY = 212
  const bannerH = 114

  const bannerGrad = ctx.createLinearGradient(
    areaX,
    bannerY,
    areaX + areaW,
    bannerY + bannerH,
  )
  bannerGrad.addColorStop(0, 'rgba(168, 85, 247, 0.15)')
  bannerGrad.addColorStop(1, 'rgba(30, 215, 96, 0.10)')
  fillRoundedRect(
    ctx,
    areaX,
    bannerY,
    areaW,
    bannerH,
    20,
    bannerGrad,
    'rgba(168, 85, 247, 0.36)',
    1.4,
  )

  const rawUser = options.userDisplayName.trim() || 'Listener'
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 32px ${FONT_SANS}`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(
    truncateText(
      ctx,
      `${artistSummary.artistName} — Discography Tier Ranking`,
      850,
    ),
    areaX + 24,
    bannerY + 52,
  )

  const subLine = `Ranked by ${rawUser} • ${Math.round(artistSummary.catalogCompletionProportion * 100)}% Catalog Liked (${artistSummary.totalLikedTracks}/${artistSummary.totalCatalogTracks} songs) • Era ${artistSummary.eraSpan}`
  ctx.font = `500 15px ${FONT_SANS}`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.fillText(truncateText(ctx, subLine, 850), areaX + 24, bannerY + 86)
  ctx.restore()

  const compareText = 'COMPARE YOUR TIERS'
  ctx.save()
  ctx.font = `800 11.5px ${FONT_MONO}`
  const compareW = ctx.measureText(compareText).width + 24
  ctx.restore()
  drawPill(ctx, areaX + areaW - 24 - compareW, bannerY + 24, compareText, {
    font: `800 11.5px ${FONT_MONO}`,
    textColor: '#052e16',
    bgColor: '#4ade80',
    padX: 12,
    height: 26,
  })

  const rightBadgeText =
    artistSummary.topTracksCount > 0
      ? `🔥 ${artistSummary.topTracksCount} Top 50 Hits`
      : `★ ${artistSummary.noSkipCount} No-Skip Albums`
  ctx.save()
  ctx.font = `700 12px ${FONT_SANS}`
  const rbW = ctx.measureText(rightBadgeText).width + 22
  ctx.restore()
  drawPill(ctx, areaX + areaW - 24 - rbW, bannerY + 62, rightBadgeText, {
    font: `700 12px ${FONT_SANS}`,
    textColor: artistSummary.topTracksCount > 0 ? '#fdba74' : '#fde68a',
    bgColor: 'rgba(11, 11, 16, 0.62)',
    borderColor:
      artistSummary.topTracksCount > 0
        ? 'rgba(249, 115, 22, 0.42)'
        : 'rgba(250, 204, 21, 0.38)',
    padX: 11,
    height: 26,
  })

  const tiers =
    options.customArtistTiers ?? buildDefaultArtistTierMap(artistSummary)

  const boardY = 342
  const boardH = 974
  const breakH = 44
  const gapY = 10
  const rowH = Math.floor((boardH - breakH - gapY * 6) / 6)

  let cursorY = boardY
  let runningRank = 1

  TIER_LETTER_LIST.forEach((tierLetter, gIdx) => {
    const tierAlbums = tiers[tierLetter] ?? []

    fillRoundedRect(
      ctx,
      areaX,
      cursorY,
      areaW,
      rowH,
      18,
      'rgba(255, 255, 255, 0.04)',
      'rgba(255, 255, 255, 0.10)',
      1.2,
    )

    const badgeColW = 128
    ctx.save()
    drawRoundedRectPath(ctx, areaX, cursorY, areaW, rowH, 18)
    ctx.clip()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'
    ctx.fillRect(areaX, cursorY, badgeColW, rowH)
    ctx.restore()

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(areaX + badgeColW, cursorY)
    ctx.lineTo(areaX + badgeColW, cursorY + rowH)
    ctx.stroke()

    const [gStart, gEnd, letterFg] =
      TIER_GRADIENTS[tierLetter] ?? TIER_GRADIENTS.F
    const badgeSize = 52
    const badgeX = areaX + (badgeColW - badgeSize) / 2
    const badgeY = cursorY + Math.max(12, (rowH - badgeSize - 26) / 2)

    const grad = ctx.createLinearGradient(
      badgeX,
      badgeY,
      badgeX + badgeSize,
      badgeY + badgeSize,
    )
    grad.addColorStop(0, gStart)
    grad.addColorStop(1, gEnd)
    fillRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 13, grad)

    ctx.save()
    ctx.font = `900 28px ${FONT_SANS}`
    ctx.fillStyle = letterFg
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tierLetter, badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 1)

    ctx.font = `600 11px ${FONT_SANS}`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.54)'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(
      `${tierAlbums.length} ${tierAlbums.length === 1 ? 'album' : 'albums'}`,
      areaX + badgeColW / 2,
      badgeY + badgeSize + 20,
    )
    ctx.restore()

    const stripX = areaX + badgeColW + 18
    const stripW = areaW - badgeColW - 36

    if (tierAlbums.length === 0) {
      ctx.save()
      ctx.font = `500 13.5px ${FONT_SANS}`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('Empty tier', stripX + 6, cursorY + rowH / 2)
      ctx.restore()
    } else {
      const maxSlots = 7
      const tileGap = 12
      const tileW = Math.floor((stripW - (maxSlots - 1) * tileGap) / maxSlots)
      const tileH = rowH - 20
      const tileY = cursorY + 10
      const hasOverflow = tierAlbums.length > maxSlots
      const visible = hasOverflow
        ? tierAlbums.slice(0, maxSlots - 1)
        : tierAlbums

      visible.forEach((album, tIdx) => {
        const tierItemRank = runningRank + tIdx
        const tx = stripX + tIdx * (tileW + tileGap)
        fillRoundedRect(
          ctx,
          tx,
          tileY,
          tileW,
          tileH,
          12,
          'rgba(255, 255, 255, 0.035)',
          'rgba(255, 255, 255, 0.09)',
          1,
        )

        const coverSize = Math.max(40, Math.min(tileW - 16, tileH - 46))
        const coverX = tx + (tileW - coverSize) / 2
        const coverY = tileY + 6

        drawCoverImage(
          ctx,
          covers.get(album.key) ?? null,
          coverX,
          coverY,
          coverSize,
          coverSize,
          8,
        )

        drawRankBadge(ctx, coverX + 4, coverY + 4, tierItemRank, {
          height: 18,
          fontSize: 9.5,
          padX: 5,
        })

        const pct = Math.round(album.proportionLiked * 100)
        const metricLabel = `${pct}%`
        ctx.save()
        ctx.font = `800 9.5px ${FONT_MONO}`
        const mW = ctx.measureText(metricLabel).width + 10
        ctx.restore()
        drawPill(
          ctx,
          coverX + coverSize - mW - 4,
          coverY + coverSize - 21,
          metricLabel,
          {
            font: `800 9.5px ${FONT_MONO}`,
            textColor: '#4ade80',
            bgColor: 'rgba(12, 12, 18, 0.88)',
            borderColor: 'rgba(74, 222, 128, 0.38)',
            padX: 5,
            height: 17,
          },
        )

        ctx.save()
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.font = `700 11.5px ${FONT_SANS}`
        ctx.fillStyle = '#ffffff'
        ctx.fillText(
          truncateText(ctx, album.name, tileW - 14),
          tx + 7,
          coverY + coverSize + 15,
        )

        ctx.font = `500 10.5px ${FONT_SANS}`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
        ctx.fillText(
          truncateText(
            ctx,
            `${album.likedCount}/${album.totalTracks} liked`,
            tileW - 14,
          ),
          tx + 7,
          coverY + coverSize + 29,
        )
        ctx.restore()
      })

      if (hasOverflow) {
        const overflowCount = tierAlbums.length - (maxSlots - 1)
        const ox = stripX + (maxSlots - 1) * (tileW + tileGap)
        fillRoundedRect(
          ctx,
          ox,
          tileY,
          tileW,
          tileH,
          12,
          'rgba(255, 255, 255, 0.025)',
          'rgba(255, 255, 255, 0.14)',
          1.2,
        )
        ctx.save()
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `800 22px ${FONT_MONO}`
        ctx.fillStyle = '#c084fc'
        ctx.fillText(`+${overflowCount}`, ox + tileW / 2, tileY + tileH / 2 - 10)
        ctx.font = `600 11px ${FONT_SANS}`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.68)'
        ctx.fillText(
          `more in ${tierLetter} tier`,
          ox + tileW / 2,
          tileY + tileH / 2 + 12,
        )
        ctx.restore()
      }
      runningRank += tierAlbums.length
    }

    cursorY += rowH + gapY

    if (gIdx === 2) {
      drawBrandSignatureBreak(
        ctx,
        areaX,
        cursorY + breakH / 2 - gapY / 2,
        areaW,
        logoAsset,
        signatureAsset,
        false,
      )
      cursorY += breakH
    }
  })
}

function collectAlbumsToLoad(
  options: ShareImageExportOptions,
): ScoredAlbum[] {
  if (options.viewLayout === 'artist') {
    const artistSummary =
      options.artistSummary ?? buildArtistGroups(options.albums)[0]
    if (!artistSummary) return []
    if (options.artistExportMode === 'custom-tier') {
      const tiers =
        options.customArtistTiers ?? buildDefaultArtistTierMap(artistSummary)
      const selected = new Map<string, ScoredAlbum>()
      for (const tierLetter of TIER_LETTER_LIST) {
        const list = tiers[tierLetter] ?? []
        const slice = list.length > 7 ? list.slice(0, 6) : list
        for (const album of slice) {
          selected.set(album.key, album)
        }
      }
      return Array.from(selected.values())
    }
    return artistSummary.albums.slice(0, 9).map((e) => e.album)
  }
  if (options.viewLayout === 'grid') {
    return options.albums.slice(0, 9)
  }
  if (options.viewLayout === 'list') {
    return options.albums.slice(0, 10)
  }
  const groups = options.gradeBasedTiering
    ? buildGradeTierGroups(options.albums)
    : buildFibonacciTierGroups(options.albums)
  const selected = new Map<string, ScoredAlbum>()
  for (const g of groups) {
    const flat = g.levels.flatMap((l) => l.items)
    const slice = flat.length > 7 ? flat.slice(0, 6) : flat
    for (const item of slice) {
      selected.set(item.album.key, item.album)
    }
  }
  return Array.from(selected.values())
}

export async function renderShareImageCanvas(
  options: ShareImageExportOptions,
): Promise<HTMLCanvasElement> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas export requires a browser document environment.')
  }

  const spec = getShareImageLayoutSpec(options)
  const canvas = document.createElement('canvas')
  canvas.width = spec.width
  canvas.height = spec.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context for image export.')
  }

  const resolvedArtistSummary =
    options.viewLayout === 'artist'
      ? (options.artistSummary ?? buildArtistGroups(options.albums)[0])
      : undefined

  const albumsToLoad = collectAlbumsToLoad({
    ...options,
    artistSummary: resolvedArtistSummary,
  })
  const revokers: (() => void)[] = []

  const [rawLogoRes, rawSigRes, ...coverResults] = await Promise.all([
    loadImageSafe(options.brandLogoSrc),
    loadImageSafe(options.signatureSrc),
    ...albumsToLoad.map((album) =>
      loadAlbumCoverSafe(album, Boolean(options.isDemo)).then((res) => ({
        key: album.key,
        res,
      })),
    ),
  ])

  if (rawLogoRes.revoke) revokers.push(rawLogoRes.revoke)
  if (rawSigRes.revoke) revokers.push(rawSigRes.revoke)

  const coverMap = new Map<string, DrawableAsset | null>()
  for (const entry of coverResults) {
    if (entry.res.revoke) revokers.push(entry.res.revoke)
    coverMap.set(entry.key, entry.res.asset)
  }

  const logoAsset = processSignatureAsset(rawLogoRes.asset, 'invert-white-bg')
  const signatureAsset = processSignatureAsset(
    rawSigRes.asset,
    'invert-alpha',
  )

  try {
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (spec.width !== BASE_SIZE) {
      const scale = spec.width / BASE_SIZE
      ctx.scale(scale, scale)
    }

    drawBackgroundAndHeader(ctx, options, spec, logoAsset, signatureAsset)

    if (options.viewLayout === 'artist') {
      if (options.artistExportMode === 'custom-tier') {
        drawArtistCustomTierLayout(
          ctx,
          options,
          resolvedArtistSummary,
          coverMap,
          logoAsset,
          signatureAsset,
        )
      } else {
        drawArtistCardsLayout(
          ctx,
          resolvedArtistSummary,
          coverMap,
          logoAsset,
          signatureAsset,
        )
      }
    } else if (options.viewLayout === 'grid') {
      drawGridLayout(ctx, options.albums, coverMap, logoAsset, signatureAsset)
    } else if (options.viewLayout === 'list') {
      drawListLayout(ctx, options.albums, coverMap, logoAsset, signatureAsset)
    } else {
      drawTierLayout(ctx, options, coverMap, logoAsset, signatureAsset)
    }

    drawFooterSignatureBar(ctx, spec, logoAsset, signatureAsset)
    ctx.restore()
  } finally {
    for (const revoke of revokers) {
      revoke()
    }
  }

  return canvas
}

function triggerUrlDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = url
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function downloadShareImage(
  options: ShareImageExportOptions,
): Promise<ShareImageLayoutSpec> {
  const spec = getShareImageLayoutSpec(options)
  const canvas = await renderShareImageCanvas(options)

  const blob = await new Promise<Blob | null>((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((b) => resolve(b), 'image/png')
    } else {
      resolve(null)
    }
  })

  if (
    blob &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    const objectUrl = URL.createObjectURL(blob)
    triggerUrlDownload(objectUrl, spec.filename)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } else {
    const dataUrl = canvas.toDataURL('image/png')
    triggerUrlDownload(dataUrl, spec.filename)
  }

  return spec
}
