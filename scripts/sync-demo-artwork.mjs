// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL))
      const tsPath = path.resolve(parentDir, `${specifier}.ts`)
      if (existsSync(tsPath)) {
        return nextResolve(pathToFileURL(tsPath).href, context)
      }
    }
    return nextResolve(specifier, context)
  },
})

const { SPOTKIT_DEMO_ALBUMS, SPOTKIT_DEMO_CATALOG_VERSION } = await import(
  '../shared/spotkitDemoCatalog.ts'
)

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = path.resolve(
  SCRIPT_DIR,
  '../assets/demoArtworkManifest.json',
)

const ITUNES_MIN_DELAY_MS = 2200
const MB_MIN_DELAY_MS = 1500
const HIGH_CONFIDENCE_THRESHOLD = 85

const JUNK_PATTERN =
  /\b(karaoke|tribute|lullaby|lullabies|8-bit|8 bit|vitamin string|kidz bop|in the style of|made famous|piano tribute|originally performed|string quartet tribute|music box)\b/i

const UNWANTED_VARIANT_PATTERNS = [
  /\binstrumentals?\b/i,
  /\bpiano\b/i,
  /\bremix(?:es)?\b/i,
  /\bb[-\s]?sides?\b/i,
  /\bcommentary\b/i,
  /\ba\s+cappella\b/i,
  /\bacapella\b/i,
  /\bkaraoke\b/i,
  /\bsped\s+up\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\bclean\s+version\b/i,
  /\b8d\s+audio\b/i,
  /\blive\b/i,
]

function hasUnwantedVariant(candidateTitle, catalogTitle) {
  return UNWANTED_VARIANT_PATTERNS.some(
    (re) => re.test(candidateTitle) && !re.test(catalogTitle),
  )
}

const QUERY_HINTS = {
  alb_currents_b: {
    term: 'Tame Impala Currents B-Sides Remixes',
    albumAliases: [
      'Currents B-Sides & Remixes',
      "Currents (Collector's Edition)",
      'Currents (Deluxe B-Sides & Remixes)',
    ],
  },
  alb_brat_deluxe: {
    term: 'Charli xcx Brat and its the same but theres three more songs',
    albumAliases: [
      "Brat and it's the same but there's three more songs so it's not",
      'BRAT (Deluxe Edition)',
    ],
  },
  alb_silk_sonic: {
    artistAliases: [
      'Bruno Mars, Anderson .Paak & Silk Sonic',
      'Silk Sonic',
      'Bruno Mars',
      'Anderson .Paak',
    ],
    term: 'An Evening with Silk Sonic',
  },
  alb_purple_rain: {
    artistAliases: ['Prince & The Revolution', 'Prince'],
    term: 'Prince Purple Rain',
  },
  alb_ziggy: {
    term: 'David Bowie The Rise and Fall of Ziggy Stardust and the Spiders from Mars',
    albumAliases: [
      'The Rise and Fall of Ziggy Stardust and the Spiders from Mars',
      'The Rise and Fall of Ziggy Stardust',
    ],
  },
  alb_single_ease: {
    artistAliases: ['Chris Lake & Abel Balder', 'Chris Lake'],
    term: 'Chris Lake Ease My Mind',
  },
  alb_1989_tv: {
    requireSubstrings: ["taylor's version"],
  },
  alb_vroom_ep: {
    term: 'Charli xcx Vroom Vroom',
    albumAliases: ['Vroom Vroom', 'Vroom Vroom EP'],
  },
  alb_get_up_ep: {
    term: 'NewJeans Get Up',
    albumAliases: ["NewJeans 2nd EP 'Get Up'", 'Get Up'],
  },
  alb_emotion: {
    term: 'Carly Rae Jepsen Emotion',
    albumAliases: ['Emotion', 'E•MO•TION'],
  },
  alb_lush: {
    term: 'Mitski Be the Cowboy',
  },
}

/**
 * Populate with `{ url, source, width, height, matchedArtist, matchedAlbum }`
 * only if an album cannot be matched cleanly via automated iTunes / CAA lookup.
 */
const MANUAL_OVERRIDES = {}

