// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef, useState } from 'react'
import './App.css'
import freehandSignatureUrl from './assets/freehand-signature-3.png'
import brandLogoUrl from './assets/logo.png'
import { LoginView } from './components/LoginView'
import { PlaylistResultView } from './components/PlaylistResultView'
import { SequencingView } from './components/SequencingView'
import { SourceDialogView } from './components/SourceDialogView'
import { camelotToPitchAndMode } from './lib/camelotEngine'
import {
  evaluateTrackSequence,
  findBestInsertionPosition,
  sequencePlaylist,
} from './lib/djSequencer'
import {
  InsufficientScopeError,
  createSpotifyPlaylistFromSet,
  fetchAndAnalyzeCrate,
} from './lib/spotifyApi'
import {
  clearSpotifySession,
  consumePendingPlaylistState,
  getValidAccessToken,
  handleOAuthCallbackIfPresent,
  hasPlaylistWriteScope,
  savePendingPlaylistState,
  startSpotifyLogin,
} from './lib/spotifyAuth'
import { buildDemoCrate } from './mocks/demoData'
import type {
  AnalyzedCrate,
  AnalyzedTrack,
  CamelotCode,
  CreatedPlaylistResult,
  NarrationLogEntry,
  SequenceStageId,
  SequencerResult,
  SequencingProgress,
  SourceMode,
} from './types/spotify'

type AppScreen = 'login' | 'source_dialog' | 'sequencing' | 'result'

const INITIAL_PROGRESS: SequencingProgress = {
  stage: 'sources',
  stageLabel: 'Loading Your Selected Playlist',
  detail: 'Preparing song key & BPM analysis…',
  tracksFetched: 0,
  tracksTotal: 0,
  tracksAnalyzed: 0,
  branchesExplored: 0,
  currentCohesion: 0,
  narrationLogs: [],
  percent: 4,
}

function isSpotifyAuthOrAllowlistError(message: string): boolean {
  return (
    message.includes('(401)') ||
    (message.includes('(403)') && !/insufficient client scope/i.test(message)) ||
    /not registered/i.test(message)
  )
}

function hasDemoQueryParam(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('demo') || window.location.hash === '#demo'
}

