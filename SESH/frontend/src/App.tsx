// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef, useState } from 'react'
import freehandSignatureUrl from './assets/freehand-signature-3.png'
import brandLogoUrl from './assets/logo.png'
import type {
  ProcessorProgress,
  SummaryResult,
  WorkerResponse,
} from './lib/spotify/types'
import { Dashboard } from './features/dashboard/Dashboard'
import { ProcessingScreen } from './features/loading/ProcessingScreen'
import { UploadDropzone } from './features/upload/UploadDropzone'
import { mockSummary } from './mocks/mockSummary'
import './App.css'

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

function App() {
  const [initialDemo] = useState(() => hasDemoQueryParam())
  const [mode, setMode] = useState<'idle' | 'processing' | 'results' | 'error'>(
    initialDemo ? 'results' : 'idle',
  )
  const [progress, setProgress] = useState<ProcessorProgress | null>(null)
  const [summary, setSummary] = useState<SummaryResult | null>(
    initialDemo ? mockSummary : null,
  )
  const [isDemo, setIsDemo] = useState(initialDemo)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const savedUserSummaryRef = useRef<SummaryResult | null>(null)
  const topN = 25

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const onFile = async (file: File) => {
    setError(null)
    setSummary(null)
    setIsDemo(false)
    setProgress({ stage: 'unzip', message: 'Opening ZIP archive…' })
    setMode('processing')

    if (workerRef.current) workerRef.current.terminate()
    const w = new Worker(
      new URL('./workers/spotifyProcessor.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    )
    workerRef.current = w

    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') setProgress(msg.progress)
      if (msg.type === 'result') {
        savedUserSummaryRef.current = msg.summary
        setSummary(msg.summary)
        setMode('results')
      }
      if (msg.type === 'error') {
        setError(msg.error)
        setMode('error')
      }
    }

    w.onerror = (evt) => {
      setError(evt.message || 'Worker crashed')
      setMode('error')
    }

    w.postMessage({ type: 'processZip', zipFile: file, topN })
  }

  const handleStartDemo = () => {
    workerRef.current?.terminate()
    workerRef.current = null
    setError(null)
    setProgress(null)
    setIsDemo(true)
    setSummary(mockSummary)
    setMode('results')
  }

  const handleExitDemoOrReset = () => {
    setError(null)
    setProgress(null)
    if (isDemo) {
      clearDemoQueryParam()
      setIsDemo(false)
      if (savedUserSummaryRef.current) {
        setSummary(savedUserSummaryRef.current)
        setMode('results')
        return
      }
      setSummary(null)
      setMode('idle')
      return
    }
    savedUserSummaryRef.current = null
    setSummary(null)
    setMode('idle')
  }

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="headerRow">
          <div className="headerBrandGroup">
            <div>
              <div className="brandTitle">
                <span className="brandAccent">SpotKit</span> / SESH
              </div>
              <div className="brandSubtitle">
                Spotify Extended Streaming History archive visualizer
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
          <div className="row">
            {!isDemo && (
              <button
                type="button"
                className="button demoBtn small"
                onClick={handleStartDemo}
                title="Preview SESH with a sample Spotify streaming archive"
              >
                ▶ Interactive Demo
              </button>
            )}
            <a href="../" className="button secondary small">
              ← SpotKit Hub
            </a>
          </div>
        </div>
      </header>

      <main className="appMain">
        {mode === 'idle' && (
          <UploadDropzone
            title={
              <>
                Explore your complete <span>Spotify listening history.</span>
              </>
            }
            subtitle={
              <>
                <strong>SESH</strong> unpacks and analyzes your{' '}
                <code>my_spotify_data.zip</code> Extended Streaming History
                export 100% locally in your browser—ranking your top songs,
                albums, and artists across rolling time windows and every
                calendar year.
              </>
            }
            onFile={(f) => onFile(f)}
            onLoadDemo={handleStartDemo}
          />
        )}

        {mode === 'processing' && (
          <ProcessingScreen
            progress={progress}
            onCancel={() => {
              workerRef.current?.terminate()
              workerRef.current = null
              setMode('idle')
              setProgress(null)
            }}
          />
        )}

        {mode === 'error' && (
          <div className="heroContainer">
            <section className="card">
              <div className="heroBadge">ARCHIVE ERROR</div>
              <h2 className="loadingTitle" style={{ marginTop: 10 }}>
                Could not process ZIP archive
              </h2>
              <pre className="errorBox">{error ?? 'Unknown error'}</pre>
              <div className="row" style={{ marginTop: 18 }}>
                <button
                  className="button spotifyBtn"
                  onClick={() => {
                    setError(null)
                    setMode('idle')
                  }}
                >
                  Try Another ZIP
                </button>
              </div>
            </section>
          </div>
        )}

        {mode === 'results' && summary && (
          <Dashboard
            summary={summary}
            topN={topN}
            isDemo={isDemo}
            onStartDemo={handleStartDemo}
            onReset={handleExitDemoOrReset}
          />
        )}
      </main>

      <footer className="siteFooter">
        © 2026 Rohan Varshney. All Rights Reserved. SESH is an independent
        project in the SpotKit suite and is not affiliated with, endorsed by, or
        sponsored by Spotify AB.
      </footer>
    </div>
  )
}

export default App