function normalizeText(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·/\\–—]/g, ' ')
    .replace(/[^a-zA-Z0-9'\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stripAppleSuffix(title) {
  return String(title ?? '')
    .replace(/\s*-\s*(Single|EP)$/i, '')
    .trim()
}

function stripEditionParens(title) {
  return String(title ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toHighResItunesUrl(artworkUrl100) {
  if (!artworkUrl100) return null
  return artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|jpeg|png)$/i, '/600x600bb.jpg')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let lastItunesCallAt = 0
let lastMbCallAt = 0

async function rateLimitItunes() {
  const elapsed = Date.now() - lastItunesCallAt
  if (elapsed < ITUNES_MIN_DELAY_MS) {
    await sleep(ITUNES_MIN_DELAY_MS - elapsed)
  }
  lastItunesCallAt = Date.now()
}

async function rateLimitMb() {
  const elapsed = Date.now() - lastMbCallAt
  if (elapsed < MB_MIN_DELAY_MS) {
    await sleep(MB_MIN_DELAY_MS - elapsed)
  }
  lastMbCallAt = Date.now()
}

const NON_RETRYABLE_NET_CODES = new Set([
  'EPERM',
  'EACCES',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
])

async function fetchJsonWithRetry(url, options = {}, { onThrottle, maxAttempts = 4 } = {}) {
  const backoffs = [15000, 30000, 60000]
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (onThrottle) await onThrottle()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        if (attempt === maxAttempts) {
          throw new Error(`HTTP ${res.status} for ${url}`)
        }
        const waitMs = backoffs[Math.min(attempt - 1, backoffs.length - 1)]
        console.warn(
          `[rate-limit] HTTP ${res.status} on attempt ${attempt}/${maxAttempts}; backing off ${Math.round(waitMs / 1000)}s...`,
        )
        await sleep(waitMs)
        continue
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      return await res.json()
    } catch (err) {
      const code = err?.cause?.code || err?.code
      if (code && NON_RETRYABLE_NET_CODES.has(code)) {
        const netErr = new Error(`${err.message} (${code})`)
        netErr.isNetworkBlocked = true
        throw netErr
      }
      if (attempt === maxAttempts) throw err
      const waitMs = backoffs[Math.min(attempt - 1, backoffs.length - 1)]
      console.warn(
        `[retry] Attempt ${attempt}/${maxAttempts} failed (${err.message}); retrying in ${Math.round(waitMs / 1000)}s...`,
      )
      await sleep(waitMs)
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function verifyImageUrl(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: controller.signal,
      })
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    const ok = (res.status === 200 || res.status === 206) && contentType.startsWith('image/')
    return {
      ok,
      status: res.status,
      contentType,
      finalUrl: res.url || url,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      error: err.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

function getArtistMatchScore(candidateArtistRaw, spec, hints) {
  const candArtist = normalizeText(candidateArtistRaw)
  if (!candArtist) return -200
  const accepted = [
    spec.artistName,
    ...(hints?.artistAliases || []),
  ].map(normalizeText)

  if (accepted.includes(candArtist)) return 70
  for (const alias of accepted) {
    if (!alias) continue
    if (
      candArtist.startsWith(`${alias} `) ||
      candArtist.startsWith(`${alias} &`) ||
      candArtist.includes(` ${alias} `) ||
      candArtist.endsWith(` ${alias}`)
    ) {
      return 50
    }
    if (alias.length >= 4 && candArtist.includes(alias)) {
      return 35
    }
  }
  return -200
}

function scoreItunesCandidate(candidate, spec, hints) {
  const rawArtist = candidate.artistName || ''
  const rawAlbum = candidate.collectionName || ''

  if (JUNK_PATTERN.test(rawArtist) || JUNK_PATTERN.test(rawAlbum)) {
    return -500
  }

  if (hasUnwantedVariant(rawAlbum, spec.name)) {
    return -300
  }

  const isSingleTitle = /\s-\sSingle$/i.test(rawAlbum)
  if (
    spec.albumType === 'album' &&
    spec.tracks.length >= 5 &&
    (isSingleTitle ||
      (typeof candidate.trackCount === 'number' && candidate.trackCount <= 2))
  ) {
    return -300
  }

  const artistScore = getArtistMatchScore(rawArtist, spec, hints)
  if (artistScore < 0) return -300

  const candFull = normalizeText(stripAppleSuffix(rawAlbum))
  const candBase = normalizeText(stripEditionParens(stripAppleSuffix(rawAlbum)))

  if (hints?.requireSubstrings) {
    const rawNorm = normalizeText(rawAlbum)
    for (const sub of hints.requireSubstrings) {
      if (!rawNorm.includes(normalizeText(sub))) {
        return -250
      }
    }
  }

  const expectedTitles = [
    spec.name,
    ...(hints?.albumAliases || []),
  ].map((t) => normalizeText(stripAppleSuffix(t)))
  const expectedBase = normalizeText(stripEditionParens(spec.name))

  let titleScore = -120
  if (expectedTitles.includes(candFull)) {
    titleScore = 80
  } else if (expectedTitles.some((t) => candBase && t === candBase)) {
    titleScore = 62
  } else if (expectedBase && candBase === expectedBase) {
    titleScore = 54
  } else if (
    expectedTitles.some((t) => t.length >= 4 && candFull.includes(t))
  ) {
    titleScore = 10
  } else if (expectedBase.length >= 4 && candBase.includes(expectedBase)) {
    titleScore = 10
  }

  if (titleScore < 0) return -250

  let bonus = 0

  const catalogNorm = normalizeText(spec.name)
  const wantsDeluxe = /\b(deluxe|b-sides|collector|edition|remix)\b/i.test(spec.name)
  const candIsDeluxe = /\b(deluxe|b-sides|collector|expanded|anniversary)\b/i.test(rawAlbum)
  if (wantsDeluxe && candIsDeluxe) {
    bonus += 15
  } else if (!wantsDeluxe && candIsDeluxe) {
    bonus -= 8
  }

  if (catalogNorm.includes("taylor's version") && !normalizeText(rawAlbum).includes("taylor's version")) {
    bonus -= 120
  }

  // Release year closeness
  const catalogYear = Number.parseInt(String(spec.releaseDate || '').slice(0, 4), 10)
  const candYear = Number.parseInt(String(candidate.releaseDate || '').slice(0, 4), 10)
  if (Number.isFinite(catalogYear) && Number.isFinite(candYear)) {
    const diff = Math.abs(catalogYear - candYear)
    if (diff === 0) bonus += 16
    else if (diff === 1) bonus += 10
    else if (diff <= 3) bonus += 3
    else if (diff >= 8) bonus -= 12
  }

  // Track count closeness
  if (typeof candidate.trackCount === 'number' && spec.tracks.length > 0) {
    const diff = Math.abs(candidate.trackCount - spec.tracks.length)
    if (diff === 0) bonus += 14
    else if (diff <= 2) bonus += 7
    else if (spec.albumType === 'single' && candidate.trackCount > 6) bonus -= 18
  }

  // Single vs album indicator
  if (spec.albumType === 'single' && isSingleTitle) bonus += 10
  if (spec.albumType === 'album' && !isSingleTitle) bonus += 6

  // Prefer explicit/standard edition when otherwise tied
  if (candidate.collectionExplicitness === 'explicit') bonus += 2

  if (!candidate.artworkUrl100) return -400

  return artistScore + titleScore + bonus
}

const artistLookupCache = new Map()

async function searchItunes(params) {
  const qs = new URLSearchParams({
    country: 'US',
    entity: 'album',
    ...params,
  })
  const url = `https://itunes.apple.com/search?${qs.toString()}`
  const data = await fetchJsonWithRetry(url, {}, { onThrottle: rateLimitItunes })
  return Array.isArray(data?.results) ? data.results : []
}

async function lookupItunesArtistAlbums(artistId) {
  if (!artistId) return []
  const key = String(artistId)
  if (artistLookupCache.has(key)) {
    return artistLookupCache.get(key)
  }
  const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(key)}&entity=album&limit=100&country=US`
  const data = await fetchJsonWithRetry(url, {}, { onThrottle: rateLimitItunes })
  const collections = Array.isArray(data?.results)
    ? data.results.filter((r) => r.wrapperType === 'collection')
    : []
  artistLookupCache.set(key, collections)
  return collections
}

function pickBestItunesCandidate(candidates, spec, hints) {
  let best = null
  let bestScore = -Infinity
  for (const cand of candidates) {
    const score = scoreItunesCandidate(cand, spec, hints)
    if (score > bestScore) {
      bestScore = score
      best = cand
    }
  }
  return { candidate: best, score: bestScore }
}

function scoreMusicBrainzGroup(group, spec, hints) {
  const rawTitle = group.title || ''
  const creditNames = (group['artist-credit'] || [])
    .map((c) => `${c.name || c.artist?.name || ''}${c.joinphrase || ''}`)
    .join('')
    .trim()

  if (JUNK_PATTERN.test(creditNames) || JUNK_PATTERN.test(rawTitle)) {
    return { score: -500, creditNames }
  }
  if (hasUnwantedVariant(rawTitle, spec.name)) {
    return { score: -300, creditNames }
  }

  const secondaryTypes = Array.isArray(group['secondary-types'])
    ? group['secondary-types']
    : []
  for (const st of secondaryTypes) {
    if (
      /^(live|remix|dj-mix|mixtape\/street)$/i.test(st) &&
      !new RegExp(st.replace(/[^a-z]/gi, ''), 'i').test(spec.name)
    ) {
      return { score: -250, creditNames }
    }
  }

  const artistScore = getArtistMatchScore(creditNames, spec, hints)
  if (artistScore < 0) return { score: -300, creditNames }

  if (hints?.requireSubstrings) {
    const rawNorm = normalizeText(rawTitle)
    for (const sub of hints.requireSubstrings) {
      if (!rawNorm.includes(normalizeText(sub))) {
        return { score: -250, creditNames }
      }
    }
  }

  const candFull = normalizeText(stripAppleSuffix(rawTitle))
  const candBase = normalizeText(stripEditionParens(stripAppleSuffix(rawTitle)))
  const expectedTitles = [
    spec.name,
    ...(hints?.albumAliases || []),
  ].map((t) => normalizeText(stripAppleSuffix(t)))
  const expectedBase = normalizeText(stripEditionParens(spec.name))

  let titleScore = -250
  if (expectedTitles.includes(candFull)) {
    titleScore = 80
  } else if (expectedTitles.some((t) => candBase && t === candBase)) {
    titleScore = 62
  } else if (expectedBase && candBase === expectedBase) {
    titleScore = 54
  } else if (
    expectedTitles.some((t) => t.length >= 4 && candFull.includes(t))
  ) {
    titleScore = 10
  } else if (expectedBase.length >= 4 && candBase.includes(expectedBase)) {
    titleScore = 10
  }

  if (titleScore < 0) return { score: -250, creditNames }

  let bonus = 0
  const pType = String(group['primary-type'] || '').toLowerCase()
  if (spec.albumType === 'album') {
    if (pType === 'album') bonus += 30
    else if (pType === 'single' && spec.tracks.length >= 5) bonus -= 80
    else if (pType === 'ep') bonus -= 30
  } else if (spec.albumType === 'single') {
    if (pType === 'single' || pType === 'ep') bonus += 30
    else if (pType === 'album') bonus -= 30
  }

  const catalogYear = Number.parseInt(String(spec.releaseDate || '').slice(0, 4), 10)
  const candYear = Number.parseInt(String(group['first-release-date'] || '').slice(0, 4), 10)
  if (Number.isFinite(catalogYear) && Number.isFinite(candYear)) {
    const diff = Math.abs(catalogYear - candYear)
    if (diff <= 1) bonus += 15
    else if (diff <= 3) bonus += 5
    else if (diff >= 8) bonus -= 10
  }

  return { score: artistScore + titleScore + bonus, creditNames }
}

async function resolveViaMusicBrainz(spec, hints) {
  const albumQuery = hints?.albumAliases?.[0] || spec.name
  const cleanAlbum = albumQuery.replace(/"/g, '')
  const artistCandidates = Array.from(
    new Set([spec.artistName, ...(hints?.artistAliases || [])].filter(Boolean)),
  )

  let groups = []
  for (const artistQuery of artistCandidates) {
    const cleanArtist = artistQuery.replace(/"/g, '')
    const query = `artist:"${cleanArtist}" AND releasegroup:"${cleanAlbum}"`
    const url = `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=10`

    const data = await fetchJsonWithRetry(
      url,
      {
        headers: {
          'User-Agent': 'SpotKit/1.0 (https://github.com/rohanvarshney/SpotKit)',
          Accept: 'application/json',
        },
      },
      { onThrottle: rateLimitMb },
    )

    groups = Array.isArray(data?.['release-groups'])
      ? data['release-groups']
      : []
    if (groups.length > 0) break
  }

  const scoredGroups = groups
    .map((group) => {
      const { score, creditNames } = scoreMusicBrainzGroup(group, spec, hints)
      return { group, score, creditNames }
    })
    .filter((entry) => entry.group?.id && entry.score >= 60)
    .sort((a, b) => b.score - a.score)

  for (const { group, creditNames } of scoredGroups) {
    const mbid = group.id
    const caaUrl = `https://coverartarchive.org/release-group/${mbid}/front-500`
    const verification = await verifyImageUrl(caaUrl)
    if (verification.ok) {
      return {
        url: caaUrl,
        source: 'coverartarchive',
        width: 500,
        height: 500,
        matchedArtist: creditNames || spec.artistName,
        matchedAlbum: group.title || spec.name,
        mbid,
      }
    }
  }

  return null
}

async function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      catalogVersion: SPOTKIT_DEMO_CATALOG_VERSION,
      generatedAt: new Date().toISOString(),
      albums: {},
    }
  }
  const raw = await fs.readFile(MANIFEST_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  return {
    catalogVersion: SPOTKIT_DEMO_CATALOG_VERSION,
    generatedAt: parsed.generatedAt || new Date().toISOString(),
    albums: parsed.albums && typeof parsed.albums === 'object' ? parsed.albums : {},
  }
}

