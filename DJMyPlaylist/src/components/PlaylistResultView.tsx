// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useMemo, useState } from 'react'
import { applyFallbackImageOnError } from '../../../shared/demoArtwork'
import {
  ALL_CAMELOT_CODES,
  camelotToPitchAndMode,
  formatDuration,
  parsePlaylistId,
} from '../lib/camelotEngine'
import { findBestInsertionPosition } from '../lib/djSequencer'
import {
  DEMO_LIKED_TRACK_COUNT,
  DEMO_PLAYLIST_PRESETS,
} from '../mocks/demoData'
import type {
  AnalyzedCrate,
  AnalyzedTrack,
  CamelotCode,
  CreatedPlaylistResult,
  NarrationPhase,
  SequencerResult,
  SourceMode,
} from '../types/spotify'

interface PlaylistResultViewProps {
  crate: AnalyzedCrate
  result: SequencerResult
  maxTracks: number | null
  preferredOpenerId: string | null
  currentPlaylistUrl?: string
  needsWriteReauth: boolean
  onRerunSequencer: (
    nextMaxTracks: number | null,
    nextPreferredOpenerId: string | null,
  ) => void
  onReplayNarration: () => void
  onSwitchDemoSource?: (
    mode: SourceMode,
    playlistUrl: string,
    replayAnimation: boolean,
  ) => void
  onMoveTrack: (fromIndex: number, toIndex: number) => void
  onRemoveTrack: (trackId: string) => void
  onInsertTrackAtBestSpot: (track: AnalyzedTrack) => void
  onUpdateTrackMeta: (
    trackId: string,
    updates: { bpm: number; camelot: CamelotCode },
  ) => void
  onCreatePlaylist: (options: {
    name: string
    description: string
    isPublic: boolean
  }) => Promise<CreatedPlaylistResult>
  onAuthorizeWriteScope: () => void
  onConnectRealSpotify?: () => void
  onChangeSources: () => void
  onBackToLogin: () => void
}

type LogFilter = 'all' | 'scan' | 'recursive' | 'iterate'

function featureSourceTag(track: AnalyzedTrack): string {
  switch (track.featureSource) {
    case 'spotify':
      return 'Spotify Audio'
    case 'reccobeats':
      return 'Public Audio DB'
    case 'estimated':
      return 'Estimated'
    case 'curated':
      return 'Mock Crate'
    case 'manual':
      return 'Edited'
  }
}

function matchesLogFilter(phase: NarrationPhase, filter: LogFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'scan') return phase === 'scan' || phase === 'cluster'
  if (filter === 'recursive') {
    return phase === 'recursive' || phase === 'backtrack'
  }
  return phase === 'iterate' || phase === 'complete'
}

