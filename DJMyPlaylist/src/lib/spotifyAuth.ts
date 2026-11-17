// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  SPOTIFY_SCOPES,
  getEffectiveSpotifyConfig,
} from '../config/spotify'
import type { AnalyzedCrate, NarrationLogEntry } from '../types/spotify'

const VERIFIER_KEY = 'djmyplaylist_pkce_verifier'
const STATE_KEY = 'djmyplaylist_pkce_state'
const TOKEN_KEY = 'djmyplaylist_spotify_token'
const MAKEASET_TOKEN_KEY = 'makeaset_spotify_token'
const TOPALBUMS_TOKEN_KEY = 'topalbums_spotify_token'
const PENDING_PLAYLIST_STATE_KEY = 'djmyplaylist_pending_set_state'

export interface StoredSpotifyToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  scopes?: string[]
  reusedFromTopAlbums?: boolean
}

export interface PendingPlaylistRestoreState {
  crate: AnalyzedCrate
  maxTracks: number | null
  preferredOpenerId: string | null
  orderedTrackIds: string[]
  narrationLogs: NarrationLogEntry[]
}

function generateRandomString(length: number): string {
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const randomValues = new Uint8Array(length)
  window.crypto.getRandomValues(randomValues)
  return Array.from(randomValues, (byte) => charset[byte % charset.length]).join(
    '',
  )
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  return window.crypto.subtle.digest('SHA-256', data)
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function startSpotifyLogin(options?: {
  forceDialog?: boolean
}): Promise<void> {
  const { clientId, redirectUri, isPlaceholder } = getEffectiveSpotifyConfig()
  if (isPlaceholder) {
    throw new Error(
      'Spotify Client ID is not configured yet. Please set SPOTIFY_CLIENT_ID in src/config/spotify.ts or enter it below.',
    )
  }

  const codeVerifier = generateRandomString(64)
  const state = generateRandomString(24)
  const hashed = await sha256(codeVerifier)
  const codeChallenge = base64UrlEncode(hashed)

  window.sessionStorage.setItem(VERIFIER_KEY, codeVerifier)
  window.sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
    state,
  })
  if (options?.forceDialog) {
    params.set('show_dialog', 'true')
  }

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function handleOAuthCallbackIfPresent(): Promise<string | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const returnedState = url.searchParams.get('state')

  if (error) {
    cleanUrl()
    throw new Error(`Spotify authorization failed: ${error}`)
  }

  if (!code) {
    return getValidAccessToken()
  }

  const expectedState = window.sessionStorage.getItem(STATE_KEY)
  const codeVerifier = window.sessionStorage.getItem(VERIFIER_KEY)

  if (!codeVerifier) {
    cleanUrl()
    throw new Error('Missing PKCE code verifier in session. Please log in again.')
  }

  if (expectedState && returnedState && expectedState !== returnedState) {
    cleanUrl()
    throw new Error('OAuth state mismatch. Please try logging in again.')
  }

  const { clientId, redirectUri } = getEffectiveSpotifyConfig()

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  cleanUrl()
  window.sessionStorage.removeItem(VERIFIER_KEY)
  window.sessionStorage.removeItem(STATE_KEY)

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(
      `Failed to exchange Spotify authorization code (${response.status}): ${errText}`,
    )
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
  }

  const grantedScopes = data.scope
    ? data.scope.split(/\s+/).filter(Boolean)
    : [...SPOTIFY_SCOPES]

  const stored: StoredSpotifyToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    scopes: grantedScopes,
    reusedFromTopAlbums: false,
  }

  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
  return stored.accessToken
}