async function saveManifest(manifest) {
  const sortedAlbums = {}
  for (const key of Object.keys(manifest.albums).sort()) {
    sortedAlbums[key] = manifest.albums[key]
  }
  const output = {
    catalogVersion: SPOTKIT_DEMO_CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    albums: sortedAlbums,
  }
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true })
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
}

async function runAudit(manifest) {
  const entries = manifest.albums || {}
  let missingCount = 0
  for (const spec of SPOTKIT_DEMO_ALBUMS) {
    const hit = entries[spec.id]
    if (!hit) {
      missingCount += 1
      console.log(`${spec.id} | ${spec.artistName} — ${spec.name} => MISSING`)
      continue
    }
    console.log(
      `${spec.id} | ${spec.artistName} — ${spec.name} => ${hit.matchedArtist} — ${hit.matchedAlbum} [${hit.source}]`,
    )
  }
  console.log(
    `\nAudit complete: ${SPOTKIT_DEMO_ALBUMS.length - missingCount}/${SPOTKIT_DEMO_ALBUMS.length} resolved, ${missingCount} missing.`,
  )
}

async function runVerify(manifest) {
  const entries = manifest.albums || {}
  const missing = []
  const failures = []
  let passed = 0

  for (const spec of SPOTKIT_DEMO_ALBUMS) {
    const entry = entries[spec.id]
    if (!entry?.url) {
      missing.push(spec.id)
      continue
    }
    const check = await verifyImageUrl(entry.url)
    if (check.ok) {
      passed += 1
      process.stdout.write('.')
    } else {
      failures.push({
        id: spec.id,
        url: entry.url,
        status: check.status,
        contentType: check.contentType,
        error: check.error,
      })
      process.stdout.write('X')
    }
  }
  process.stdout.write('\n')
  console.log(
    `Verification summary: ${passed}/${SPOTKIT_DEMO_ALBUMS.length} passed, ${missing.length} missing, ${failures.length} failed.`,
  )
  if (missing.length > 0) {
    console.error('Missing IDs:', missing.join(', '))
  }
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(
        `FAILED ${f.id}: ${f.url} (status=${f.status}, type=${f.contentType}${f.error ? `, err=${f.error}` : ''})`,
      )
    }
  }
  if (missing.length > 0 || failures.length > 0) {
    process.exitCode = 1
  }
}