export function PlaylistResultView({
  crate,
  result,
  maxTracks,
  preferredOpenerId,
  currentPlaylistUrl = '',
  needsWriteReauth,
  onRerunSequencer,
  onReplayNarration,
  onSwitchDemoSource,
  onMoveTrack,
  onRemoveTrack,
  onInsertTrackAtBestSpot,
  onUpdateTrackMeta,
  onCreatePlaylist,
  onAuthorizeWriteScope,
  onConnectRealSpotify,
  onChangeSources,
  onBackToLogin,
}: PlaylistResultViewProps) {
  const { orderedTracks, unselectedTracks, transitions, narrationLogs } = result
  const opener = orderedTracks[0]
  const closer = orderedTracks[orderedTracks.length - 1]

  const totalDurationMs = useMemo(
    () => orderedTracks.reduce((acc, t) => acc + t.durationMs, 0),
    [orderedTracks],
  )

  const defaultPlaylistName = useMemo(() => {
    if (crate.playlistMeta?.name) {
      return `DJMyPlaylist • ${crate.playlistMeta.name}`
    }
    if (opener && closer && opener.id !== closer.id) {
      return `DJMyPlaylist • ${opener.name} → ${closer.name}`
    }
    return opener ? `DJMyPlaylist • ${opener.name} Set` : 'DJMyPlaylist Mix'
  }, [crate.playlistMeta?.name, opener, closer])

  const defaultPlaylistDescription = useMemo(
    () =>
      `Auto-sequenced with SpotKit DJMyPlaylist • ${orderedTracks.length} tracks • ${result.avgCohesion}% avg Camelot & BPM cohesion${
        opener && closer ? ` • ${opener.bpm}→${closer.bpm} BPM` : ''
      }`,
    [orderedTracks.length, result.avgCohesion, opener, closer],
  )

  const [showPlaylistModal, setShowPlaylistModal] = useState(false)
  const [playlistName, setPlaylistName] = useState(defaultPlaylistName)
  const [playlistDesc, setPlaylistDesc] = useState(defaultPlaylistDescription)
  const [isPublic, setIsPublic] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdResult, setCreatedResult] =
    useState<CreatedPlaylistResult | null>(null)
  const [copiedText, setCopiedText] = useState(false)

  // Interactive sequencer control bar state
  const [draftLimitEnabled, setDraftLimitEnabled] = useState(
    maxTracks !== null && maxTracks > 0,
  )
  const [draftMaxTracksInput, setDraftMaxTracksInput] = useState(
    maxTracks && maxTracks > 0
      ? String(maxTracks)
      : String(Math.min(15, crate.tracks.length)),
  )
  const [draftOpenerId, setDraftOpenerId] = useState<string>(
    preferredOpenerId ?? '',
  )

  useEffect(() => {
    setDraftLimitEnabled(maxTracks !== null && maxTracks > 0)
    if (maxTracks && maxTracks > 0) {
      setDraftMaxTracksInput(String(maxTracks))
    }
    setDraftOpenerId(preferredOpenerId ?? '')
  }, [maxTracks, preferredOpenerId])

  useEffect(() => {
    setPlaylistName(defaultPlaylistName)
    setPlaylistDesc(defaultPlaylistDescription)
  }, [defaultPlaylistName, defaultPlaylistDescription])

  // Narration log panel state
  const [logsExpanded, setLogsExpanded] = useState(true)
  const [logFilter, setLogFilter] = useState<LogFilter>('all')

  // Inline BPM/Key editor state
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editBpm, setEditBpm] = useState<string>('')
  const [editCamelot, setEditCamelot] = useState<CamelotCode>('8A')

  // Unselected pool search
  const [poolSearch, setPoolSearch] = useState('')

  const sequencedCamelotCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ALL_CAMELOT_CODES.map((c) => [c, 0]),
    ) as Record<CamelotCode, number>
    for (const t of orderedTracks) {
      counts[t.camelot] = (counts[t.camelot] ?? 0) + 1
    }
    return counts
  }, [orderedTracks])

  const filteredLogs = useMemo(
    () => narrationLogs.filter((l) => matchesLogFilter(l.phase, logFilter)),
    [narrationLogs, logFilter],
  )

  const filteredPool = useMemo(() => {
    const q = poolSearch.trim().toLowerCase()
    if (!q) return unselectedTracks
    return unselectedTracks.filter((t) => {
      const hay = `${t.name} ${t.artistNames} ${t.albumName} ${t.camelot} ${t.musicalKey} ${t.bpm}`.toLowerCase()
      return hay.includes(q)
    })
  }, [unselectedTracks, poolSearch])

  const deltaVsBaseline = result.avgCohesion - result.baselineCohesion
  const showEstimationNote = crate.featureSummary.estimated > 0

  const handleCopyTracklist = async () => {
    const lines = orderedTracks.map(
      (t, i) =>
        `${i + 1}. ${t.artistNames} - ${t.name} [${t.camelot} (${t.musicalKey}) • ${t.bpm} BPM]`,
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
      const created = await onCreatePlaylist({
        name: playlistName,
        description: playlistDesc,
        isPublic,
      })
      setCreatedResult(created)
      setShowPlaylistModal(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  const handleApplyRerun = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number.parseInt(draftMaxTracksInput.trim(), 10)
    const nextMax =
      draftLimitEnabled && Number.isFinite(parsed) && parsed >= 2
        ? Math.min(parsed, crate.tracks.length)
        : null
    onRerunSequencer(nextMax, draftOpenerId || null)
  }

  const openEditor = (track: AnalyzedTrack) => {
    setEditingTrackId(track.id)
    setEditBpm(String(track.bpm))
    setEditCamelot(track.camelot)
  }

  const saveEditor = (trackId: string, e: React.FormEvent) => {
    e.preventDefault()
    const parsedBpm = Number.parseInt(editBpm, 10)
    const validBpm = Number.isFinite(parsedBpm)
      ? Math.min(220, Math.max(45, parsedBpm))
      : 120
    onUpdateTrackMeta(trackId, { bpm: validBpm, camelot: editCamelot })
    setEditingTrackId(null)
  }

  const quickLimitOptions = [10, 15, 20, 30, 50].filter(
    (num) => num < crate.tracks.length,
  )

  return (
    <div className="summaryWrap">
      {/* Top Summary & Export Header */}
      <div className="card summaryHeaderCard">
        <div className="summaryTopRow">
          <div>
            <div className="badgeRow">
              <span className="heroBadge">
                {crate.isDemo ? 'DEMO MODE • SEQUENCED' : 'SPOTIFY CONNECTED'}
              </span>
              <span className="sessionUserName">
                {crate.user.display_name || crate.user.id}
              </span>
              {crate.playlistMeta ? (
                <span className="metaPill playlistMetaPill">
                  📋 {crate.playlistMeta.name}
                </span>
              ) : (
                <span className="metaPill">💚 Liked Songs Crate</span>
              )}
              {showEstimationNote && (
                <span
                  className="metaPill subtleWarnPill"
                  title="Spotify restricted /audio-features in Dev Mode for some tracks, so DJMyPlaylist used ReccoBeats lookup + deterministic estimates. You can edit any track's BPM or Camelot key below."
                >
                  ℹ {crate.featureSummary.estimated} estimated (editable)
                </span>
              )}
            </div>
            <h2 className="summaryTitle">
              {orderedTracks.length < crate.tracks.length
                ? `Best ${orderedTracks.length}-Track Set Sequenced from ${crate.tracks.length} Songs`
                : `Full ${orderedTracks.length}-Track Playlist Sequenced`}
            </h2>
            <p className="muted">
              Ordered recursively &amp; iteratively by Camelot Wheel harmony and
              BPM continuity. Fine-tune parameters, inspect the live reasoning
              log, or generate your Spotify playlist below.
            </p>
          </div>

          <div className="summaryPrimaryActions">
            <button
              type="button"
              className="button spotifyBtn"
              onClick={() => {
                setCreateError(null)
                setShowPlaylistModal((prev) => !prev)
              }}
            >
              💚 Generate Playlist on Spotify
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={() => void handleCopyTracklist()}
            >
              {copiedText ? '✓ Copied Text' : '📋 Copy Tracklist'}
            </button>
            <button
              type="button"
              className="button small"
              onClick={onReplayNarration}
              title="Replay the live narrated thought-process animation"
            >
              ↻ Replay Live Narration
            </button>
            {crate.isDemo && onConnectRealSpotify && (
              <button
                type="button"
                className="button demoBtn small"
                onClick={onConnectRealSpotify}
              >
                Connect Real Spotify
              </button>
            )}
            <button
              type="button"
              className="button secondary small"
              onClick={onChangeSources}
            >
              Change Source
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={onBackToLogin}
            >
              {crate.isDemo ? '← Exit Demo' : 'Disconnect'}
            </button>
          </div>
        </div>

        <div className="summaryStatsGrid">
          <div className="statCard">
            <div className="statValue">
              {orderedTracks.length}{' '}
              <span className="statSubInline">of {crate.tracks.length}</span>
            </div>
            <div className="statLabel">Sequenced Tracks</div>
          </div>
          <div className="statCard">
            <div className="statValue">{formatDuration(totalDurationMs)}</div>
            <div className="statLabel">Total Set Runtime</div>
          </div>
          <div className="statCard">
            <div className="statValue">
              {result.avgCohesion}%{' '}
              <span className="statDeltaPill">
                {deltaVsBaseline >= 0
                  ? `+${deltaVsBaseline}% vs baseline`
                  : `${deltaVsBaseline}% vs baseline`}
              </span>
            </div>
            <div className="statLabel">
              Avg Cohesion (Min {result.minCohesion}% • Max {result.maxCohesion}
              %)
            </div>
          </div>
          <div className="statCard">
            <div className="statValue">
              {opener && closer
                ? `${opener.bpm} → ${closer.bpm} BPM`
                : '—'}
            </div>
            <div className="statLabel">
              Key Arc ({opener?.camelot ?? '—'} → {closer?.camelot ?? '—'})
            </div>
          </div>
        </div>

        {createdResult && (
          <div className="playlistCreatedBanner" role="status">
            <div>
              <div className="createdTitle">
                {createdResult.isDemo
                  ? '✓ Simulated Spotify Playlist Created (Demo Mode)'
                  : '✓ Playlist Generated on Your Spotify Account!'}
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
                  : 'Generate Ordered Spotify Playlist'}
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
                  scopes. Authorize playlist editing once and DJMyPlaylist will
                  bring you straight back to this sequenced tracklist.
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
                disabled={isCreating || orderedTracks.length === 0}
              >
                {isCreating
                  ? 'Generating Playlist…'
                  : crate.isDemo
                    ? 'Simulate Spotify Playlist Generation'
                    : `Create "${playlistName.trim() || 'DJMyPlaylist Mix'}" on Spotify`}
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

      {/* Interactive Algorithm Controls Bar */}
      <form className="card controlsBarCard" onSubmit={handleApplyRerun}>
        {crate.isDemo && onSwitchDemoSource && (
          <div className="demoSwitcherStrip">
            <div className="demoSwitcherLabel">
              Demo Mock Crate Switcher:
            </div>
            <div className="demoSwitcherPills">
              <button
                type="button"
                className={`chipToggle ${crate.sourceMode === 'liked' ? 'active' : ''}`}
                onClick={() => onSwitchDemoSource('liked', '', false)}
              >
                💚 Demo Liked Songs ({DEMO_LIKED_TRACK_COUNT} tracks)
              </button>
              {DEMO_PLAYLIST_PRESETS.map((preset) => {
                const activePlaylistId =
                  crate.playlistMeta?.id || parsePlaylistId(currentPlaylistUrl)
                const isSelected =
                  crate.sourceMode === 'playlist' &&
                  activePlaylistId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`chipToggle ${isSelected ? 'active' : ''}`}
                    onClick={() =>
                      onSwitchDemoSource('playlist', preset.url, false)
                    }
                    title={preset.description}
                  >
                    {preset.shortLabel}
                  </button>
                )
              })}
              <button
                type="button"
                className={`chipToggle ${crate.sourceMode === 'both' ? 'active' : ''}`}
                onClick={() =>
                  onSwitchDemoSource(
                    'both',
                    currentPlaylistUrl || DEMO_PLAYLIST_PRESETS[0].url,
                    false,
                  )
                }
              >
                ✨ Merged Crate (Liked + Preset)
              </button>
            </div>
          </div>
        )}

        <div className="controlsBarHeader">
          <div>
            <h3>Interactive Algorithm Controls</h3>
            <p className="mutedSmall">
              Adjust the subset limit <code>X</code> or lock a specific opening
              track, then re-run the recursive &amp; iterative sequencer.
            </p>
          </div>
          <button type="submit" className="button demoBtn">
            ⚡ Re-Run Recursive Sequencer
          </button>
        </div>

        <div className="controlsBarGrid">
          <div className="controlGroup">
            <div className="controlLabel">Track Subset Cap (X)</div>
            <div className="controlLimitRow">
              <button
                type="button"
                className={`chipToggle ${!draftLimitEnabled ? 'active' : ''}`}
                onClick={() => setDraftLimitEnabled(false)}
              >
                All ({crate.tracks.length})
              </button>
              {quickLimitOptions.map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`chipToggle ${
                    draftLimitEnabled &&
                    Number.parseInt(draftMaxTracksInput, 10) === num
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    setDraftLimitEnabled(true)
                    setDraftMaxTracksInput(String(num))
                  }}
                >
                  {num}
                </button>
              ))}
              <input
                type="number"
                min={2}
                max={crate.tracks.length}
                className="input smallInput customLimitInput"
                placeholder="Custom X"
                value={draftLimitEnabled ? draftMaxTracksInput : ''}
                onFocus={() => setDraftLimitEnabled(true)}
                onChange={(e) => {
                  setDraftLimitEnabled(true)
                  setDraftMaxTracksInput(e.target.value)
                }}
                aria-label="Track Subset Limit X"
              />
            </div>
          </div>

          <div className="controlGroup">
            <label htmlFor="openerSelect" className="controlLabel">
              Opening Track Lock
            </label>
            <select
              id="openerSelect"
              className="select"
              value={draftOpenerId}
              onChange={(e) => setDraftOpenerId(e.target.value)}
            >
              <option value="">
                Auto-Select Optimal Opener (Multi-Seed Search)
              </option>
              {crate.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.artistNames} ({t.camelot} • {t.bpm} BPM)
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {/* Camelot Wheel & Crate Overview Strip */}
      <div className="card camelotOverviewCard">
        <div className="overviewHeaderRow">
          <div>
            <h3>Camelot Wheel &amp; Crate Harmonic Map</h3>
            <p className="mutedSmall">
              Crate BPM spread: <strong>{result.bpmRange.min}–{result.bpmRange.max} BPM</strong>{' '}
              (median {result.bpmRange.median} BPM) •{' '}
              <strong>{result.branchesExplored.toLocaleString()}</strong>{' '}
              recursive branches explored •{' '}
              <strong>{result.backtracksCount}</strong> lookahead pivots •{' '}
              <strong>{result.iterativeImprovements}</strong> iterative
              refinements
            </p>
          </div>
        </div>

        <div className="camelotWheelGrid">
          {Array.from({ length: 12 }, (_, idx) => {
            const num = idx + 1
            const minorCode = `${num}A` as CamelotCode
            const majorCode = `${num}B` as CamelotCode
            const minorCrate = result.camelotCounts[minorCode] ?? 0
            const majorCrate = result.camelotCounts[majorCode] ?? 0
            const minorSeq = sequencedCamelotCounts[minorCode] ?? 0
            const majorSeq = sequencedCamelotCounts[majorCode] ?? 0

            return (
              <div key={num} className="camelotColumn">
                <div
                  className={`camelotCell ${minorSeq > 0 ? 'inSet' : minorCrate > 0 ? 'inCrate' : 'empty'}`}
                  title={`${minorCode} (${camelotToPitchAndMode(minorCode).musicalKey}): ${minorSeq} in set / ${minorCrate} in crate`}
                >
                  <span className="camCellCode">{minorCode}</span>
                  <span className="camCellCount">
                    {minorCrate > 0 ? `${minorSeq}/${minorCrate}` : '0'}
                  </span>
                </div>
                <div
                  className={`camelotCell ${majorSeq > 0 ? 'inSet' : majorCrate > 0 ? 'inCrate' : 'empty'}`}
                  title={`${majorCode} (${camelotToPitchAndMode(majorCode).musicalKey}): ${majorSeq} in set / ${majorCrate} in crate`}
                >
                  <span className="camCellCode">{majorCode}</span>
                  <span className="camCellCount">
                    {majorCrate > 0 ? `${majorSeq}/${majorCrate}` : '0'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Narrated Thought-Process Log Panel */}
      <div className="card narrationPanelCard">
        <div className="narrationPanelTop">
          <div>
            <h3>
              Algorithm Thought Process Log ({narrationLogs.length} steps)
            </h3>
            <p className="mutedSmall">
              Step-by-step narration of how DJMyPlaylist scanned keys/BPMs,
              explored recursive lookahead branches, and refined the tracklist.
            </p>
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setLogsExpanded((v) => !v)}
          >
            {logsExpanded ? '▾ Collapse Log' : '▸ Expand Log'}
          </button>
        </div>

        {logsExpanded && (
          <>
            <div className="logFilterTabs" role="tablist">
              {(
                [
                  { id: 'all', label: `All Steps (${narrationLogs.length})` },
                  { id: 'scan', label: 'Camelot Scan' },
                  { id: 'recursive', label: 'Recursive Search & Backtracks' },
                  { id: 'iterate', label: 'Iterative 2-Opt & Swaps' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={logFilter === tab.id}
                  className={`chipToggle ${logFilter === tab.id ? 'active' : ''}`}
                  onClick={() => setLogFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="narrationResultList">
              {filteredLogs.length === 0 ? (
                <div className="narrationEmpty">
                  No log entries match this filter.
                </div>
              ) : (
                filteredLogs.map((entry) => (
                  <div key={entry.id} className="narrationLine">
                    <span className="narrationStepNum">
                      #{entry.step.toString().padStart(2, '0')}
                    </span>
                    <span className={`phaseBadge phase-${entry.phase}`}>
                      [{entry.badge}]
                    </span>
                    <div className="narrationTextCol">
                      <div className="narrationMsg">{entry.message}</div>
                      {entry.detail && (
                        <div className="narrationDetail">{entry.detail}</div>
                      )}
                    </div>
                    {entry.scoreImpact && (
                      <span className="narrationImpact">{entry.scoreImpact}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Generated Tracklist with Transition Connectors */}
      <div className="card tracklistCard">
        <div className="tracklistHeader">
          <div>
            <h3>Generated DJ Tracklist ({orderedTracks.length} songs)</h3>
            <p className="mutedSmall">
              Nudge tracks up/down, tune BPM/Camelot keys inline, or inspect
              transition cohesion between each pair.
            </p>
          </div>
          <button
            type="button"
            className="button secondary small"
            onClick={() => void handleCopyTracklist()}
          >
            {copiedText ? '✓ Copied Tracklist' : '📋 Copy Tracklist Text'}
          </button>
        </div>

        <div className="finalTracklist">
          {orderedTracks.map((track, idx) => {
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
                      {track.artistNames} — {track.albumName} •{' '}
                      <span className="sourceTagInline">
                        {featureSourceTag(track)}
                      </span>
                    </div>

                    {editingTrackId === track.id && (
                      <form
                        className="inlineEditForm"
                        onSubmit={(e) => saveEditor(track.id, e)}
                      >
                        <label className="inlineEditField">
                          BPM
                          <input
                            type="number"
                            min={45}
                            max={220}
                            className="input smallInput"
                            value={editBpm}
                            onChange={(e) => setEditBpm(e.target.value)}
                          />
                        </label>
                        <label className="inlineEditField">
                          Camelot Key
                          <select
                            className="select smallInput"
                            value={editCamelot}
                            onChange={(e) =>
                              setEditCamelot(e.target.value as CamelotCode)
                            }
                          >
                            {ALL_CAMELOT_CODES.map((code) => (
                              <option key={code} value={code}>
                                {code} (
                                {camelotToPitchAndMode(code).musicalKey})
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="button spotifyBtn small">
                          Save
                        </button>
                        <button
                          type="button"
                          className="button secondary small"
                          onClick={() => setEditingTrackId(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>

                  <div className="finalTrackMeta">
                    <span className="camelotBadge">
                      {track.camelot} ({track.musicalKey})
                    </span>
                    <span className="bpmBadge">{track.bpm} BPM</span>
                    <span className="energyBadge">
                      ⚡ {Math.round(track.energy * 100)}%
                    </span>
                    <span className="durationText">
                      {formatDuration(track.durationMs)}
                    </span>

                    <div className="rowOrderControls">
                      <button
                        type="button"
                        className="inlineEditBtn"
                        onClick={() => openEditor(track)}
                        title="Edit track BPM & Camelot key"
                      >
                        ✎ Tune
                      </button>
                      <button
                        type="button"
                        className="iconActionBtn"
                        disabled={idx === 0}
                        onClick={() => onMoveTrack(idx, idx - 1)}
                        title="Move track up"
                        aria-label={`Move ${track.name} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="iconActionBtn"
                        disabled={idx === orderedTracks.length - 1}
                        onClick={() => onMoveTrack(idx, idx + 1)}
                        title="Move track down"
                        aria-label={`Move ${track.name} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="iconActionBtn danger"
                        disabled={orderedTracks.length <= 1}
                        onClick={() => onRemoveTrack(track.id)}
                        title="Remove from sequenced set"
                        aria-label={`Remove ${track.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Unselected Crate Pool (when subset X < total tracks) */}
      {unselectedTracks.length > 0 && (
        <div className="card poolCard">
          <div className="poolHeader">
            <div>
              <h3>
                Unselected Crate Pool ({unselectedTracks.length} remaining
                tracks)
              </h3>
              <p className="mutedSmall">
                Held back to keep the {orderedTracks.length}-track set tighter.
                Insert any song directly into its optimal transition slot.
              </p>
            </div>
            <input
              type="text"
              className="input poolSearchInput"
              placeholder="Search held-back tracks…"
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
            />
          </div>

          <div className="poolList">
            {filteredPool.slice(0, 80).map((track) => {
              const bestSlot = findBestInsertionPosition(track, orderedTracks)
              return (
                <div key={track.id} className="poolRow">
                  <div className="poolLeft">
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
                        {track.artistNames} • {track.albumName} (
                        {formatDuration(track.durationMs)})
                      </div>
                    </div>
                  </div>
                  <div className="poolRight">
                    <span className="camelotBadge">
                      {track.camelot} ({track.musicalKey})
                    </span>
                    <span className="bpmBadge">{track.bpm} BPM</span>
                    <button
                      type="button"
                      className="button reEditBtn small"
                      onClick={() => onInsertTrackAtBestSpot(track)}
                      title={`Insert at #${bestSlot.index + 1} (projected avg cohesion ${bestSlot.newAvgCohesion}%)`}
                    >
                      + Insert at #{bestSlot.index + 1} ({bestSlot.newAvgCohesion}
                      %)
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
