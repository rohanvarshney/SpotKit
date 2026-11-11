import { useState } from 'react'
import {
  clearSpotifyConfigOverride,
  getCustomSpotifyOverride,
  getEffectiveSpotifyConfig,
  setSpotifyConfigOverride,
} from '../config/spotify'

interface LoginViewProps {
  onLoginClick: () => void
  onStartDemo: (withLoadingPreview: boolean) => void
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
  // Never pre-populate hardcoded credentials—only show user-supplied overrides if set
  const [clientIdInput, setClientIdInput] = useState(
    initialOverride.clientIdOverride,
  )
  const [redirectInput, setRedirectInput] = useState(
    initialOverride.redirectUriOverride,
  )
  const [savedBanner, setSavedBanner] = useState<string | null>(null)

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault()
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
    clearSpotifyConfigOverride()
    setClientIdInput('')
    setRedirectInput('')
    setEffective(getEffectiveSpotifyConfig())
    setSavedBanner('✓ Reverted to built-in default credentials')
    setTimeout(() => setSavedBanner(null), 2800)
  }

  return (
    <div className="loginContainer">
      <div className="card heroCard">
        <div className="heroBadge">SPOTKIT • TOP ALBUMS</div>
        <h1 className="heroTitle">
          Discover the albums you <span>actually finish.</span>
        </h1>
        <p className="heroLead">
          Most stats tools only count play frequency. <strong>TopAlbums</strong>{' '}
          scans your Spotify <em>Liked Songs</em>, hydrates full album
          tracklists, and ranks your true favourite records by completion
          proportion, volume, and your Top 50 tracks.
        </p>

        <div className="featurePills">
          <span className="pill">📊 Bayesian % Liked Scoring</span>
          <span className="pill">🔥 Top 50 Tracks Boost</span>
          <span className="pill">✨ Deluxe / Remaster Deduplication</span>
          <span className="pill">🎵 Full Tracklist Diff (Liked vs. Missed)</span>
        </div>

        {error && <div className="errorBox">{error}</div>}

        <div className="ctaRow">
          <button
            type="button"
            className="button spotifyBtn"
            onClick={onLoginClick}
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
            onClick={() => onStartDemo(true)}
          >
            ▶ Try Interactive Demo (with Loading Screen)
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={() => onStartDemo(false)}
          >
            Skip to Demo Dashboard
          </button>
        </div>

        <div className="configSection">
          <button
            type="button"
            className="textLinkBtn"
            onClick={() => setShowConfig((v) => !v)}
          >
            {showConfig ? '▾' : '▸'} Developer Settings (Custom PKCE Override){' '}
            {effective.hasCustomOverride ? (
              <span className="statusTag warn">Custom Override Active</span>
            ) : (
              <span className="statusTag ok">Built-in Credentials Active</span>
            )}
          </button>

          {showConfig && (
            <form className="configForm" onSubmit={handleSaveConfig}>
              <p className="configHint">
                <strong>TopAlbums is already pre-configured</strong> with
                built-in Spotify OAuth PKCE credentials (hidden for security).
                Only enter values below if you have registered your own Spotify
                Developer App and want to override the default Client ID or
                Redirect URI.
              </p>
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