function clearDemoQueryParam(): void {
  if (!hasDemoQueryParam()) return
  const url = new URL(window.location.href)
  url.searchParams.delete('demo')
  if (url.hash === '#demo') url.hash = ''
  window.history.replaceState(null, '', url.toString())
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>('login')
  const [isDemo, setIsDemo] = useState<boolean>(false)
  const [sourceMode, setSourceMode] = useState<SourceMode>('liked')
  const [playlistUrl, setPlaylistUrl] = useState<string>('')
  const [maxTracks, setMaxTracks] = useState<number | null>(null)
  const [preferredOpenerId, setPreferredOpenerId] = useState<string | null>(
    null,
  )
  const [crate, setCrate] = useState<AnalyzedCrate | null>(null)
  const [sequencerResult, setSequencerResult] =
    useState<SequencerResult | null>(null)
  const [progress, setProgress] =
    useState<SequencingProgress>(INITIAL_PROGRESS)
  const [error, setError] = useState<string | null>(null)
  const [needsWriteReauth, setNeedsWriteReauth] = useState<boolean>(false)

  const narrationTimerRef = useRef<number | null>(null)
  const runIdRef = useRef<number>(0)

  const clearNarrationTimer = () => {
    if (narrationTimerRef.current !== null) {
      window.clearInterval(narrationTimerRef.current)
      narrationTimerRef.current = null
    }
  }

  useEffect(() => {
    let cancelled = false

    async function initAuth() {
      if (hasDemoQueryParam()) {
        setIsDemo(true)
        setScreen('source_dialog')
        return
      }
      try {
        const token = await handleOAuthCallbackIfPresent()
        if (cancelled) return

        const pending = consumePendingPlaylistState()
        if (token && pending) {
          const trackById = new Map(
            pending.crate.tracks.map((t) => [t.id, t]),
          )
          const restoredOrdered = pending.orderedTrackIds
            .map((id) => trackById.get(id))
            .filter((t): t is AnalyzedTrack => Boolean(t))

          const fallbackResult = sequencePlaylist(pending.crate.tracks, {
            maxTracks: pending.maxTracks,
            preferredOpenerId: pending.preferredOpenerId,
          })

          const evaluated =
            restoredOrdered.length > 0
              ? evaluateTrackSequence(restoredOrdered, pending.crate.tracks)
              : fallbackResult

          setCrate(pending.crate)
          setMaxTracks(pending.maxTracks)
          setPreferredOpenerId(pending.preferredOpenerId)
          setIsDemo(pending.crate.isDemo)
          setSourceMode(pending.crate.sourceMode)
          setNeedsWriteReauth(!hasPlaylistWriteScope())
          setSequencerResult({
            ...evaluated,
            baselineCohesion: fallbackResult.baselineCohesion,
            branchesExplored: fallbackResult.branchesExplored,
            backtracksCount: fallbackResult.backtracksCount,
            iterativeImprovements: fallbackResult.iterativeImprovements,
            narrationLogs:
              pending.narrationLogs.length > 0
                ? pending.narrationLogs
                : fallbackResult.narrationLogs,
          })
          setScreen('result')
          return
        }

        if (token) {
          setIsDemo(false)
          setNeedsWriteReauth(!hasPlaylistWriteScope())
          setScreen('source_dialog')
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          if (isSpotifyAuthOrAllowlistError(msg)) {
            clearSpotifySession()
          }
          setError(msg)
          setScreen('login')
        }
      }
    }

    void initAuth()
    return () => {
      cancelled = true
      clearNarrationTimer()
    }
  }, [])

  const handleLoginClick = async (forceDialog = false) => {
    try {
      setError(null)
      await startSpotifyLogin({ forceDialog: forceDialog === true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleStartDemo = () => {
    clearNarrationTimer()
    runIdRef.current += 1
    setError(null)
    setIsDemo(true)
    setSourceMode('liked')
    setPlaylistUrl('')
    setMaxTracks(null)
    setPreferredOpenerId(null)
    setCrate(null)
    setSequencerResult(null)
    setNeedsWriteReauth(false)
    setScreen('source_dialog')
  }

  const handleSwitchDemoSource = (
    nextMode: SourceMode,
    nextPlaylistUrl: string,
    replayAnimation: boolean,
  ) => {
    clearNarrationTimer()
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setError(null)
    setIsDemo(true)
    setSourceMode(nextMode)
    setPlaylistUrl(nextPlaylistUrl)
    setPreferredOpenerId(null)

    const demoCrate = buildDemoCrate(nextMode, nextPlaylistUrl)
    const seqResult = sequencePlaylist(demoCrate.tracks, {
      maxTracks,
    })

    if (!replayAnimation) {
      setCrate(demoCrate)
      setSequencerResult(seqResult)
      setScreen('result')
      return
    }

    playNarratedSequencing({
      analyzedCrate: demoCrate,
      seqResult,
      chosenMaxTracks: maxTracks,
      chosenOpenerId: null,
      includeImportStages: true,
      runId,
    })
  }

  const playNarratedSequencing = (options: {
    analyzedCrate: AnalyzedCrate
    seqResult: SequencerResult
    chosenMaxTracks: number | null
    chosenOpenerId: string | null
    includeImportStages: boolean
    runId: number
  }) => {
    clearNarrationTimer()
    const {
      analyzedCrate,
      seqResult,
      chosenMaxTracks,
      chosenOpenerId,
      includeImportStages,
      runId,
    } = options
    const total = analyzedCrate.tracks.length
    const t0 = analyzedCrate.tracks[0]
    const t1 = analyzedCrate.tracks[Math.min(1, total - 1)]
    const tLast = analyzedCrate.tracks[total - 1]

    const frames: SequencingProgress[] = []

    if (includeImportStages) {
      frames.push({
        stage: 'sources',
        stageLabel: 'Importing Demo Crate',
        detail:
          analyzedCrate.sourceMode === 'liked'
            ? `Loaded ${total} Liked Songs from SpotKit Demo DJ…`
            : analyzedCrate.sourceMode === 'playlist'
              ? `Loaded ${total} tracks from "${analyzedCrate.playlistMeta?.name ?? 'Public Playlist'}"…`
              : `Merged ${total} unique tracks across Liked Songs & "${analyzedCrate.playlistMeta?.name ?? 'Playlist'}"…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: 0,
        branchesExplored: 0,
        currentCohesion: 0,
        narrationLogs: [],
        percent: 14,
      })

      frames.push({
        stage: 'audio_features',
        stageLabel: 'Scanning Audio Features & Tempo',
        detail: `Resolving BPM & key signatures across ${total} tracks…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: Math.round(total * 0.45),
        branchesExplored: 0,
        currentCohesion: 0,
        narrationLogs: t0
          ? [
              {
                id: 'pre_1',
                step: 0,
                phase: 'scan',
                badge: 'AUDIO',
                message: `Scanned "${t0.name}" → ${t0.camelot} (${t0.musicalKey}) • ${t0.bpm} BPM`,
              },
              ...(t1 && t1.id !== t0.id
                ? [
                    {
                      id: 'pre_2',
                      step: 0,
                      phase: 'scan' as const,
                      badge: 'AUDIO',
                      message: `Scanned "${t1.name}" → ${t1.camelot} (${t1.musicalKey}) • ${t1.bpm} BPM`,
                    },
                  ]
                : []),
            ]
          : [],
        percent: 30,
      })

      frames.push({
        stage: 'camelot_mapping',
        stageLabel: 'Mapping Song Keys Across Playlist',
        detail: `All ${total} tracks mapped (${tLast ? `through "${tLast.name}"` : 'complete'}) — starting harmonic census…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: total,
        branchesExplored: 0,
        currentCohesion: 0,
        narrationLogs: seqResult.narrationLogs.slice(0, 1),
        percent: 46,
      })
    }

    const totalLogs = seqResult.narrationLogs.length
    const startIdx = includeImportStages ? 1 : 0

    for (let i = startIdx; i < totalLogs; i += 1) {
      const entry = seqResult.narrationLogs[i]
      const ratio = totalLogs > 1 ? (i + 1) / totalLogs : 1
      const stage: SequenceStageId =
        entry.phase === 'scan' || entry.phase === 'cluster'
          ? 'camelot_mapping'
          : entry.phase === 'recursive' || entry.phase === 'backtrack'
            ? 'recursive_search'
            : entry.phase === 'iterate'
              ? 'iterative_refine'
              : 'ready'

      const stageLabel =
        stage === 'camelot_mapping'
          ? 'Full-Crate Song Key & BPM Census'
          : stage === 'recursive_search'
            ? 'Recursive Lookahead & Backtracking'
            : stage === 'iterative_refine'
              ? 'Iterative 2-Opt & Transition Polish'
              : 'Optimal DJ Sequence Locked'

      const basePct = includeImportStages ? 50 : 82
      const pct = Math.min(
        100,
        Math.round(basePct + ratio * (100 - basePct)),
      )

      const estBranches =
        stage === 'camelot_mapping'
          ? 0
          : Math.round(seqResult.branchesExplored * Math.min(1, ratio * 1.1))

      const liveCohesion =
        stage === 'ready'
          ? seqResult.avgCohesion
          : stage === 'iterative_refine'
            ? seqResult.avgCohesion
            : seqResult.baselineCohesion > 0
              ? Math.min(
                  seqResult.avgCohesion,
                  Math.round(
                    seqResult.baselineCohesion +
                      (seqResult.avgCohesion - seqResult.baselineCohesion) *
                        ratio,
                  ),
                )
              : seqResult.avgCohesion

      frames.push({
        stage,
        stageLabel,
        detail: entry.message,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: total,
        branchesExplored: estBranches,
        currentCohesion: liveCohesion,
        narrationLogs: seqResult.narrationLogs.slice(0, i + 1),
        percent: pct,
      })
    }

    if (frames.length === 0) {
      setCrate(analyzedCrate)
      setSequencerResult(seqResult)
      setMaxTracks(chosenMaxTracks)
      setPreferredOpenerId(chosenOpenerId)
      setScreen('result')
      return
    }

    setProgress(frames[0])
    setScreen('sequencing')

    let frameIdx = 0
    const intervalMs = frames.length > 16 ? 260 : 340

    narrationTimerRef.current = window.setInterval(() => {
      if (runIdRef.current !== runId) {
        clearNarrationTimer()
        return
      }
      frameIdx += 1
      if (frameIdx < frames.length) {
        setProgress(frames[frameIdx])
      } else {
        clearNarrationTimer()
        setCrate(analyzedCrate)
        setSequencerResult(seqResult)
        setMaxTracks(chosenMaxTracks)
        setPreferredOpenerId(chosenOpenerId)
        setScreen('result')
      }
    }, intervalMs)
  }

  const handleContinueFromSourceDialog = async (
    chosenMode: SourceMode,
    chosenUrl: string,
    chosenMaxTracks: number | null,
    skipAnimation = false,
  ) => {
    clearNarrationTimer()
    setError(null)
    setSourceMode(chosenMode)
    setPlaylistUrl(chosenUrl)
    setMaxTracks(chosenMaxTracks)
    setPreferredOpenerId(null)

    const runId = runIdRef.current + 1
    runIdRef.current = runId

    if (isDemo) {
      const demoCrate = buildDemoCrate(chosenMode, chosenUrl)
      const seqResult = sequencePlaylist(demoCrate.tracks, {
        maxTracks: chosenMaxTracks,
      })

      if (skipAnimation) {
        setCrate(demoCrate)
        setSequencerResult(seqResult)
        setScreen('result')
        return
      }

      playNarratedSequencing({
        analyzedCrate: demoCrate,
        seqResult,
        chosenMaxTracks,
        chosenOpenerId: null,
        includeImportStages: true,
        runId,
      })
      return
    }

    const token = await getValidAccessToken()
    if (!token) {
      clearSpotifySession()
      setError('Your Spotify session expired. Please reconnect.')
      setScreen('login')
      return
    }

    setNeedsWriteReauth(!hasPlaylistWriteScope())
    setProgress(INITIAL_PROGRESS)
    setScreen('sequencing')

    try {
      const analyzedCrate = await fetchAndAnalyzeCrate({
        accessToken: token,
        sourceMode: chosenMode,
        playlistUrl: chosenUrl,
        onProgress: (p) => {
          if (runIdRef.current !== runId) return
          const mappedStage: SequenceStageId =
            p.stage === 'sources'
              ? 'sources'
              : p.stage === 'audio_features' || p.stage === 'fallback_lookup'
                ? 'audio_features'
                : 'camelot_mapping'

          const scanLogs: NarrationLogEntry[] = [...p.recentLogs]
            .reverse()
            .map((msg, i) => ({
              id: `fetch_log_${i}`,
              step: i + 1,
              phase: 'scan',
              badge: 'SCAN',
              message: msg,
            }))

          setProgress({
            stage: mappedStage,
            stageLabel: p.stageLabel,
            detail: p.detail,
            tracksFetched: p.tracksFetched,
            tracksTotal: p.tracksTotal,
            tracksAnalyzed: p.tracksAnalyzed,
            branchesExplored: 0,
            currentCohesion: 0,
            narrationLogs: scanLogs,
            percent: p.percent,
          })
        },
      })

      if (runIdRef.current !== runId) return

      const seqResult = sequencePlaylist(analyzedCrate.tracks, {
        maxTracks: chosenMaxTracks,
      })

      if (skipAnimation) {
        setCrate(analyzedCrate)
        setSequencerResult(seqResult)
        setScreen('result')
        return
      }

      playNarratedSequencing({
        analyzedCrate,
        seqResult,
        chosenMaxTracks,
        chosenOpenerId: null,
        includeImportStages: false,
        runId,
      })
    } catch (err) {
      if (runIdRef.current !== runId) return
      const msg = err instanceof Error ? err.message : String(err)
      if (isSpotifyAuthOrAllowlistError(msg)) {
        clearSpotifySession()
        setError(msg)
        setScreen('login')
      } else {
        setError(msg)
        setScreen('source_dialog')
      }
    }
  }

  const handleCancelSequencing = () => {
    runIdRef.current += 1
    clearNarrationTimer()
    setScreen('source_dialog')
  }

  const handleReplayNarration = () => {
    if (!crate) return
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    const freshResult = sequencePlaylist(crate.tracks, {
      maxTracks,
      preferredOpenerId,
    })
    playNarratedSequencing({
      analyzedCrate: crate,
      seqResult: freshResult,
      chosenMaxTracks: maxTracks,
      chosenOpenerId: preferredOpenerId,
      includeImportStages: crate.isDemo,
      runId,
    })
  }

  const handleRerunSequencer = (
    nextMaxTracks: number | null,
    nextPreferredOpenerId: string | null,
  ) => {
    if (!crate) return
    setMaxTracks(nextMaxTracks)
    setPreferredOpenerId(nextPreferredOpenerId)
    const nextResult = sequencePlaylist(crate.tracks, {
      maxTracks: nextMaxTracks,
      preferredOpenerId: nextPreferredOpenerId,
    })
    setSequencerResult(nextResult)
  }

  const handleMoveTrack = (fromIndex: number, toIndex: number) => {
    if (!crate || !sequencerResult) return
    const list = [...sequencerResult.orderedTracks]
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return
    }
    const [moved] = list.splice(fromIndex, 1)
    list.splice(toIndex, 0, moved)
    const evaluated = evaluateTrackSequence(list, crate.tracks)
    setSequencerResult({
      ...sequencerResult,
      ...evaluated,
    })
  }

  const handleRemoveTrack = (trackId: string) => {
    if (!crate || !sequencerResult || sequencerResult.orderedTracks.length <= 1) {
      return
    }
    const nextOrdered = sequencerResult.orderedTracks.filter(
      (t) => t.id !== trackId,
    )
    const evaluated = evaluateTrackSequence(nextOrdered, crate.tracks)
    setSequencerResult({
      ...sequencerResult,
      ...evaluated,
    })
  }

  const handleInsertTrackAtBestSpot = (track: AnalyzedTrack) => {
    if (!crate || !sequencerResult) return
    if (sequencerResult.orderedTracks.some((t) => t.id === track.id)) return

    const bestSlot = findBestInsertionPosition(
      track,
      sequencerResult.orderedTracks,
    )
    const nextOrdered = [...sequencerResult.orderedTracks]
    nextOrdered.splice(bestSlot.index, 0, track)

    const evaluated = evaluateTrackSequence(nextOrdered, crate.tracks)
    const nextLog: NarrationLogEntry = {
      id: `manual_insert_${Date.now().toString(36)}`,
      step: sequencerResult.narrationLogs.length + 1,
      phase: 'iterate',
      badge: 'INSERT',
      message: `Inserted "${track.name}" (${track.camelot} • ${track.bpm} BPM) from crate pool at slot #${bestSlot.index + 1}.`,
      detail: `Selected optimal bridge position based on adjacent song key & BPM cohesion.`,
      scoreImpact: `${evaluated.avgCohesion}% avg`,
    }

    setSequencerResult({
      ...sequencerResult,
      ...evaluated,
      narrationLogs: [...sequencerResult.narrationLogs, nextLog],
    })
  }

  const handleUpdateTrackMeta = (
    trackId: string,
    updates: { bpm: number; camelot: CamelotCode },
  ) => {
    if (!crate || !sequencerResult) return
    const camInfo = camelotToPitchAndMode(updates.camelot)
    const patchTrack = (t: AnalyzedTrack): AnalyzedTrack =>
      t.id === trackId
        ? {
            ...t,
            bpm: updates.bpm,
            camelot: updates.camelot,
            musicalKey: camInfo.musicalKey,
            pitchClass: camInfo.pitchClass,
            mode: camInfo.mode,
            featureSource: 'manual',
          }
        : t

    const nextCrateTracks = crate.tracks.map(patchTrack)
    const nextOrdered = sequencerResult.orderedTracks.map(patchTrack)
    const evaluated = evaluateTrackSequence(nextOrdered, nextCrateTracks)

    setCrate({
      ...crate,
      tracks: nextCrateTracks,
    })
    setSequencerResult({
      ...sequencerResult,
      ...evaluated,
    })
  }

  const handleAuthorizeWriteScope = async () => {
    if (!crate || !sequencerResult) return
    savePendingPlaylistState({
      crate,
      maxTracks,
      preferredOpenerId,
      orderedTrackIds: sequencerResult.orderedTracks.map((t) => t.id),
      narrationLogs: sequencerResult.narrationLogs,
    })
    await startSpotifyLogin({ forceDialog: true })
  }

  const handleCreatePlaylist = async (options: {
    name: string
    description: string
    isPublic: boolean
  }): Promise<CreatedPlaylistResult> => {
    const tracksToSave = sequencerResult?.orderedTracks ?? []
    if (isDemo || crate?.isDemo) {
      return {
        id: `demo_${Date.now().toString(36)}`,
        name: options.name.trim() || 'DJMyPlaylist Demo Mix',
        externalUrl: 'https://open.spotify.com/',
        trackCount: tracksToSave.length,
        isPublic: options.isPublic,
        isDemo: true,
      }
    }

    const token = await getValidAccessToken()
    if (!token) {
      throw new Error(
        'Spotify access token expired. Authorize Spotify again to generate your playlist.',
      )
    }

    try {
      return await createSpotifyPlaylistFromSet({
        accessToken: token,
        name: options.name,
        description: options.description,
        isPublic: options.isPublic,
        tracks: tracksToSave,
      })
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        setNeedsWriteReauth(true)
        throw new Error(
          'Your current Spotify session is missing playlist creation permissions. Click "Authorize Spotify Playlist Creation →" above to grant permission without losing your sequenced tracklist.',
        )
      }
      throw err
    }
  }

  const handleExitToLogin = async () => {
    runIdRef.current += 1
    clearNarrationTimer()
    if (isDemo || crate?.isDemo) {
      // Leaving the demo should never sign a connected user out.
      clearDemoQueryParam()
      setCrate(null)
      setSequencerResult(null)
      setIsDemo(false)
      setError(null)
      setSourceMode('liked')
      setPlaylistUrl('')
      const token = await getValidAccessToken().catch(() => null)
      setNeedsWriteReauth(token ? !hasPlaylistWriteScope() : false)
      setScreen(token ? 'source_dialog' : 'login')
      return
    }
    clearSpotifySession()
    setCrate(null)
    setSequencerResult(null)
    setIsDemo(false)
    setError(null)
    setScreen('login')
  }

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="headerRow">
          <div className="headerBrandGroup">
            <div>
              <div className="brandTitle">
                <span className="brandAccent">SpotKit</span> / DJMyPlaylist
              </div>
              <div className="brandSubtitle">
                Recursive &amp; iterative song key + BPM playlist auto-sequencer
              </div>
            </div>
            <div
              className="brandBreakLogos"
              aria-label="Rohan Varshney Signature Mark"
            >
              <img
                src={brandLogoUrl}
                alt="RovA Logo"
                className="brandLogoImg"
              />
              <span className="brandBreakDot">•</span>
              <img
                src={freehandSignatureUrl}
                alt="RovA Hand Signature"
                className="brandSignatureImg"
              />
            </div>
          </div>
          <div className="row">
            {!isDemo && (
              <button
                type="button"
                className="button demoBtn small"
                onClick={handleStartDemo}
                title="Try DJMyPlaylist offline on 32 curated mock tracks without affecting Spotify"
              >
                ▶ Interactive Demo
              </button>
            )}
            <a
              href="../"
              className="button secondary small"
              style={{ textDecoration: 'none' }}
            >
              ← SpotKit Hub
            </a>
          </div>
        </div>
      </header>

      <main className="appMain">
        {screen === 'login' && (
          <LoginView
            onLoginClick={handleLoginClick}
            onStartDemo={handleStartDemo}
            error={error}
          />
        )}

        {screen === 'source_dialog' && (
          <SourceDialogView
            isDemo={isDemo}
            initialSourceMode={sourceMode}
            initialPlaylistUrl={playlistUrl}
            initialMaxTracks={maxTracks}
            error={error}
            onContinue={(mode, url, limit, skipAnim) =>
              void handleContinueFromSourceDialog(mode, url, limit, skipAnim)
            }
            onStartDemo={handleStartDemo}
            onSwitchAccount={() => void handleLoginClick(true)}
            onBackToHome={() => void handleExitToLogin()}
          />
        )}

        {screen === 'sequencing' && (
          <SequencingView
            progress={progress}
            maxTracks={maxTracks}
            onCancel={handleCancelSequencing}
          />
        )}

        {screen === 'result' && crate && sequencerResult && (
          <PlaylistResultView
            crate={crate}
            result={sequencerResult}
            maxTracks={maxTracks}
            preferredOpenerId={preferredOpenerId}
            currentPlaylistUrl={playlistUrl}
            needsWriteReauth={needsWriteReauth}
            onRerunSequencer={handleRerunSequencer}
            onReplayNarration={handleReplayNarration}
            onSwitchDemoSource={
              crate.isDemo ? handleSwitchDemoSource : undefined
            }
            onMoveTrack={handleMoveTrack}
            onRemoveTrack={handleRemoveTrack}
            onInsertTrackAtBestSpot={handleInsertTrackAtBestSpot}
            onUpdateTrackMeta={handleUpdateTrackMeta}
            onCreatePlaylist={handleCreatePlaylist}
            onAuthorizeWriteScope={() => void handleAuthorizeWriteScope()}
            onConnectRealSpotify={
              crate.isDemo ? () => void handleLoginClick(false) : undefined
            }
            onChangeSources={() => setScreen('source_dialog')}
            onBackToLogin={() => void handleExitToLogin()}
          />
        )}
      </main>

      <footer className="appFooter">
        © 2026 Rohan Varshney. All Rights Reserved. SpotKit DJMyPlaylist is an
        independent project and is not affiliated with, endorsed by, or
        sponsored by Spotify AB.
      </footer>
    </div>
  )
}

export default App
