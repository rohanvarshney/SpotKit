// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useMemo, useState } from 'react'
import {
  ALL_CAMELOT_CODES,
  camelotToPitchAndMode,
  formatDuration,
  getCompatibleCamelotKeys,
  rankRemainingTracksByCohesion,
} from '../lib/camelotEngine'
import type {
  AnalyzedCrate,
  AnalyzedTrack,
  CamelotCode,
  CohesionTier,
} from '../types/spotify'

interface SetBuilderViewProps {
  crate: AnalyzedCrate
  setTracks: AnalyzedTrack[]
  onSelectTrack: (track: AnalyzedTrack) => void
  onRevertLast: () => void
  onRevertToIndex: (index: number) => void
  onResetSet: () => void
  onEndSet: () => void
  onChangeSources: () => void
  onAutoPickDemoSet?: () => void
  onReplayAnalysis?: () => void
  onConnectRealSpotify?: () => void
  onBackToLogin: () => void
  onUpdateTrackMeta: (
    trackId: string,
    updates: { bpm: number; camelot: CamelotCode },
  ) => void
}

type OpenerSort =
  | 'default'
  | 'bpm_asc'
  | 'bpm_desc'
  | 'camelot'
  | 'energy_desc'

type BpmFilter = 'all' | 'slow' | 'mid' | 'house' | 'fast'
type SourceFilter = 'all' | 'liked' | 'playlist'

function tierLabel(tier: CohesionTier): string {
  switch (tier) {
    case 'perfect':
      return 'Lock'
    case 'great':
      return 'Smooth'
    case 'good':
      return 'Compatible'
    case 'moderate':
      return 'Bridge'
    case 'clash':
      return 'Jump'
  }
}

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

