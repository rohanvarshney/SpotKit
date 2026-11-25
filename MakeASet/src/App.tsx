// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef, useState } from 'react'
import './App.css'
import freehandSignatureUrl from './assets/freehand-signature-3.png'
import brandLogoUrl from './assets/logo.png'
import { AnalysisView } from './components/AnalysisView'
import { FinalTracklistView } from './components/FinalTracklistView'
import { LoginView } from './components/LoginView'
import { SetBuilderView } from './components/SetBuilderView'
import { SourceDialogView } from './components/SourceDialogView'
import {
  camelotToPitchAndMode,
  rankRemainingTracksByCohesion,
} from './lib/camelotEngine'
import {
  InsufficientScopeError,
  createSpotifyPlaylistFromSet,
  fetchAndAnalyzeCrate,
} from './lib/spotifyApi'
import {
  clearSpotifySession,
  consumePendingSetState,
  getValidAccessToken,
  handleOAuthCallbackIfPresent,
  hasPlaylistWriteScope,
  savePendingSetState,
  startSpotifyLogin,
} from './lib/spotifyAuth'
import { buildDemoCrate } from './mocks/demoData'
import type {
  AnalysisProgress,
  AnalyzedCrate,
  AnalyzedTrack,
  CamelotCode,
  CreatedPlaylistResult,
  SourceMode,
} from './types/spotify'

type AppScreen =
  | 'login'
  | 'source_dialog'
  | 'analyzing'
  | 'builder'
  | 'summary'

