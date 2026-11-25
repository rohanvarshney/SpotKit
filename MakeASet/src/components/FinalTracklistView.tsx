// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useMemo, useState } from 'react'
import { applyFallbackImageOnError } from '../../../shared/demoArtwork'
import { computeCohesionScore, formatDuration } from '../lib/camelotEngine'
import type {
  AnalyzedCrate,
  AnalyzedTrack,
  CreatedPlaylistResult,
} from '../types/spotify'

interface FinalTracklistViewProps {
  crate: AnalyzedCrate
  setTracks: AnalyzedTrack[]
  onReEditFromLast: () => void
  onCreatePlaylist: (options: {
    name: string
    description: string
    isPublic: boolean
  }) => Promise<CreatedPlaylistResult>
  onAuthorizeWriteScope: () => void
  onConnectRealSpotify?: () => void
  needsWriteReauth: boolean
}

export function FinalTracklistView({
  crate,
  setTracks,
  onReEditFromLast,
  onCreatePlaylist,
  onAuthorizeWriteScope,
  onConnectRealSpotify,
  needsWriteReauth,
}: FinalTracklistViewProps) {
  const opener = setTracks[0]
  const closer = setTracks[setTracks.length - 1]

  const defaultName =
    opener && closer && opener.id !== closer.id
      ? `MakeASet • ${opener.name} → ${closer.name}`
      : opener
        ? `MakeASet • ${opener.name} Set`
        : 'MakeASet Mix'

  const transitions = useMemo(() => {
    const list = []
    for (let i = 1; i < setTracks.length; i += 1) {
      list.push(computeCohesionScore(setTracks[i - 1], setTracks[i]))
    }
    return list
  }, [setTracks])

  const avgCohesion = useMemo(() => {
    if (transitions.length === 0) return 100
    const sum = transitions.reduce((acc, t) => acc + t.totalScore, 0)
    return Math.round(sum / transitions.length)
  }, [transitions])

  const totalDurationMs = useMemo(
    () => setTracks.reduce((acc, t) => acc + t.durationMs, 0),
    [setTracks],
  )

  const defaultDescription = `Sequenced with SpotKit MakeASet • ${setTracks.length} tracks • ${avgCohesion}% avg song key & BPM cohesion${opener && closer ? ` • ${opener.bpm}→${closer.bpm} BPM` : ''}`

  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [playlistName, setPlaylistName] = useState(defaultName)
  const [playlistDesc, setPlaylistDesc] = useState(defaultDescription)
  const [isPublic, setIsPublic] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdResult, setCreatedResult] =
    useState<CreatedPlaylistResult | null>(null)
  const [copiedText, setCopiedText] = useState(false)

  const handleCopyTracklist = async () => {
    const lines = setTracks.map(
      (t, i) =>
        `${i + 1}. ${t.artistNames} - ${t.name} [${t.camelot} • ${t.bpm} BPM]`,
    )
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2200)
    } catch {
      // Ignore clipboard failure
    }
  }

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    setIsCreating(true)
    try {
      const result = await onCreatePlaylist({
        name: playlistName,
        description: playlistDesc,
        isPublic,
      })
      setCreatedResult(result)
      setShowPlaylistModal(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="summaryWrap">
      <div className="card summaryHeaderCard">
        <div className="summaryTopRow">
          <div>
            <div className="badgeRow">
              <div className="heroBadge">FINAL TRACKLIST</div>
              {crate.isDemo && (
                <span className="metaPill">DEMO MODE PREVIEW</span>
              )}
            </div>
            <h2 className="summaryTitle">Your Set Is Complete</h2>
            <p className="muted">
              Review your full transition arc below. Jump back in to extend from
              your last selected track, or save this exact order directly to
              Spotify.
            </p>
          </div>

          <div className="summaryPrimaryActions">
            <button
              type="button"
              className="button reEditBtn"
              onClick={onReEditFromLast}
            >
              ↩ Re-Edit from Last Point
            </button>
            <button
              type="button"
              className="button spotifyBtn"
              onClick={() => {
                setCreateError(null)
                setShowPlaylistModal((prev) => !prev)
              }}
            >
              💚 Turn into Playlist on Spotify
            </button>
          </div>
        </div>

        <div className="summaryStatsGrid">
          <div className="statCard">
            <div className="statValue">{setTracks.length}</div>
            <div className="statLabel">Tracks in Set</div>
          </div>
          <div className="statCard">
            <div className="statValue">{formatDuration(totalDurationMs)}</div>
            <div className="statLabel">Total Runtime</div>
          </div>
          <div className="statCard">
            <div className="statValue">{avgCohesion}%</div>
            <div className="statLabel">Avg Transition Cohesion</div>
          </div>
          <div className="statCard">
            <div className="statValue">
              {opener && closer
                ? `${opener.bpm} → ${closer.bpm} BPM`
                : '—'}
            </div>
            <div className="statLabel">
              Tempo Journey ({opener?.camelot} → {closer?.camelot})
            </div>
          </div>
        </div>

        {createdResult && (
          <div className="playlistCreatedBanner" role="status">
            <div>
              <div className="createdTitle">
                {createdResult.isDemo
                  ? '✓ Simulated Spotify Playlist Created (Demo Mode)'
                  : '✓ Playlist Created on Your Spotify Account!'}
              </div>
              <div className="mutedSmall">
                <strong>{createdResult.name}</strong> ({createdResult.trackCount}{' '}
                tracks • {createdResult.isPublic ? 'Public' : 'Private'})
                {createdResult.isDemo && (
                  <>
                    {' '}
                    — Mock ID: <code>{createdResult.id}</code>
                  </>
                )}
              </div>
            </div>
            {!createdResult.isDemo ? (
              <a
                href={createdResult.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="button spotifyBtn small"
                style={{ textDecoration: 'none' }}
              >
                Open in Spotify ↗
              </a>
            ) : (
              onConnectRealSpotify && (
                <button
                  type="button"
                  className="button spotifyBtn small"
                  onClick={onConnectRealSpotify}
                >
                  Connect Real Spotify to Publish Live
                </button>
              )
            )}
          </div>
        )}

        {showPlaylistModal && (
          <form className="playlistCreatePanel" onSubmit={handleConfirmCreate}>
            <div className="playlistCreateHeader">
              <h3>
                {crate.isDemo
                  ? 'Simulate Spotify Playlist Export (Demo Mode)'
                  : 'Export Set as Spotify Playlist'}
              </h3>
              <button
                type="button"
                className="button secondary small"
                onClick={() => setShowPlaylistModal(false)}
              >
                Close
              </button>
            </div>

            {needsWriteReauth && !crate.isDemo && (
              <div className="scopeNoticeBox">
                <div>
                  <strong>Playlist write permission needed:</strong> Your
                  current session was imported from TopAlbums with read-only
                  scopes. Authorize playlist editing once and MakeASet will bring
                  you straight back to this exact tracklist.
                </div>
                <button
                  type="button"
                  className="button spotifyBtn small"
                  onClick={onAuthorizeWriteScope}
                >
                  Authorize Spotify Playlist Creation →
                </button>
              </div>
            )}

            <div className="playlistFormFields">
              <label className="label">
                Playlist Name
                <input
                  type="text"
                  className="input"
                  maxLength={100}
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  required
                />
              </label>

              <label className="label">
                Playlist Description
                <input
                  type="text"
                  className="input"
                  maxLength={300}
                  value={playlistDesc}
                  onChange={(e) => setPlaylistDesc(e.target.value)}
                />
              </label>
            </div>

            <div className="playlistVisibilityRow">
              <label className="visibilityToggle">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span>
                  Make playlist <strong>Public</strong> (uncheck for Private)
                </span>
              </label>

              <button
                type="submit"
                className="button spotifyBtn"
                disabled={isCreating}
              >
                {isCreating
                  ? 'Creating Playlist…'
                  : crate.isDemo
                    ? 'Simulate Spotify Playlist Creation'
                    : `Create "${playlistName.trim() || 'MakeASet Mix'}" on Spotify`}
              </button>
            </div>

            {createError && (
              <div className="errorBox" role="alert">
                {createError}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Final Ordered Tracklist */}
      <div className="card tracklistCard">
        <div className="tracklistHeader">
          <h3>Final Sequenced Tracklist ({setTracks.length} songs)</h3>
          <button
            type="button"
            className="button secondary small"
            onClick={() => void handleCopyTracklist()}
          >
            {copiedText ? '✓ Copied Tracklist' : '📋 Copy Tracklist Text'}
          </button>
        </div>

        <div className="finalTracklist">
          {setTracks.map((track, idx) => {
            const transition = idx > 0 ? transitions[idx - 1] : null
            return (
              <div key={track.id}>
                {transition && (
                  <div className="transitionConnector">
                    <span className="connectorLine" aria-hidden="true" />
                    <span
                      className={`connectorBadge tier-${transition.tier}`}
                    >
                      ↳ {transition.totalScore}% Cohesion • {transition.bpmLabel}{' '}
                      • {transition.harmonicLabel}
                    </span>
                  </div>
                )}

                <div className="finalTrackRow">
                  <div className="finalTrackNum">#{idx + 1}</div>
                  {track.albumArtUrl ? (
                    <img
                      src={track.albumArtUrl}
                      alt={track.albumName}
                      className="trackThumbSmall"
                      loading="lazy"
                      onError={(e) =>
                        applyFallbackImageOnError(
                          e.currentTarget,
                          track.fallbackAlbumArtUrl,
                        )
                      }
                    />
                  ) : (
                    <div className="trackThumbSmall placeholderArt">🎵</div>
                  )}
                  <div className="finalTrackMain">
                    <div className="trackTitle">{track.name}</div>
                    <div className="trackArtist">
                      {track.artistNames} — {track.albumName}
                    </div>
                  </div>
                  <div className="finalTrackMeta">
                    <span className="camelotBadge">
                      {track.camelot} ({track.musicalKey})
                    </span>
                    <span className="bpmBadge">{track.bpm} BPM</span>
                    <span className="durationText">
                      {formatDuration(track.durationMs)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
