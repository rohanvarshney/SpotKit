// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useState } from 'react'
import {
  clearSpotifyConfigOverride,
  getCustomSpotifyOverride,
  getEffectiveSpotifyConfig,
  setSpotifyConfigOverride,
} from '../config/spotify'
import { clearSpotifySession } from '../lib/spotifyAuth'

interface LoginViewProps {
  onLoginClick: (forceDialog?: boolean) => void
  onStartDemo: () => void
  error: string | null
}

export function LoginView({
  onLoginClick,
  onStartDemo,
  error,
}: LoginViewProps) {
  const initialOverride = getCustomSpotifyOverride()
  const [effective, setEffective] = useState(() => getEffectiveSpotifyConfig())
  const [showConfig, setShowConfig] = useState(false)
  const [clientIdInput, setClientIdInput] = useState(
    initialOverride.clientIdOverride,
  )
  const [redirectInput, setRedirectInput] = useState(
    initialOverride.redirectUriOverride,
  )
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [copiedRedirect, setCopiedRedirect] = useState(false)

  const isAllowlist403Error = Boolean(
    error &&
      (error.includes('(403)') ||
        /not registered|developer\.spotify\.com/i.test(error)),
  )

  const handleCopyRedirectUri = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(effective.redirectUri)
        setCopiedRedirect(true)
        setTimeout(() => setCopiedRedirect(false), 2200)
      }
    } catch {
      // Clipboard may be unavailable; URI remains selectable
    }
  }

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault()
    clearSpotifySession()
    setSpotifyConfigOverride(clientIdInput, redirectInput)
    setEffective(getEffectiveSpotifyConfig())
    setSavedBanner(
      clientIdInput.trim() || redirectInput.trim()
        ? '✓ Custom override saved for this browser'
        : '✓ Reverted to built-in default credentials',
    )
    setTimeout(() => setSavedBanner(null), 2800)
  }

  const handleResetToDefault = () => {
    clearSpotifySession()
    clearSpotifyConfigOverride()
    setClientIdInput('')
    setRedirectInput('')
    setEffective(getEffectiveSpotifyConfig())
    setSavedBanner('✓ Reverted to built-in default credentials')
    setTimeout(() => setSavedBanner(null), 2800)
  }

  const renderRedirectCopyRow = () => (
    <div className="redirectCopyRow">
      <span className="redirectCopyLabel">Redirect URI:</span>
      <code className="inlineCodePill">{effective.redirectUri}</code>
      <button
        type="button"
        className="button secondary small copyUriBtn"
        onClick={() => void handleCopyRedirectUri()}
      >
        {copiedRedirect ? '✓ Copied' : 'Copy Redirect URI'}
      </button>
    </div>
  )

  return (
    <div className="loginContainer">
      <div className="card heroCard">
        <div className="heroBadge">SPOTKIT • DJMYPLAYLIST</div>
        <h1 className="heroTitle">
          Automatically sequence any playlist into a{' '}
          <span>seamless DJ set.</span>
        </h1>
        <p className="heroLead">
          The automated counterpart to <em>MakeASet</em>: load your{' '}
          <em>Liked Songs</em> or paste any public Spotify playlist, map every
          track by <strong>song key &amp; BPM</strong>, and let our solver
          sequence the whole crate (or your top <code>X</code> tracks)
          automatically with narrated live thought logs.
        </p>

        <div className="featurePills">
          <span className="pill">💚 Liked Songs or Public Playlist</span>
          <span className="pill">🎡 Full-Crate Song Key + BPM Scan</span>
          <span className="pill">🧠 Recursive + Iterative Solver</span>
          <span className="pill">📜 Narrated Live Thought Logs</span>
          <span className="pill">🚀 One-Click Spotify Export</span>
        </div>

        {error &&
          (isAllowlist403Error ? (
            <div className="errorBox allowlistErrorBox" role="alert">
              <div className="allowlistErrorTitle">
                Spotify Development Mode — Account Not on Allowlist (403)
              </div>
              <p className="allowlistErrorLead">
                Spotify restricts apps in Development Mode to 25 manually
                allowlisted accounts. Your Spotify login succeeded, but your
                account hasn&apos;t been added to this app&apos;s invite list
                yet.
              </p>
              <ol className="allowlistErrorList">
                <li>
                  <strong>Ask the app owner for an invite:</strong> Share your{' '}
                  <strong>name</strong> and{' '}
                  <strong>Spotify account email</strong> so they can add you in{' '}
                  <strong>
                    Spotify Developer Dashboard → Settings → User Management
                  </strong>
                  .
                </li>
                <li>
                  <strong>Or use your own free Client ID (instant):</strong>{' '}
                  Create an app at{' '}
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="allowlistLink"
                  >
                    developer.spotify.com/dashboard
                  </a>
                  , add this site&apos;s Redirect URI, and paste your Client ID
                  in <strong>Developer Settings</strong> below.
                  {renderRedirectCopyRow()}
                </li>
              </ol>
              <div className="allowlistErrorActions">
                <button
                  type="button"
                  className="button small"
                  onClick={() => setShowConfig(true)}
                >
                  Use My Own Client ID ↓
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => onLoginClick(true)}
                >
                  Switch Spotify Account
                </button>
                <button
                  type="button"
                  className="button demoBtn small"
                  onClick={onStartDemo}
                >
                  ▶ Try Interactive Demo
                </button>
              </div>
            </div>
          ) : (
            <div className="errorBox" role="alert">
              {error}
            </div>
          ))}

        <div className="ctaRow">
          <button
            type="button"
            className="button spotifyBtn"
            onClick={() => onLoginClick(isAllowlist403Error)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Connect with Spotify
          </button>

          <button
            type="button"
            className="button demoBtn"
            onClick={onStartDemo}
          >
            ▶ Try Interactive Demo
          </button>
        </div>

        <div className="configSection">
          <button
            type="button"
            className="textLinkBtn"
            onClick={() => setShowConfig((v) => !v)}
          >
            {showConfig ? '▾' : '▸'} Developer Settings (Custom Override){' '}
            {effective.hasCustomOverride ? (
              <span className="statusTag warn">Custom Override Active</span>
            ) : (
              <span className="statusTag ok">Built-in Credentials Active</span>
            )}
          </button>

          {showConfig && (
            <form className="configForm" onSubmit={handleSaveConfig}>
              <div className="configHint">
                <p>
                  <strong>DJMyPlaylist is pre-configured</strong> with
                  SpotKit&apos;s Spotify client credentials. Only
                  enter values below if you have registered your own Spotify
                  Developer App and want to override the Client ID or Redirect
                  URI.
                </p>
                {renderRedirectCopyRow()}
              </div>
              <div className="formGrid">
                <label className="label">
                  Custom Spotify Client ID (Optional Override)
                  <input
                    type="password"
                    autoComplete="off"
                    className="input"
                    placeholder="Using built-in Client ID (enter to override)"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                  />
                </label>
                <label className="label">
                  Custom Redirect URI (Optional Override)
                  <input
                    type="text"
                    autoComplete="off"
                    className="input"
                    placeholder="Using built-in Redirect URI (enter to override)"
                    value={redirectInput}
                    onChange={(e) => setRedirectInput(e.target.value)}
                  />
                </label>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="submit" className="button small">
                  Apply Custom Override
                </button>
                {effective.hasCustomOverride && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={handleResetToDefault}
                  >
                    Reset to Built-in Default
                  </button>
                )}
                {savedBanner && (
                  <span className="savedNote">{savedBanner}</span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