export function SetBuilderView({
  crate,
  setTracks,
  onSelectTrack,
  onRevertLast,
  onRevertToIndex,
  onResetSet,
  onEndSet,
  onChangeSources,
  onAutoPickDemoSet,
  onReplayAnalysis,
  onConnectRealSpotify,
  onBackToLogin,
  onUpdateTrackMeta,
}: SetBuilderViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [camelotFilter, setCamelotFilter] = useState<'all' | CamelotCode>('all')
  const [bpmFilter, setBpmFilter] = useState<BpmFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [openerSort, setOpenerSort] = useState<OpenerSort>('default')
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [editBpm, setEditBpm] = useState<string>('')
  const [editCamelot, setEditCamelot] = useState<CamelotCode>('8A')

  const hasStarted = setTracks.length > 0
  const currentAnchor = hasStarted ? setTracks[setTracks.length - 1] : null
  const chosenIds = useMemo(
    () => new Set(setTracks.map((t) => t.id)),
    [setTracks],
  )

  const remainingTracks = useMemo(
    () => crate.tracks.filter((t) => !chosenIds.has(t.id)),
    [crate.tracks, chosenIds],
  )

  const openerCandidates = useMemo(() => {
    if (hasStarted) return []
    const q = searchQuery.trim().toLowerCase()
    const filtered = crate.tracks.filter((track) => {
      if (sourceFilter !== 'all' && !track.sources.includes(sourceFilter)) {
        return false
      }
      if (camelotFilter !== 'all' && track.camelot !== camelotFilter) {
        return false
      }
      if (bpmFilter === 'slow' && track.bpm >= 105) return false
      if (bpmFilter === 'mid' && (track.bpm < 105 || track.bpm >= 120)) {
        return false
      }
      if (bpmFilter === 'house' && (track.bpm < 120 || track.bpm > 129)) {
        return false
      }
      if (bpmFilter === 'fast' && track.bpm <= 129) return false
      if (!q) return true
      const haystack = `${track.name} ${track.artistNames} ${track.albumName} ${track.camelot} ${track.musicalKey} ${track.genreHint || ''} ${track.vibeTags || ''}`.toLowerCase()
      return haystack.includes(q)
    })

    const copy = [...filtered]
    if (openerSort === 'bpm_asc') {
      copy.sort((a, b) => a.bpm - b.bpm)
    } else if (openerSort === 'bpm_desc') {
      copy.sort((a, b) => b.bpm - a.bpm)
    } else if (openerSort === 'camelot') {
      copy.sort((a, b) => a.camelot.localeCompare(b.camelot))
    } else if (openerSort === 'energy_desc') {
      copy.sort((a, b) => b.energy - a.energy)
    }
    return copy
  }, [
    hasStarted,
    crate.tracks,
    searchQuery,
    sourceFilter,
    camelotFilter,
    bpmFilter,
    openerSort,
  ])

  const rankedRemaining = useMemo(() => {
    if (!currentAnchor) return []
    const ranked = rankRemainingTracksByCohesion(currentAnchor, remainingTracks)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return ranked
    return ranked.filter(({ track }) => {
      const haystack = `${track.name} ${track.artistNames} ${track.albumName} ${track.camelot} ${track.musicalKey} ${track.genreHint || ''} ${track.vibeTags || ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [currentAnchor, remainingTracks, searchQuery])

  const compatibleKeys = useMemo(
    () => (currentAnchor ? getCompatibleCamelotKeys(currentAnchor.camelot) : null),
    [currentAnchor],
  )

  const totalSetDurationMs = useMemo(
    () => setTracks.reduce((acc, t) => acc + t.durationMs, 0),
    [setTracks],
  )

  const openEditor = (track: AnalyzedTrack, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingTrackId(track.id)
    setEditBpm(String(track.bpm))
    setEditCamelot(track.camelot)
  }

  const saveEditor = (trackId: string, e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const parsedBpm = Number.parseInt(editBpm, 10)
    const validBpm = Number.isFinite(parsedBpm)
      ? Math.min(220, Math.max(45, parsedBpm))
      : 120
    onUpdateTrackMeta(trackId, { bpm: validBpm, camelot: editCamelot })
    setEditingTrackId(null)
  }

  const showEstimationNote = crate.featureSummary.estimated > 0

  return (
    <div className="builderWrap">
      {/* Top Session / Demo Header + Set Controls */}
      <div className="card builderToolbarCard">
        <div className="builderTopRow">
          <div>
            <div className="badgeRow">
              <span className="heroBadge">
                {crate.isDemo ? 'DEMO MODE' : 'SPOTIFY CONNECTED'}
              </span>
              <span className="sessionUserName">
                {crate.user.display_name || crate.user.id}
              </span>
              <span className="metaPill">
                {crate.tracks.length.toLocaleString()} Analyzed Tracks
              </span>
              {crate.playlistMeta && (
                <span className="metaPill playlistMetaPill">
                  📋 {crate.playlistMeta.name}
                </span>
              )}
              {showEstimationNote && (
                <span
                  className="metaPill subtleWarnPill"
                  title="Spotify restricted /audio-features in Dev Mode for some tracks, so MakeASet used public lookup + deterministic estimates. You can manually fine-tune any track's BPM or Camelot key with the Edit button."
                >
                  ℹ {crate.featureSummary.estimated} estimated (editable)
                </span>
              )}
            </div>
            <h2 className="builderHeading">
              {hasStarted
                ? `Building Set (${setTracks.length} track${setTracks.length === 1 ? '' : 's'} • ${formatDuration(totalSetDurationMs)})`
                : 'Step 1: Pick Your First Song'}
            </h2>
          </div>

          <div className="builderActions">
            {crate.isDemo && onConnectRealSpotify && (
              <button
                type="button"
                className="button spotifyBtn small"
                onClick={onConnectRealSpotify}
              >
                Connect Real Spotify
              </button>
            )}
            {crate.isDemo && onAutoPickDemoSet && (
              <button
                type="button"
                className="button demoBtn small"
                onClick={() => {
                  setSearchQuery('')
                  onAutoPickDemoSet()
                }}
                title="Automatically pick a cohesive 4-track demo set to test breadcrumbs, revert, and End Set"
              >
                ⚡ Auto-Pick 4-Track Demo Set
              </button>
            )}
            {crate.isDemo && onReplayAnalysis && (
              <button
                type="button"
                className="button small"
                onClick={onReplayAnalysis}
                title="Replay the 5-stage track-by-track analysis animation"
              >
                ↻ Replay Analysis
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
              {crate.isDemo ? 'Back to Login' : 'Disconnect'}
            </button>
          </div>
        </div>

        {/* Interactive Set Path / Revert Trail + End Set */}
        <div className="setTrailBox">
          <div className="setTrailHeader">
            <div>
              <span>CURRENT SET PATH</span>
              <span className="mutedSmall" style={{ marginLeft: 10, fontWeight: 450, textTransform: 'none', letterSpacing: 'normal' }}>
                {hasStarted
                  ? 'Click any earlier track to revert back to that point'
                  : 'Select your opening track below to unlock Cohesion Score ranking'}
              </span>
            </div>
            <div className="row">
              <button
                type="button"
                className="button secondary small"
                onClick={onRevertLast}
                disabled={!hasStarted}
              >
                ↩ Undo Last
              </button>
              <button
                type="button"
                className="button secondary small"
                onClick={onResetSet}
                disabled={!hasStarted}
              >
                Reset Set
              </button>
              <button
                type="button"
                className="button endSetBtn small"
                onClick={onEndSet}
                disabled={!hasStarted}
              >
                🏁 End Set ({setTracks.length})
              </button>
            </div>
          </div>

          {!hasStarted ? (
            <div className="setTrailEmpty">
              No tracks selected yet — choose your opening track from the analyzed
              crate below
              {crate.isDemo
                ? ', or click "⚡ Auto-Pick 4-Track Demo Set" above to test right away.'
                : '.'}
            </div>
          ) : (
            <div className="trailNodes">
              {setTracks.map((track, idx) => {
                const isLast = idx === setTracks.length - 1
                return (
                  <div key={track.id} className="trailStepGroup">
                    {idx > 0 && <span className="trailArrow">→</span>}
                    <button
                      type="button"
                      className={`trailNode ${isLast ? 'current' : ''}`}
                      onClick={() => {
                        if (!isLast) onRevertToIndex(idx)
                      }}
                      title={
                        isLast
                          ? 'Newest selected song (Cohesion anchor)'
                          : `Revert set back to #${idx + 1} ${track.name}`
                      }
                    >
                      <span className="trailIdx">#{idx + 1}</span>
                      <span className="trailName">{track.name}</span>
                      <span className="trailMeta">
                        {track.camelot} • {track.bpm}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Current Anchor Banner (Step 2+) */}
      {currentAnchor && compatibleKeys && (
        <div className="card anchorCard">
          <div className="anchorLabelRow">
            <span className="anchorBadge">ACTIVE ANCHOR (NEWEST SELECTION)</span>
            <span className="mutedSmall">
              All {rankedRemaining.length.toLocaleString()} remaining songs below
              are sorted by Cohesion Score against this track
            </span>
          </div>

          <div className="anchorBody">
            <div className="anchorTrackInfo">
              {currentAnchor.albumArtUrl ? (
                <img
                  src={currentAnchor.albumArtUrl}
                  alt={currentAnchor.albumName}
                  className="anchorArt"
                />
              ) : (
                <div className="anchorArt placeholderArt">🎵</div>
              )}
              <div>
                <div className="anchorTitle">{currentAnchor.name}</div>
                <div className="anchorArtist">
                  {currentAnchor.artistNames} — {currentAnchor.albumName}
                </div>
                <div className="anchorMetrics">
                  <span className="camelotBadge large">
                    {currentAnchor.camelot} ({currentAnchor.musicalKey})
                  </span>
                  <span className="bpmBadge large">
                    {currentAnchor.bpm} BPM
                  </span>
                  <span className="energyBadge">
                    Energy {Math.round(currentAnchor.energy * 100)}%
                  </span>
                  <button
                    type="button"
                    className="inlineEditBtn"
                    onClick={(e) => openEditor(currentAnchor, e)}
                  >
                    ✎ Tune Key/BPM
                  </button>
                </div>
              </div>
            </div>

            <div className="camelotWheelBox">
              <div className="camelotWheelLabel">Best Camelot Targets</div>
              <div className="camelotTargetRow">
                <span className="targetChip exact" title="Same Key (50/50 harmonic)">
                  Exact: {compatibleKeys.exact}
                </span>
                <span className="targetChip relative" title="Relative Major/Minor (46/50 harmonic)">
                  Relative: {compatibleKeys.relative}
                </span>
                <span className="targetChip fifth" title="±1 Fifth (44/50 harmonic)">
                  ±1 Fifth: {compatibleKeys.fifthDown} / {compatibleKeys.fifthUp}
                </span>
              </div>
            </div>
          </div>

          {editingTrackId === currentAnchor.id && (
            <form
              className="inlineEditForm"
              onSubmit={(e) => saveEditor(currentAnchor.id, e)}
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
                  onChange={(e) => setEditCamelot(e.target.value as CamelotCode)}
                >
                  {ALL_CAMELOT_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code} ({camelotToPitchAndMode(code).musicalKey})
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button spotifyBtn small">
                Apply &amp; Re-Sort
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
      )}

      {/* Search & Filter Bar */}
      <div className="card filterCard">
        {!hasStarted ? (
          <div className="openerFilterGrid">
            <input
              type="text"
              className="input"
              placeholder="Search opener by title, artist, album, key (e.g. '8A'), or vibe…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="select"
              value={camelotFilter}
              onChange={(e) =>
                setCamelotFilter(e.target.value as 'all' | CamelotCode)
              }
              aria-label="Filter by Camelot Key"
            >
              <option value="all">All Camelot Keys</option>
              {ALL_CAMELOT_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} ({camelotToPitchAndMode(code).musicalKey})
                </option>
              ))}
            </select>
            <select
              className="select"
              value={bpmFilter}
              onChange={(e) => setBpmFilter(e.target.value as BpmFilter)}
              aria-label="Filter by BPM range"
            >
              <option value="all">All BPMs</option>
              <option value="slow">&lt; 105 BPM (Downtempo / Halftime)</option>
              <option value="mid">105–119 BPM (Warm-up)</option>
              <option value="house">120–129 BPM (House / Club)</option>
              <option value="fast">130+ BPM (Peak / DnB)</option>
            </select>
            <select
              className="select"
              value={openerSort}
              onChange={(e) => setOpenerSort(e.target.value as OpenerSort)}
              aria-label="Sort opening candidates"
            >
              <option value="default">Crate Order</option>
              <option value="bpm_asc">BPM: Low → High</option>
              <option value="bpm_desc">BPM: High → Low</option>
              <option value="camelot">Camelot Wheel (1A → 12B)</option>
              <option value="energy_desc">Energy: High → Low</option>
            </select>
          </div>
        ) : (
          <div className="nextFilterRow">
            <input
              type="text"
              className="input"
              placeholder="Optional: filter remaining songs by title, artist, or key (Cohesion sort order preserved)…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="button secondary small"
                onClick={() => setSearchQuery('')}
              >
                Clear Filter
              </button>
            )}
          </div>
        )}

        {!hasStarted && crate.sourceMode === 'both' && (
          <div className="sourceFilterChips">
            <span className="mutedSmall">Source Filter:</span>
            {(['all', 'liked', 'playlist'] as SourceFilter[]).map((sf) => (
              <button
                key={sf}
                type="button"
                className={`chipToggle ${sourceFilter === sf ? 'active' : ''}`}
                onClick={() => setSourceFilter(sf)}
              >
                {sf === 'all' && `All (${crate.tracks.length})`}
                {sf === 'liked' && `♥ Liked Songs (${crate.likedCount})`}
                {sf === 'playlist' && `📋 Playlist (${crate.playlistCount})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Candidate List */}
      {!hasStarted ? (
        <div className="candidateListSection">
          <div className="sectionHeaderRow">
            <h3>
              Choose Opening Track ({openerCandidates.length.toLocaleString()}{' '}
              {openerCandidates.length === 1 ? 'track' : 'tracks'})
            </h3>
          </div>

          {openerCandidates.length === 0 ? (
            <div className="card emptyStateCard">
              No tracks match your current filter. Clear filters to see your full
              crate.
            </div>
          ) : (
            <div className="tracksGrid">
              {openerCandidates.slice(0, 150).map((track) => (
                <div
                  key={track.id}
                  className="trackCard openerCard"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSearchQuery('')
                    onSelectTrack(track)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSearchQuery('')
                      onSelectTrack(track)
                    }
                  }}
                >
                  <div className="trackCardTop">
                    {track.albumArtUrl ? (
                      <img
                        src={track.albumArtUrl}
                        alt={track.albumName}
                        className="trackThumb"
                      />
                    ) : (
                      <div className="trackThumb placeholderArt">🎵</div>
                    )}
                    <div className="trackMainInfo">
                      <div className="trackTitle">{track.name}</div>
                      <div className="trackArtist">{track.artistNames}</div>
                      <div className="trackAlbum">
                        {track.albumName} • {formatDuration(track.durationMs)}
                      </div>
                    </div>
                  </div>

                  <div className="trackMetricsRow">
                    <span className="camelotBadge">
                      {track.camelot} ({track.musicalKey})
                    </span>
                    <span className="bpmBadge">{track.bpm} BPM</span>
                    <span className="energyBadge">
                      ⚡ {Math.round(track.energy * 100)}%
                    </span>
                    <span className="sourceBadge">
                      {featureSourceTag(track)}
                    </span>
                  </div>

                  <div className="trackCardFooter">
                    <button
                      type="button"
                      className="inlineEditBtn"
                      onClick={(e) => openEditor(track, e)}
                    >
                      ✎ Edit BPM/Key
                    </button>
                    <span className="selectTrackCta">Pick as Opener →</span>
                  </div>

                  {editingTrackId === track.id && (
                    <form
                      className="inlineEditForm"
                      onClick={(e) => e.stopPropagation()}
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
                        Key
                        <select
                          className="select smallInput"
                          value={editCamelot}
                          onChange={(e) =>
                            setEditCamelot(e.target.value as CamelotCode)
                          }
                        >
                          {ALL_CAMELOT_CODES.map((code) => (
                            <option key={code} value={code}>
                              {code} ({camelotToPitchAndMode(code).musicalKey})
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
                        ✕
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          {openerCandidates.length > 150 && (
            <p className="mutedSmall" style={{ marginTop: 12, textAlign: 'center' }}>
              Showing first 150 matching tracks. Use search or key/BPM filters to
              narrow down larger libraries.
            </p>
          )}
        </div>
      ) : (
        <div className="candidateListSection">
          <div className="sectionHeaderRow">
            <h3>
              Next Track Options — Ranked by Cohesion After &ldquo;
              {currentAnchor?.name}&rdquo;
            </h3>
            <span className="mutedSmall">
              {rankedRemaining.length.toLocaleString()} remaining
            </span>
          </div>

          {rankedRemaining.length === 0 ? (
            <div className="card emptyStateCard">
              {remainingTracks.length === 0 ? (
                <>
                  You&apos;ve included every track in your crate! Click{' '}
                  <strong>🏁 End Set</strong> above to review and save your
                  playlist.
                </>
              ) : (
                <>
                  No remaining songs match &ldquo;{searchQuery}&rdquo;. Clear
                  your search filter to view all cohesion-ranked songs.
                </>
              )}
            </div>
          ) : (
            <div className="rankedList">
              {rankedRemaining.slice(0, 120).map(({ track, cohesion }, rankIdx) => (
                <div
                  key={track.id}
                  className={`rankedRow tier-${cohesion.tier}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSearchQuery('')
                    onSelectTrack(track)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSearchQuery('')
                      onSelectTrack(track)
                    }
                  }}
                >
                  <div className="rankedLeft">
                    <div className="rankIndex">#{rankIdx + 1}</div>
                    {track.albumArtUrl ? (
                      <img
                        src={track.albumArtUrl}
                        alt={track.albumName}
                        className="trackThumbSmall"
                      />
                    ) : (
                      <div className="trackThumbSmall placeholderArt">🎵</div>
                    )}
                    <div className="rankedTrackInfo">
                      <div className="trackTitle">{track.name}</div>
                      <div className="trackArtist">
                        {track.artistNames} • {track.albumName} (
                        {formatDuration(track.durationMs)})
                      </div>
                      <div className="cohesionReasonsRow">
                        <span className="reasonChip">
                          🎡 {cohesion.harmonicLabel} ({cohesion.harmonicScore}/50)
                        </span>
                        <span className="reasonChip">
                          ⏱️ {cohesion.bpmLabel} ({cohesion.bpmScore}/40)
                        </span>
                        <span className="reasonChip">
                          ⚡ Energy {Math.round(track.energy * 100)}% ({cohesion.energyScore}/10)
                        </span>
                        <button
                          type="button"
                          className="inlineEditBtn"
                          onClick={(e) => openEditor(track, e)}
                        >
                          ✎ Tune
                        </button>
                      </div>

                      {editingTrackId === track.id && (
                        <form
                          className="inlineEditForm"
                          onClick={(e) => e.stopPropagation()}
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
                            Camelot
                            <select
                              className="select smallInput"
                              value={editCamelot}
                              onChange={(e) =>
                                setEditCamelot(e.target.value as CamelotCode)
                              }
                            >
                              {ALL_CAMELOT_CODES.map((code) => (
                                <option key={code} value={code}>
                                  {code} ({camelotToPitchAndMode(code).musicalKey})
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
                            ✕
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  <div className="rankedRight">
                    <div className="rankedBadges">
                      <span className="camelotBadge">
                        {track.camelot} ({track.musicalKey})
                      </span>
                      <span className="bpmBadge">{track.bpm} BPM</span>
                    </div>
                    <div className={`cohesionScorePill tier-${cohesion.tier}`}>
                      <span className="cohesionPct">{cohesion.totalScore}%</span>
                      <span className="cohesionSub">
                        {tierLabel(cohesion.tier)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
