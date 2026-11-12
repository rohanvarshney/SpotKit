import { useEffect, useRef, useState } from 'react'
import './App.css'
import { DashboardView } from './components/DashboardView'
import { LoadingView } from './components/LoadingView'
import { LoginView } from './components/LoginView'
import {
  fetchSingleAlbumFull,
  fetchUserLibraryAndMetadata,
} from './lib/spotifyApi'
import {
  clearSpotifySession,
  getValidAccessToken,
  handleOAuthCallbackIfPresent,
  startSpotifyLogin,
} from './lib/spotifyAuth'
import { buildDemoLibraryDataset } from './mocks/demoData'
import type { LoadingProgress, RawLibraryDataset } from './types/spotify'

type AppScreen = 'login' | 'loading' | 'dashboard'

const INITIAL_PROGRESS: LoadingProgress = {
  stage: 'profile',
  stageLabel: 'Connecting to Spotify Profile',
  detail: 'Initializing Spotify Web API session…',
  likedFetched: 0,
  likedTotal: 0,
  albumsHydrated: 0,
  albumsTotal: 0,
  recentItems: [],
  percent: 2,
}

export function App() {
  const [screen, setScreen] = useState<AppScreen>('login')
  const [dataset, setDataset] = useState<RawLibraryDataset | null>(null)
  const [progress, setProgress] = useState<LoadingProgress>(INITIAL_PROGRESS)
  const [error, setError] = useState<string | null>(null)
  const demoTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function initAuth() {
      try {
        const token = await handleOAuthCallbackIfPresent()
        if (!token || cancelled) return

        setError(null)
        setScreen('loading')
        const data = await fetchUserLibraryAndMetadata(token, (p) => {
          if (!cancelled) setProgress(p)
        })
        if (!cancelled) {
          setDataset(data)
          setScreen('dashboard')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
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

  const handleLoginClick = async () => {
    try {
      setError(null)
      await startSpotifyLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleStartDemo = (withLoadingPreview: boolean) => {
    setError(null)
    const demoData = buildDemoLibraryDataset()

    if (!withLoadingPreview) {
      setDataset(demoData)
      setScreen('dashboard')
      return
    }

    setScreen('loading')
    const steps: LoadingProgress[] = [
      {
        stage: 'profile',
        stageLabel: 'Connecting to Spotify Profile',
        detail: 'Authenticated as SpotKit Demo Listener…',
        likedFetched: 0,
        likedTotal: 64,
        albumsHydrated: 0,
        albumsTotal: 8,
        recentItems: ['Connected as SpotKit Demo Listener (Premium)'],
        percent: 12,
      },
      {
        stage: 'liked_songs',
        stageLabel: 'Scanning Your Liked Songs',
        detail: 'Loaded 32 of 64 liked tracks…',
        likedFetched: 32,
        likedTotal: 64,
        albumsHydrated: 0,
        albumsTotal: 8,
        recentItems: [
          'Liked: "The Less I Know The Better" — Tame Impala (Currents)',
          'Liked: "Supercut" — Lorde (Melodrama)',
          'Connected as SpotKit Demo Listener (Premium)',
        ],
        percent: 42,
      },
      {
        stage: 'top_tracks',
        stageLabel: 'Analyzing Heavy Rotation (Top Tracks)',
        detail: 'Matching short_term, medium_term, and long_term Top Tracks…',
        likedFetched: 64,
        likedTotal: 64,
        albumsHydrated: 0,
        albumsTotal: 8,
        recentItems: [
          'Indexed 14 Top Tracks across 4-week, 6-month, and all-time scopes',
          'Liked: "Weird Fishes/ Arpeggi" — Radiohead (In Rainbows)',
          'Liked: "The Less I Know The Better" — Tame Impala (Currents)',
        ],
        percent: 68,
      },
      {
        stage: 'album_hydration',
        stageLabel: 'Hydrating Complete Album Tracklists',
        detail: 'Fetched full tracklists for 8 of 8 candidate albums…',
        likedFetched: 64,
        likedTotal: 64,
        albumsHydrated: 8,
        albumsTotal: 8,
        recentItems: [
          'Hydrated tracklist: Imaginal Disk (15 tracks)',
          'Hydrated tracklist: Blonde (17 tracks)',
          'Hydrated tracklist: Currents (13 tracks)',
        ],
        percent: 90,
      },
      {
        stage: 'scoring',
        stageLabel: 'Computing Album Scores & Rankings',
        detail: 'Merging Deluxe editions & calculating Bayesian scores…',
        likedFetched: 64,
        likedTotal: 64,
        albumsHydrated: 8,
        albumsTotal: 8,
        recentItems: [
          'Merged Currents + Currents (Deluxe B-Sides & Remixes)',
          'Hydrated tracklist: Imaginal Disk (15 tracks)',
        ],
        percent: 100,
      },
    ]

    let idx = 0
    setProgress(steps[0])
    demoTimerRef.current = window.setInterval(() => {
      idx += 1
      if (idx < steps.length) {
        setProgress(steps[idx])
      } else {
        if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
        setDataset(demoData)
        setScreen('dashboard')
      }
    }, 520)
  }

  const handleCancelLoading = () => {
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current)
    setScreen('login')
  }

  const handleLogout = () => {
    clearSpotifySession()
    setDataset(null)
    setScreen('login')
  }

  const handleHydrateAlbumOnDemand = async (albumId: string) => {
    if (!dataset || dataset.isDemo || dataset.hydratedAlbumsMap[albumId]) return
    const token = await getValidAccessToken()
    if (!token) return
    const fullAlbum = await fetchSingleAlbumFull(albumId, token)
    setDataset((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        hydratedAlbumsMap: {
          ...prev.hydratedAlbumsMap,
          [albumId]: fullAlbum,
        },
      }
    })
  }

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="headerRow">
          <div>
            <div className="brandTitle">
              <span className="brandAccent">SpotKit</span> / TopAlbums
            </div>
            <div className="brandSubtitle">
              Rank your favourite albums by proportion of Liked Songs &amp;
              listening metadata
            </div>
          </div>
          <a href="../" className="button secondary small" style={{ textDecoration: 'none' }}>
            ← SpotKit Hub
          </a>
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

        {screen === 'loading' && (
          <LoadingView
            progress={progress}
            onCancel={handleCancelLoading}
          />
        )}

        {screen === 'dashboard' && dataset && (
          <DashboardView
            dataset={dataset}
            onLogout={handleLogout}
            onConnectRealSpotify={handleLoginClick}
            onHydrateAlbum={handleHydrateAlbumOnDemand}
          />
        )}
      </main>
    </div>
  )
}

export default App