async function resolveAlbum(spec, artistPool) {
  const override = MANUAL_OVERRIDES[spec.id]
  if (override) {
    const verification = await verifyImageUrl(override.url)
    if (verification.ok) {
      return override
    }
    console.warn(`[override-failed] ${spec.id}: ${override.url}`)
  }

  const hints = QUERY_HINTS[spec.id]
  let best = null
  let bestScore = -Infinity
  let directCandidates = []

  if (artistPool && artistPool.length > 0 && !hints?.term) {
    const poolResult = pickBestItunesCandidate(artistPool, spec, hints)
    best = poolResult.candidate
    bestScore = poolResult.score
  }

  if (!best || bestScore < HIGH_CONFIDENCE_THRESHOLD) {
    const searchTerm =
      hints?.term ||
      `${spec.artistName} ${stripEditionParens(spec.name)}`.trim()
    directCandidates = await searchItunes({
      term: searchTerm,
      limit: '15',
    })
    const directResult = pickBestItunesCandidate(directCandidates, spec, hints)
    if (directResult.score > bestScore) {
      best = directResult.candidate
      bestScore = directResult.score
    }
  }

  if (!best || bestScore < HIGH_CONFIDENCE_THRESHOLD) {
    const combinedPool = [...(artistPool || []), ...directCandidates]
    let artistId = combinedPool.find(
      (r) => r.artistId && getArtistMatchScore(r.artistName, spec, hints) >= 50,
    )?.artistId

    if (!artistId) {
      const artistHits = await searchItunes({
        term: hints?.artistAliases?.[0] || spec.artistName,
        entity: 'musicArtist',
        limit: '5',
      })
      artistId = artistHits.find(
        (r) =>
          r.artistId && getArtistMatchScore(r.artistName, spec, hints) >= 50,
      )?.artistId
    }

    if (artistId) {
      const lookupCandidates = await lookupItunesArtistAlbums(artistId)
      const lookupResult = pickBestItunesCandidate(lookupCandidates, spec, hints)
      if (lookupResult.score > bestScore) {
        best = lookupResult.candidate
        bestScore = lookupResult.score
      }
    }
  }

  if (best && bestScore >= HIGH_CONFIDENCE_THRESHOLD) {
    const hiResUrl = toHighResItunesUrl(best.artworkUrl100)
    if (hiResUrl) {
      const check = await verifyImageUrl(hiResUrl)
      if (check.ok) {
        return {
          url: hiResUrl,
          source: 'itunes',
          width: 600,
          height: 600,
          matchedArtist: best.artistName,
          matchedAlbum: best.collectionName,
          score: bestScore,
        }
      }
    }
  }

  console.warn(
    `[fallback-mb] ${spec.id} (${spec.artistName} — ${spec.name}) iTunes score=${bestScore}; trying MusicBrainz + CAA...`,
  )
  const mbHit = await resolveViaMusicBrainz(spec, hints)
  if (mbHit) {
    return mbHit
  }

  // Last resort if iTunes had a decent (< threshold, > 40) verified match
  if (best && bestScore >= 40) {
    const hiResUrl = toHighResItunesUrl(best.artworkUrl100)
    if (hiResUrl) {
      const check = await verifyImageUrl(hiResUrl)
      if (check.ok) {
        console.warn(
          `[low-confidence] ${spec.id}: using ${best.artistName} — ${best.collectionName} (score=${bestScore})`,
        )
        return {
          url: hiResUrl,
          source: 'itunes-low-confidence',
          width: 600,
          height: 600,
          matchedArtist: best.artistName,
          matchedAlbum: best.collectionName,
          score: bestScore,
        }
      }
    }
  }

  return null
}

