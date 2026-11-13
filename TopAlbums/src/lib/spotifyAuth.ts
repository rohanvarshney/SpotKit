// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  SPOTIFY_SCOPES,
  getEffectiveSpotifyConfig,
} from '../config/spotify'

const VERIFIER_KEY = 'topalbums_pkce_verifier'
const STATE_KEY = 'topalbums_pkce_state'
const TOKEN_KEY = 'topalbums_spotify_token'

export interface StoredSpotifyToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number
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

export async function startSpotifyLogin(): Promise<void> {
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
    throw new Error(`Failed to exchange Spotify authorization code (${response.status}): ${errText}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const stored: StoredSpotifyToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }

  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
  return stored.accessToken
}

export async function getValidAccessToken(): Promise<string | null> {
  const raw =
    window.localStorage.getItem(TOKEN_KEY) ||
    window.sessionStorage.getItem(TOKEN_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StoredSpotifyToken
    if (Date.now() < parsed.expiresAt) {
      return parsed.accessToken
    }
    if (parsed.refreshToken) {
      return await refreshAccessToken(parsed.refreshToken)
    }
  } catch {
    window.localStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(TOKEN_KEY)
  }
  return null
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
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
  }

  const stored: StoredSpotifyToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
  return stored.accessToken
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
