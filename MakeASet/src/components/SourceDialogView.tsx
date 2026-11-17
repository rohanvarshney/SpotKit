// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useState } from 'react'
import { parsePlaylistId } from '../lib/camelotEngine'
import { DEMO_PLAYLIST_PRESETS } from '../mocks/demoData'
import type { SourceMode } from '../types/spotify'

interface SourceDialogViewProps {
  isDemo: boolean
  initialSourceMode: SourceMode
  initialPlaylistUrl: string
  error: string | null
  onContinue: (
    sourceMode: SourceMode,
    playlistUrl: string,
    skipAnimation?: boolean,
  ) => void
  onSwitchAccount: () => void
  onBackToHome: () => void
}

export function SourceDialogView({
  isDemo,
  initialSourceMode,
  initialPlaylistUrl,
  error,
  onContinue,
  onSwitchAccount,
  onBackToHome,
}: SourceDialogViewProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialSourceMode)
  const [playlistUrl, setPlaylistUrl] = useState<string>(initialPlaylistUrl)
  const [validationError, setValidationError] = useState<string | null>(null)

  const trimmedUrl = playlistUrl.trim()
  const parsedPlaylistId = parsePlaylistId(trimmedUrl)
  const needsPlaylistUrl = sourceMode === 'playlist' || sourceMode === 'both'

  const handlePlaylistUrlChange = (val: string) => {
    setPlaylistUrl(val)
    setValidationError(null)
    const nextParsed = parsePlaylistId(val)
    if (nextParsed && sourceMode === 'liked') {
      setSourceMode('playlist')
    } else if (!val.trim() && sourceMode === 'playlist') {
      setSourceMode('liked')
    }
  }

  const handleSelectDemoPreset = (presetUrl: string) => {
    setPlaylistUrl(presetUrl)
    setValidationError(null)
    if (sourceMode === 'liked') {
      setSourceMode('playlist')
    }
  }

  const validateAndSubmit = (skipAnimation: boolean) => {
    if (needsPlaylistUrl && !parsedPlaylistId) {
      setValidationError(
        'Please paste a valid public Spotify Playlist URL (e.g. https://open.spotify.com/playlist/...) or switch back to Liked Songs Only.',
      )
      return
    }
    setValidationError(null)
    onContinue(sourceMode, trimmedUrl, skipAnimation)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    validateAndSubmit(false)
  }

  return (
    <div className="dialogContainer">
      <form className="card dialogCard" onSubmit={handleSubmit}>
        <div className="dialogTopRow">
          <div className="heroBadge">
            {isDemo
              ? 'DEMO MODE • SOURCE SETUP'
              : 'SPOTIFY CONNECTED • SOURCE SETUP'}
          </div>
          <div className="row">
            {!isDemo && (
              <button
                type="button"
                className="button secondary small"
                onClick={onSwitchAccount}
              >
                Switch Account
              </button>
            )}
            <button
              type="button"
              className="button secondary small"
              onClick={onBackToHome}
            >
              ← Back to Login
            </button>
          </div>
        </div>

        <h2 className="dialogTitle">Choose your crate before analysis</h2>
        <p className="dialogLead">
          By default, MakeASet uses your <strong>Spotify Liked Songs</strong> as
          your song pool. Confirm below to proceed, or paste a{' '}
          <strong>public Spotify playlist URL</strong> to analyze a specific
          playlist or combine both.
        </p>

        <div
          className="sourceOptionGrid"
          role="radiogroup"
          aria-label="Track Source Mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={sourceMode === 'liked'}
            className={`sourceOptionCard ${sourceMode === 'liked' ? 'selected' : ''}`}
            onClick={() => {
              setSourceMode('liked')
              setValidationError(null)
            }}
          >
            <div className="sourceOptionHeader">
              <span className="sourceOptionIcon">💚</span>
              <span className="sourceDefaultBadge">Default</span>
            </div>
            <div className="sourceOptionTitle">Liked Songs Only</div>
            <div className="sourceOptionDesc">
              Analyze your saved Liked Songs track-by-track to build a set from
              your personal library.
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={sourceMode === 'playlist'}
            className={`sourceOptionCard ${sourceMode === 'playlist' ? 'selected' : ''}`}
            onClick={() => {
              setSourceMode('playlist')
              setValidationError(null)
            }}
          >
            <div className="sourceOptionHeader">
              <span className="sourceOptionIcon">🔗</span>
              {parsedPlaylistId && (
                <span className="sourceReadyBadge">URL Ready</span>
              )}
            </div>
            <div className="sourceOptionTitle">Public Playlist URL</div>
            <div className="sourceOptionDesc">
              Analyze only the tracks inside the public Spotify playlist you
              paste below.
            </div>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={sourceMode === 'both'}
            className={`sourceOptionCard ${sourceMode === 'both' ? 'selected' : ''}`}
            onClick={() => {
              setSourceMode('both')
              setValidationError(null)
            }}
          >
            <div className="sourceOptionHeader">
              <span className="sourceOptionIcon">✨</span>
              <span className="sourceComboBadge">Merged</span>
            </div>
            <div className="sourceOptionTitle">Liked Songs + Playlist</div>
            <div className="sourceOptionDesc">
              Combine your Liked Songs and the pasted public playlist into one
              deduplicated crate.
            </div>
          </button>
        </div>

        <div className="playlistUrlBox">
          <div className="playlistUrlHeader">
            <label htmlFor="playlistUrlInput" className="playlistUrlLabel">
              Public Spotify Playlist URL{' '}
              {needsPlaylistUrl ? '(Required for selected mode)' : '(Optional)'}
            </label>
          </div>

          <div className="playlistUrlInputRow">
            <input
              id="playlistUrlInput"
              type="text"
              className="input"
              placeholder="https://open.spotify.com/playlist/... or spotify:playlist:..."
              value={playlistUrl}
              onChange={(e) => handlePlaylistUrlChange(e.target.value)}
            />
            {playlistUrl && (
              <button
                type="button"
                className="button secondary small"
                onClick={() => handlePlaylistUrlChange('')}
              >
                Clear
              </button>
            )}
          </div>

          {isDemo && (
            <div className="presetChipsRow">
              <span className="mutedSmall">Mock Playlists:</span>
              {DEMO_PLAYLIST_PRESETS.map((preset) => {
                const isSelected = parsedPlaylistId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`chipToggle ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectDemoPreset(preset.url)}
                    title={preset.description}
                  >
                    {preset.shortLabel}
                  </button>
                )
              })}
            </div>
          )}

          <div className="playlistUrlMeta">
            {trimmedUrl ? (
              parsedPlaylistId ? (
                <span className="urlValidText">
                  ✓ Detected Playlist ID: <code>{parsedPlaylistId}</code>
                  {isDemo && ' (Demo Mode will load mock tracks for this URL)'}
                </span>
              ) : (
                <span className="urlWarnText">
                  Could not detect a Spotify playlist ID in this URL yet.
                </span>
              )
            ) : (
              <span className="mutedSmall">
                {isDemo
                  ? 'Leave blank to test Liked Songs, pick a mock playlist preset above, or paste any Spotify playlist URL.'
                  : 'Leave blank to proceed with your Liked Songs, or paste any user-created public playlist URL.'}
              </span>
            )}
          </div>
        </div>

        {(validationError || error) && (
          <div className="errorBox" role="alert">
            {validationError || error}
          </div>
        )}

        <div className="dialogFooter">
          <div className="dialogSummaryText">
            {sourceMode === 'liked' && (
              <>
                Ready to analyze: <strong>Your Liked Songs (Default)</strong>
              </>
            )}
            {sourceMode === 'playlist' && (
              <>
                Ready to analyze:{' '}
                <strong>
                  {parsedPlaylistId
                    ? `Public Playlist (${parsedPlaylistId.slice(0, 8)}…)`
                    : 'Public Playlist (paste URL above)'}
                </strong>
              </>
            )}
            {sourceMode === 'both' && (
              <>
                Ready to analyze:{' '}
                <strong>Liked Songs + Public Playlist</strong>
              </>
            )}
          </div>

          <div className="row">
            {isDemo && (
              <button
                type="button"
                className="button demoBtn"
                onClick={() => validateAndSubmit(true)}
              >
                ⚡ Instant Load (Skip Animation)
              </button>
            )}
            <button type="submit" className="button spotifyBtn continueBtn">
              Continue &amp; Run Track-by-Track Analysis →
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
