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
  initialMaxTracks: number | null
  error: string | null
  onContinue: (
    sourceMode: SourceMode,
    playlistUrl: string,
    maxTracks: number | null,
    skipAnimation?: boolean,
  ) => void
  onStartDemo?: () => void
  onSwitchAccount: () => void
  onBackToHome: () => void
}

const SUBSET_PRESETS = [10, 15, 20, 30, 50]

export function SourceDialogView({
  isDemo,
  initialSourceMode,
  initialPlaylistUrl,
  initialMaxTracks,
  error,
  onContinue,
  onStartDemo,
  onSwitchAccount,
  onBackToHome,
}: SourceDialogViewProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>(initialSourceMode)
  const [playlistUrl, setPlaylistUrl] = useState<string>(initialPlaylistUrl)
  const [limitEnabled, setLimitEnabled] = useState<boolean>(
    initialMaxTracks !== null && initialMaxTracks > 0,
  )
  const [customCountStr, setCustomCountStr] = useState<string>(
    initialMaxTracks && initialMaxTracks > 0 ? String(initialMaxTracks) : '15',
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const trimmedUrl = playlistUrl.trim()
  const parsedPlaylistId = parsePlaylistId(trimmedUrl)
  const needsPlaylistUrl = sourceMode === 'playlist' || sourceMode === 'both'

  const parsedCustomCount = Number.parseInt(customCountStr.trim(), 10)
  const effectiveMaxTracks: number | null = limitEnabled
    ? Number.isFinite(parsedCustomCount) && parsedCustomCount >= 1
      ? parsedCustomCount
      : null
    : null

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

  const handleSelectSubsetPreset = (count: number | null) => {
    setValidationError(null)
    if (count === null) {
      setLimitEnabled(false)
    } else {
      setLimitEnabled(true)
      setCustomCountStr(String(count))
    }
  }

  const handleCustomCountChange = (val: string) => {
    setValidationError(null)
    setCustomCountStr(val)
    if (val.trim() === '') {
      return
    }
    setLimitEnabled(true)
  }

  const validateAndSubmit = (skipAnimation: boolean) => {
    if (needsPlaylistUrl && !parsedPlaylistId) {
      setValidationError(
        'Please paste a valid public Spotify Playlist URL (e.g. https://open.spotify.com/playlist/...) or switch back to Liked Songs Only.',
      )
      return
    }
    if (limitEnabled) {
      if (!Number.isFinite(parsedCustomCount) || parsedCustomCount < 2) {
        setValidationError(
          'Please enter a subset track limit of at least 2 tracks, or choose Entire Playlist / Crate.',
        )
        return
      }
    }
    setValidationError(null)
    onContinue(sourceMode, trimmedUrl, effectiveMaxTracks, skipAnimation)
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
              ? 'DEMO MODE • PLAYLIST & LENGTH SETUP'
              : 'SPOTIFY CONNECTED • PLAYLIST & LENGTH SETUP'}
          </div>
          <div className="row">
            {!isDemo && onStartDemo && (
              <button
                type="button"
                className="button demoBtn small"
                onClick={onStartDemo}
              >
                ▶ Try Interactive Demo
              </button>
            )}
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
              {isDemo ? '← Exit Demo' : '← Back to Login'}
            </button>
          </div>
        </div>

        <h2 className="dialogTitle">Choose your playlist &amp; set length</h2>
        <p className="dialogLead">
          By default, DJMyPlaylist loads your <strong>Spotify Liked Songs</strong>{' '}
          and sequences the <strong>entire crate</strong> by song key
          harmony and BPM. Paste any public playlist URL or set an optional{' '}
          <strong>up to X tracks</strong> subset limit below.
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
              Scan your saved Liked Songs and automatically arrange them into a
              seamless harmonic set.
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
              Load every song in a specific public Spotify playlist and compute
              its optimal DJ order.
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
              deduplicated crate to sequence.
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

        {/* Optional Track Subset Limit X */}
        <div className="subsetLimitBox">
          <div className="subsetLimitHeader">
            <div>
              <div className="playlistUrlLabel">
                How many tracks should DJMyPlaylist sequence?{' '}
                <span className="mutedSmall" style={{ fontWeight: 500 }}>
                  (Optional track cap X)
                </span>
              </div>
              <p className="mutedSmall" style={{ marginTop: 3 }}>
                Sequence the entire playlist, or specify up to <strong>X</strong>{' '}
                tracks so the recursive solver selects and orders the highest-cohesion
                subset.
              </p>
            </div>
          </div>

          <div className="subsetControlsRow">
            <div className="subsetChipsGroup" role="group" aria-label="Track Limit Presets">
              <button
                type="button"
                className={`chipToggle ${!limitEnabled ? 'active' : ''}`}
                onClick={() => handleSelectSubsetPreset(null)}
              >
                ∞ Entire Crate / Playlist (Default)
              </button>
              {SUBSET_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`chipToggle ${
                    limitEnabled && parsedCustomCount === count ? 'active' : ''
                  }`}
                  onClick={() => handleSelectSubsetPreset(count)}
                >
                  {count} Tracks
                </button>
              ))}
            </div>

            <label className="customLimitField">
              <span className="mutedSmall">Custom max tracks (X):</span>
              <input
                type="number"
                min={2}
                max={2000}
                className="input smallInput customLimitInput"
                placeholder="e.g. 12"
                value={limitEnabled ? customCountStr : ''}
                onFocus={() => {
                  if (!limitEnabled) setLimitEnabled(true)
                }}
                onChange={(e) => handleCustomCountChange(e.target.value)}
                aria-label="Custom maximum tracks X"
              />
            </label>
          </div>
        </div>

        {(validationError || error) && (
          <div className="errorBox" role="alert">
            {validationError || error}
          </div>
        )}

        <div className="dialogFooter">
          <div className="dialogSummaryText">
            <div>
              Source:{' '}
              <strong>
                {sourceMode === 'liked' && 'Your Liked Songs (Default)'}
                {sourceMode === 'playlist' &&
                  (parsedPlaylistId
                    ? `Public Playlist (${parsedPlaylistId.slice(0, 8)}…)`
                    : 'Public Playlist (paste URL above)')}
                {sourceMode === 'both' && 'Liked Songs + Public Playlist'}
              </strong>
            </div>
            <div className="mutedSmall" style={{ marginTop: 2 }}>
              Target:{' '}
              <strong>
                {limitEnabled && effectiveMaxTracks
                  ? `Best subset of up to ${effectiveMaxTracks} tracks`
                  : 'Arrange entire loaded crate'}
              </strong>
            </div>
          </div>

          <div className="row">
            {isDemo && (
              <button
                type="button"
                className="button demoBtn"
                onClick={() => validateAndSubmit(true)}
              >
                ⚡ Instant Sequence (Skip Animation)
              </button>
            )}
            <button type="submit" className="button spotifyBtn continueBtn">
              Continue &amp; Auto-Sequence Playlist →
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