async function runSync({ refresh, onlyIds }) {
  const manifest = refresh
    ? {
        catalogVersion: SPOTKIT_DEMO_CATALOG_VERSION,
        generatedAt: new Date().toISOString(),
        albums: {},
      }
    : await loadManifest()

  const targetAlbums = SPOTKIT_DEMO_ALBUMS.filter((spec) => {
    if (onlyIds) return onlyIds.has(spec.id)
    return refresh || !manifest.albums[spec.id]?.url
  })

  if (targetAlbums.length === 0) {
    console.log(
      `All ${SPOTKIT_DEMO_ALBUMS.length} albums are already present in ${path.relative(process.cwd(), MANIFEST_PATH)}.`,
    )
    return
  }

  console.log(
    `Resolving artwork for ${targetAlbums.length} of ${SPOTKIT_DEMO_ALBUMS.length} albums...`,
  )

  // Group by artist so multi-album artists share one iTunes artistTerm query
  const byArtist = new Map()
  for (const spec of targetAlbums) {
    const list = byArtist.get(spec.artistName) || []
    list.push(spec)
    byArtist.set(spec.artistName, list)
  }

  const unresolved = []
  let resolvedCount = 0
  let consecutiveNetBlocks = 0

  for (const [artistName, specs] of byArtist.entries()) {
    let artistPool = null
    const allHaveCustomTerm = specs.every((s) => Boolean(QUERY_HINTS[s.id]?.term))
    if (specs.length > 1 && !allHaveCustomTerm) {
      try {
        artistPool = await searchItunes({
          term: artistName,
          attribute: 'artistTerm',
          limit: '50',
        })
        consecutiveNetBlocks = 0
      } catch (err) {
        if (err.isNetworkBlocked) {
          consecutiveNetBlocks += 1
        }
        console.warn(`[artist-query-failed] ${artistName}: ${err.message}`)
      }
    }

    for (const spec of specs) {
      if (consecutiveNetBlocks >= 3 && resolvedCount === 0) {
        console.error(
          '[abort] Network appears unreachable or blocked in this environment.',
        )
        process.exitCode = 1
        return
      }
      try {
        const hit = await resolveAlbum(spec, artistPool)
        if (hit) {
          consecutiveNetBlocks = 0
          manifest.albums[spec.id] = {
            url: hit.url,
            source: hit.source,
            width: hit.width,
            height: hit.height,
            matchedArtist: hit.matchedArtist,
            matchedAlbum: hit.matchedAlbum,
          }
          resolvedCount += 1
          console.log(
            `[ok] ${spec.id} (${spec.artistName} — ${spec.name}) -> ${hit.matchedArtist} — ${hit.matchedAlbum} [${hit.source}]`,
          )
        } else {
          unresolved.push(spec.id)
          console.error(
            `[miss] ${spec.id} (${spec.artistName} — ${spec.name})`,
          )
        }
      } catch (err) {
        if (err.isNetworkBlocked) {
          consecutiveNetBlocks += 1
        }
        unresolved.push(spec.id)
        console.error(
          `[error] ${spec.id} (${spec.artistName} — ${spec.name}): ${err.message}`,
        )
      }
    }

    await saveManifest(manifest)
  }

  console.log(
    `\nSync finished: ${resolvedCount} resolved this run, ${Object.keys(manifest.albums).length}/${SPOTKIT_DEMO_ALBUMS.length} total in manifest.`,
  )
  if (unresolved.length > 0) {
    console.error(`Unresolved (${unresolved.length}): ${unresolved.join(', ')}`)
    process.exitCode = 1
  }
}

function parseArgs(argv) {
  const flags = {
    refresh: false,
    verify: false,
    audit: false,
    onlyIds: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--refresh') flags.refresh = true
    else if (arg === '--verify') flags.verify = true
    else if (arg === '--audit') flags.audit = true
    else if (arg.startsWith('--only=')) {
      const ids = arg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      flags.onlyIds = new Set(ids)
    } else if (arg === '--only' && argv[i + 1]) {
      const ids = argv[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      flags.onlyIds = new Set(ids)
      i += 1
    }
  }
  return flags
}

const flags = parseArgs(process.argv.slice(2))

if (flags.audit) {
  const manifest = await loadManifest()
  await runAudit(manifest)
} else if (flags.verify) {
  const manifest = await loadManifest()
  await runVerify(manifest)
} else {
  await runSync(flags)
}
