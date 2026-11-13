// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

/**
 * Hardcoded Spotify OAuth 2.0 PKCE Configuration.
 * These built-in credentials are used by default and are not exposed in the UI override inputs.
 */
export const SPOTIFY_CLIENT_ID: string =
  import.meta.env.VITE_SPOTIFY_CLIENT_ID || 'eef379970a2c4d6d9f3d1bc38a5aa60d'

export const LOCAL_REDIRECT_URI = 'http://127.0.0.1:5173/callback'

/**
 * Automatically resolves the appropriate Redirect URI for local development
 * (`http://127.0.0.1:5173/callback`) vs. deployed GitHub Pages (`https://<user>.github.io/.../callback`).
 */
export function getDefaultRedirectUri(): string {
  if (import.meta.env.VITE_SPOTIFY_REDIRECT_URI) {
    return import.meta.env.VITE_SPOTIFY_REDIRECT_URI
  }
  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin, pathname } = window.location
    if (
      protocol === 'https:' &&
      hostname !== '127.0.0.1' &&
      hostname !== 'localhost'
    ) {
      const cleanPath = pathname
        .replace(/\/callback\/?$/, '/')
        .replace(/\/index\.html$/, '/')
      const normalizedBase = cleanPath.endsWith('/')
        ? cleanPath
        : `${cleanPath}/`
      return `${origin}${normalizedBase}callback`
    }
  }
  return LOCAL_REDIRECT_URI
}

export const SPOTIFY_REDIRECT_URI: string = getDefaultRedirectUri()

export const SPOTIFY_SCOPES: string[] = [
  'user-library-read',
  'user-top-read',
  'user-read-private',
]

const CLIENT_ID_STORAGE_KEY = 'topalbums_spotify_client_id_override'
const REDIRECT_URI_STORAGE_KEY = 'topalbums_spotify_redirect_uri_override'

export function getCustomSpotifyOverride(): {
  clientIdOverride: string
  redirectUriOverride: string
  hasCustomOverride: boolean
} {
  if (typeof window === 'undefined') {
    return {
      clientIdOverride: '',
      redirectUriOverride: '',
      hasCustomOverride: false,
    }
  }
  const clientIdOverride =
    window.localStorage.getItem(CLIENT_ID_STORAGE_KEY)?.trim() || ''
  const redirectUriOverride =
    window.localStorage.getItem(REDIRECT_URI_STORAGE_KEY)?.trim() || ''

  return {
    clientIdOverride,
    redirectUriOverride,
    hasCustomOverride: Boolean(clientIdOverride || redirectUriOverride),
  }
}

export function getEffectiveSpotifyConfig(): {
  clientId: string
  redirectUri: string
  isPlaceholder: boolean
  hasCustomOverride: boolean
} {
  const { clientIdOverride, redirectUriOverride, hasCustomOverride } =
    getCustomSpotifyOverride()

  const clientId = clientIdOverride || SPOTIFY_CLIENT_ID
  const redirectUri = redirectUriOverride || getDefaultRedirectUri()
  const isPlaceholder =
    !clientId || clientId === 'YOUR_SPOTIFY_CLIENT_ID_HERE'

  return { clientId, redirectUri, isPlaceholder, hasCustomOverride }
}

export function setSpotifyConfigOverride(
  clientId: string,
  redirectUri?: string,
): void {
  if (typeof window === 'undefined') return
  if (clientId.trim()) {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim())
  } else {
    window.localStorage.removeItem(CLIENT_ID_STORAGE_KEY)
  }
  if (redirectUri?.trim()) {
    window.localStorage.setItem(REDIRECT_URI_STORAGE_KEY, redirectUri.trim())
  } else {
    window.localStorage.removeItem(REDIRECT_URI_STORAGE_KEY)
  }
}

export function clearSpotifyConfigOverride(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CLIENT_ID_STORAGE_KEY)
  window.localStorage.removeItem(REDIRECT_URI_STORAGE_KEY)
}