const INITIAL_PROGRESS: AnalysisProgress = {
  stage: 'sources',
  stageLabel: 'Loading Your Selected Crate',
  detail: 'Preparing track-by-track analysis…',
  tracksFetched: 0,
  tracksTotal: 0,
  tracksAnalyzed: 0,
  spotifyMatchedCount: 0,
  reccoMatchedCount: 0,
  estimatedCount: 0,
  recentLogs: [],
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
  const [crate, setCrate] = useState<AnalyzedCrate | null>(null)
  const [setTracks, setSetTracks] = useState<AnalyzedTrack[]>([])
  const [progress, setProgress] = useState<AnalysisProgress>(INITIAL_PROGRESS)
  const [error, setError] = useState<string | null>(null)
  const [needsWriteReauth, setNeedsWriteReauth] = useState<boolean>(false)

  const demoTimerRef = useRef<number | null>(null)
  const analysisRunRef = useRef<number>(0)

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

        const pending = consumePendingSetState()
        if (token && pending) {
          const trackById = new Map(
            pending.crate.tracks.map((t) => [t.id, t]),
          )
          const restoredSet = pending.setTrackIds
            .map((id) => trackById.get(id))
            .filter((t): t is AnalyzedTrack => Boolean(t))
          setCrate(pending.crate)
          setSetTracks(restoredSet)
          setIsDemo(pending.crate.isDemo)
          setSourceMode(pending.crate.sourceMode)
          setNeedsWriteReauth(!hasPlaylistWriteScope())
          setScreen(
            pending.returnToSummary && restoredSet.length > 0
              ? 'summary'
              : 'builder',
          )
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
      if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
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
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
    setError(null)
    setIsDemo(true)
    setSourceMode('liked')
    setPlaylistUrl('')
    setCrate(null)
    setSetTracks([])
    setNeedsWriteReauth(false)
    setScreen('source_dialog')
  }

  const runDemoAnalysis = (
    chosenMode: SourceMode,
    chosenUrl: string,
    skipAnimation = false,
  ) => {
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
    const demoCrate = buildDemoCrate(chosenMode, chosenUrl)

    if (skipAnimation) {
      setCrate(demoCrate)
      setSetTracks([])
      setScreen('builder')
      return
    }

    const total = demoCrate.tracks.length
    const t0 = demoCrate.tracks[0]
    const t1 = demoCrate.tracks[Math.min(1, total - 1)]
    const t2 = demoCrate.tracks[Math.min(2, total - 1)]
    const tLast = demoCrate.tracks[total - 1]

    const steps: AnalysisProgress[] = [
      {
        stage: 'sources',
        stageLabel: 'Importing Demo Crate',
        detail:
          chosenMode === 'liked'
            ? `Loaded ${total} Liked Songs from SpotKit Demo DJ…`
            : chosenMode === 'playlist'
              ? `Loaded ${total} tracks from "${demoCrate.playlistMeta?.name ?? 'Public Playlist'}"…`
              : `Merged ${total} unique tracks across Liked Songs & "${demoCrate.playlistMeta?.name ?? 'Playlist'}"…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: 0,
        spotifyMatchedCount: 0,
        reccoMatchedCount: 0,
        estimatedCount: 0,
        recentLogs: [
          demoCrate.playlistMeta
            ? `Playlist connected: ${demoCrate.playlistMeta.name} (${demoCrate.playlistCount} tracks)`
            : 'Loaded Liked Songs crate',
        ],
        percent: 18,
      },
      {
        stage: 'audio_features',
        stageLabel: 'Track-by-Track Spotify Audio Scan',
        detail: `Inspecting tempo, key signature & energy across ${total} tracks…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: Math.round(total * 0.35),
        spotifyMatchedCount: 0,
        reccoMatchedCount: 0,
        estimatedCount: 0,
        recentLogs: [
          `Analyzed: "${t1.name}" → ${t1.camelot} (${t1.musicalKey}) • ${t1.bpm} BPM`,
          `Analyzed: "${t0.name}" → ${t0.camelot} (${t0.musicalKey}) • ${t0.bpm} BPM`,
        ],
        percent: 44,
      },
      {
        stage: 'fallback_lookup',
        stageLabel: 'Harmonic & Tempo Verification',
        detail: `Cross-referencing BPM & key metadata for ${total} mock tracks…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: Math.round(total * 0.72),
        spotifyMatchedCount: 0,
        reccoMatchedCount: 0,
        estimatedCount: 0,
        recentLogs: [
          `Analyzed: "${t2.name}" → ${t2.camelot} (${t2.musicalKey}) • ${t2.bpm} BPM`,
          `Analyzed: "${t1.name}" → ${t1.camelot} (${t1.musicalKey}) • ${t1.bpm} BPM`,
        ],
        percent: 70,
      },
      {
        stage: 'camelot_mapping',
        stageLabel: 'Mapping Song Keys Across Crate',
        detail: `Resolving harmonic neighbors & cohesion vectors for ${total} tracks…`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: total,
        spotifyMatchedCount: 0,
        reccoMatchedCount: 0,
        estimatedCount: 0,
        recentLogs: [
          `Analyzed: "${tLast.name}" → ${tLast.camelot} (${tLast.musicalKey}) • ${tLast.bpm} BPM`,
          `Analyzed: "${t2.name}" → ${t2.camelot} (${t2.musicalKey}) • ${t2.bpm} BPM`,
        ],
        percent: 90,
      },
      {
        stage: 'ready',
        stageLabel: 'Track-by-Track Analysis Complete',
        detail: `Ready! Pick your opening track to begin building your set.`,
        tracksFetched: total,
        tracksTotal: total,
        tracksAnalyzed: total,
        spotifyMatchedCount: 0,
        reccoMatchedCount: 0,
        estimatedCount: 0,
        recentLogs: [
          `Crate ready: ${total} tracks mapped by song key`,
          `Analyzed: "${tLast.name}" → ${tLast.camelot} (${tLast.musicalKey}) • ${tLast.bpm} BPM`,
        ],
        percent: 100,
      },
    ]

    setProgress(steps[0])
    setScreen('analyzing')

    let stepIdx = 0
    demoTimerRef.current = window.setInterval(() => {
      stepIdx += 1
      if (stepIdx < steps.length) {
        setProgress(steps[stepIdx])
      } else {
        if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
        setCrate(demoCrate)
        setSetTracks([])
        setScreen('builder')
      }
    }, 360)
  }

  const handleContinueFromSourceDialog = async (
    chosenMode: SourceMode,
    chosenUrl: string,
    skipAnimation = false,
  ) => {
    setError(null)
    setSourceMode(chosenMode)
    setPlaylistUrl(chosenUrl)

    if (isDemo) {
      runDemoAnalysis(chosenMode, chosenUrl, skipAnimation)
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
    const runId = analysisRunRef.current + 1
    analysisRunRef.current = runId

    setProgress(INITIAL_PROGRESS)
    setScreen('analyzing')

    try {
      const analyzedCrate = await fetchAndAnalyzeCrate({
        accessToken: token,
        sourceMode: chosenMode,
        playlistUrl: chosenUrl,
        onProgress: (p) => {
          if (analysisRunRef.current === runId) {
            setProgress(p)
          }
        },
      })

      if (analysisRunRef.current !== runId) return
      setCrate(analyzedCrate)
      setSetTracks([])
      setScreen('builder')
    } catch (err) {
      if (analysisRunRef.current !== runId) return
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

  const handleCancelAnalysis = () => {
    analysisRunRef.current += 1
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
    setScreen('source_dialog')
  }

  const handleSelectTrack = (track: AnalyzedTrack) => {
    setSetTracks((prev) => {
      if (prev.some((t) => t.id === track.id)) return prev
      return [...prev, track]
    })
  }

  const handleAutoPickDemoSet = () => {
    if (!crate || crate.tracks.length === 0) return
    const opener =
      crate.tracks.find((t) => t.id === 'demo_t01') ?? crate.tracks[0]
    const chosen: AnalyzedTrack[] = [opener]
    const chosenIds = new Set<string>([opener.id])

    while (chosen.length < Math.min(4, crate.tracks.length)) {
      const anchor = chosen[chosen.length - 1]
      const remaining = crate.tracks.filter((t) => !chosenIds.has(t.id))
      const ranked = rankRemainingTracksByCohesion(anchor, remaining)
      if (ranked.length === 0) break
      const next = ranked[0].track
      chosen.push(next)
      chosenIds.add(next.id)
    }

    setSetTracks(chosen)
  }

  const handleReplayDemoAnalysis = () => {
    if (!crate?.isDemo) return
    setSetTracks([])
    runDemoAnalysis(sourceMode, playlistUrl, false)
  }

  const handleRevertLast = () => {
    setSetTracks((prev) => prev.slice(0, -1))
  }

  const handleRevertToIndex = (index: number) => {
    setSetTracks((prev) => prev.slice(0, index + 1))
  }

  const handleResetSet = () => {
    setSetTracks([])
  }

  const handleUpdateTrackMeta = (
    trackId: string,
    updates: { bpm: number; camelot: CamelotCode },
  ) => {
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

    setCrate((prev) =>
      prev
        ? {
            ...prev,
            tracks: prev.tracks.map(patchTrack),
          }
        : prev,
    )
    setSetTracks((prev) => prev.map(patchTrack))
  }

  const handleAuthorizeWriteScope = async () => {
    if (!crate) return
    savePendingSetState({
      crate,
      setTrackIds: setTracks.map((t) => t.id),
      returnToSummary: screen === 'summary',
    })
    await startSpotifyLogin({ forceDialog: true })
  }

  const handleCreatePlaylist = async (options: {
    name: string
    description: string
    isPublic: boolean
  }): Promise<CreatedPlaylistResult> => {
    if (isDemo || crate?.isDemo) {
      return {
        id: `demo_${Date.now().toString(36)}`,
        name: options.name.trim() || 'MakeASet Demo Mix',
        externalUrl: 'https://open.spotify.com/',
        trackCount: setTracks.length,
        isPublic: options.isPublic,
        isDemo: true,
      }
    }

    const token = await getValidAccessToken()
    if (!token) {
      throw new Error(
        'Spotify access token expired. Authorize Spotify again to create your playlist.',
      )
    }

    try {
      return await createSpotifyPlaylistFromSet({
        accessToken: token,
        name: options.name,
        description: options.description,
        isPublic: options.isPublic,
        tracks: setTracks,
      })
    } catch (err) {
      if (err instanceof InsufficientScopeError) {
        setNeedsWriteReauth(true)
        throw new Error(
          'Your current Spotify session is missing playlist creation permissions. Click "Authorize Spotify Playlist Creation →" above to grant permission without losing your set.',
        )
      }
      throw err
    }
  }

  const handleExitToLogin = async () => {
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
    if (isDemo || crate?.isDemo) {
      // Leaving the demo should never sign a connected user out.
      clearDemoQueryParam()
      setCrate(null)
      setSetTracks([])
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
    setSetTracks([])
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
                <span className="brandAccent">SpotKit</span> / MakeASet
              </div>
              <div className="brandSubtitle">
                Track-by-track harmonic &amp; BPM cohesion set builder
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
                title="Explore MakeASet offline with a mock crate — your Spotify session is not touched"
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
            error={error}
            onContinue={(mode, url, skipAnim) =>
              void handleContinueFromSourceDialog(mode, url, skipAnim)
            }
            onSwitchAccount={() => void handleLoginClick(true)}
            onBackToHome={() => void handleExitToLogin()}
            onStartDemo={handleStartDemo}
          />
        )}

        {screen === 'analyzing' && (
          <AnalysisView progress={progress} onCancel={handleCancelAnalysis} />
        )}

        {screen === 'builder' && crate && (
          <SetBuilderView
            crate={crate}
            setTracks={setTracks}
            onSelectTrack={handleSelectTrack}
            onRevertLast={handleRevertLast}
            onRevertToIndex={handleRevertToIndex}
            onResetSet={handleResetSet}
            onEndSet={() => setScreen('summary')}
            onChangeSources={() => setScreen('source_dialog')}
            onAutoPickDemoSet={
              crate.isDemo ? handleAutoPickDemoSet : undefined
            }
            onReplayAnalysis={
              crate.isDemo ? handleReplayDemoAnalysis : undefined
            }
            onConnectRealSpotify={
              crate.isDemo ? () => void handleLoginClick(false) : undefined
            }
            onBackToLogin={() => void handleExitToLogin()}
            onUpdateTrackMeta={handleUpdateTrackMeta}
          />
        )}

        {screen === 'summary' && crate && (
          <FinalTracklistView
            crate={crate}
            setTracks={setTracks}
            onReEditFromLast={() => setScreen('builder')}
            onCreatePlaylist={handleCreatePlaylist}
            onAuthorizeWriteScope={() => void handleAuthorizeWriteScope()}
            onConnectRealSpotify={
              crate.isDemo ? () => void handleLoginClick(false) : undefined
            }
            needsWriteReauth={needsWriteReauth}
          />
        )}
      </main>

      <footer className="appFooter">
        © 2026 Rohan Varshney. All Rights Reserved. SpotKit MakeASet is an
        independent project and is not affiliated with, endorsed by, or
        sponsored by Spotify AB.
      </footer>
    </div>
  )
}

export default App