export async function getValidAccessToken(): Promise<string | null> {
  const ownRaw =
    window.localStorage.getItem(TOKEN_KEY) ||
    window.sessionStorage.getItem(TOKEN_KEY)

  if (ownRaw) {
    const token = await resolveStoredToken(ownRaw, TOKEN_KEY, 'own')
    if (token) return token
  }

  // Convenience: reuse a valid MakeASet token (preserving its write scopes!)
  const makeASetRaw = window.localStorage.getItem(MAKEASET_TOKEN_KEY)
  if (makeASetRaw) {
    const token = await resolveStoredToken(
      makeASetRaw,
      MAKEASET_TOKEN_KEY,
      'makeaset',
    )
    if (token) return token
  }

  // Convenience: reuse a valid TopAlbums token if neither DJMyPlaylist nor MakeASet has one yet
  const topAlbumsRaw = window.localStorage.getItem(TOPALBUMS_TOKEN_KEY)
  if (topAlbumsRaw) {
    const token = await resolveStoredToken(
      topAlbumsRaw,
      TOPALBUMS_TOKEN_KEY,
      'topalbums',
    )
    if (token) return token
  }

  return null
}

async function resolveStoredToken(
  raw: string,
  storageKey: string,
  origin: 'own' | 'makeaset' | 'topalbums',
): Promise<string | null> {
  try {
    const parsed = JSON.parse(raw) as StoredSpotifyToken
    if (Date.now() < parsed.expiresAt) {
      if (origin === 'makeaset') {
        const adopted: StoredSpotifyToken = {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt,
          scopes: parsed.scopes ?? [...SPOTIFY_SCOPES],
          reusedFromTopAlbums: parsed.reusedFromTopAlbums ?? false,
        }
        window.localStorage.setItem(TOKEN_KEY, JSON.stringify(adopted))
      } else if (origin === 'topalbums') {
        const adopted: StoredSpotifyToken = {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt,
          scopes: ['user-library-read', 'user-top-read', 'user-read-private'],
          reusedFromTopAlbums: true,
        }
        window.localStorage.setItem(TOKEN_KEY, JSON.stringify(adopted))
      }
      return parsed.accessToken
    }
    if (parsed.refreshToken) {
      return await refreshAccessToken(
        parsed.refreshToken,
        origin === 'topalbums' || Boolean(parsed.reusedFromTopAlbums),
      )
    }
  } catch {
    window.localStorage.removeItem(storageKey)
  }
  return null
}

async function refreshAccessToken(
  refreshToken: string,
  fromTopAlbumsShared: boolean,
): Promise<string | null> {
  const { clientId } = getEffectiveSpotifyConfig()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    clearSpotifySession()
    return null
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
  }

  const stored: StoredSpotifyToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    scopes: data.scope
      ? data.scope.split(/\s+/).filter(Boolean)
      : fromTopAlbumsShared
        ? ['user-library-read', 'user-top-read', 'user-read-private']
        : [...SPOTIFY_SCOPES],
    reusedFromTopAlbums: fromTopAlbumsShared,
  }
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
  return stored.accessToken
}

export function hasPlaylistWriteScope(): boolean {
  if (typeof window === 'undefined') return false
  const raw = window.localStorage.getItem(TOKEN_KEY)
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as StoredSpotifyToken
    if (
      parsed.reusedFromTopAlbums &&
      !parsed.scopes?.includes('playlist-modify-private') &&
      !parsed.scopes?.includes('playlist-modify-public')
    ) {
      return false
    }
    if (!parsed.scopes) return true
    return (
      parsed.scopes.includes('playlist-modify-private') ||
      parsed.scopes.includes('playlist-modify-public')
    )
  } catch {
    return false
  }
}

export function savePendingPlaylistState(
  state: PendingPlaylistRestoreState,
): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      PENDING_PLAYLIST_STATE_KEY,
      JSON.stringify(state),
    )
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function consumePendingPlaylistState(): PendingPlaylistRestoreState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(PENDING_PLAYLIST_STATE_KEY)
  if (!raw) return null
  window.sessionStorage.removeItem(PENDING_PLAYLIST_STATE_KEY)
  try {
    return JSON.parse(raw) as PendingPlaylistRestoreState
  } catch {
    return null
  }
}

export function clearSpotifySession(): void {
  window.localStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(VERIFIER_KEY)
  window.sessionStorage.removeItem(STATE_KEY)
}

function cleanUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('error')
  const cleanPath = url.pathname.replace(/\/callback\/?$/, '/') || '/'
  window.history.replaceState({}, document.title, cleanPath + url.search)
}
