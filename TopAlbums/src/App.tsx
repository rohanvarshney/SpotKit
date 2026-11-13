// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef, useState } from 'react'
import './App.css'
import freehandSignatureUrl from './assets/freehand-signature-3.png'
import brandLogoUrl from './assets/logo.png'
import { DashboardView } from './components/DashboardView'
import { LoadingView } from './components/LoadingView'
import { LoginView } from './components/LoginView'
import {
  discoverAndHydrateParentAlbumsForSingles,
  fetchSingleAlbumFull,
  fetchUserLibraryAndMetadata,
  selectCandidateAlbumIdsToHydrate,
} from './lib/spotifyApi'
import {
  clearCachedLibraryDataset,
  getCachedHydratedAlbums,
  getCachedLibraryDataset,
  setCachedLibraryDataset,
} from './lib/libraryCache'
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
        const url = new URL(window.location.href)
        const hasOAuthParams =
          url.searchParams.has('code') || url.searchParams.has('error')

        // If not returning from an explicit OAuth redirect, check the 24-hour IndexedDB cache first
        if (!hasOAuthParams) {
          const cached = await getCachedLibraryDataset()
          if (cached && !cancelled) {
            setDataset(cached)
            setScreen('dashboard')

            // Background check: if any candidate full albums (e.g. albums whose singles were liked) aren't hydrated yet, hydrate them seamlessly
            const candidateIds = selectCandidateAlbumIdsToHydrate(
              cached.savedTracks,
              200,
            )
            const missingIds = candidateIds.filter(
              (id) => !cached.hydratedAlbumsMap[id],
            )
            const fromAlbumCache =
              missingIds.length > 0
                ? await getCachedHydratedAlbums(missingIds)
                : {}
            const stillMissing = missingIds.filter(
              (id) => !fromAlbumCache[id],
            )
            const activeToken = await getValidAccessToken()

            const newlyHydrated = { ...fromAlbumCache }
            if (activeToken && stillMissing.length > 0) {
              for (let i = 0; i < stillMissing.length; i += 6) {
                if (cancelled) break
                const batch = stillMissing.slice(i, i + 6)
                const settled = await Promise.allSettled(
                  batch.map((id) => fetchSingleAlbumFull(id, activeToken)),
                )
                for (const res of settled) {
                  if (res.status === 'fulfilled' && res.value?.id) {
                    newlyHydrated[res.value.id] = res.value
                  }
                }
              }
            }

            if (activeToken && !cancelled) {
              const mergedSoFar = {
                ...cached.hydratedAlbumsMap,
                ...newlyHydrated,
              }
              const discoveredParents =
                await discoverAndHydrateParentAlbumsForSingles(
                  cached.savedTracks,
                  mergedSoFar,
                  activeToken,
                )
              Object.assign(newlyHydrated, discoveredParents)
            }

            if (!cancelled && Object.keys(newlyHydrated).length > 0) {
              const updatedDataset: RawLibraryDataset = {
                ...cached,
                hydratedAlbumsMap: {
                  ...cached.hydratedAlbumsMap,
                  ...newlyHydrated,
                },
              }
              setDataset(updatedDataset)
              void setCachedLibraryDataset(updatedDataset)
            }
            return
          }
        }

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
    void clearCachedLibraryDataset()
    setDataset(null)
    setScreen('login')
  }

  const handleRefreshLibrary = async () => {
    try {
      setError(null)
      await clearCachedLibraryDataset()
      const token = await getValidAccessToken()
      if (!token) {
        await startSpotifyLogin()
        return
      }
      setProgress(INITIAL_PROGRESS)
      setScreen('loading')
      const data = await fetchUserLibraryAndMetadata(token, (p) => {
        setProgress(p)
      })
      setDataset(data)
      setScreen('dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScreen('login')
    }
  }

  const handleHydrateAlbumOnDemand = async (albumId: string) => {
    if (!dataset || dataset.isDemo || dataset.hydratedAlbumsMap[albumId]) return
    const token = await getValidAccessToken()
    if (!token) return
    const fullAlbum = await fetchSingleAlbumFull(albumId, token)
    setDataset((prev) => {
      if (!prev) return prev
      const next: RawLibraryDataset = {
        ...prev,
        hydratedAlbumsMap: {
          ...prev.hydratedAlbumsMap,
          [albumId]: fullAlbum,
        },
      }
      void setCachedLibraryDataset(next)
      return next
    })
  }

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="headerRow">
          <div className="headerBrandGroup">
            <div>
              <div className="brandTitle">
                <span className="brandAccent">SpotKit</span> / TopAlbums
              </div>
              <div className="brandSubtitle">
                Rank your favourite albums by proportion of Liked Songs &amp;
                listening metadata
              </div>
            </div>
            <div className="brandBreakLogos" aria-label="Rohan Varshney Signature Mark">
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
            onRefreshLibrary={handleRefreshLibrary}
            onHydrateAlbum={handleHydrateAlbumOnDemand}
          />
        )}
      </main>
    </div>
  )
}

export default App
