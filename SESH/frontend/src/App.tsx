// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef, useState } from 'react'
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

function App() {
  const [mode, setMode] = useState<'idle' | 'processing' | 'results' | 'error'>(
    'idle',
  )
  const [progress, setProgress] = useState<ProcessorProgress | null>(null)
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
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

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="headerRow">
          <div>
            <div className="brandTitle">
              <span className="brandAccent">SpotKit</span> / SESH
            </div>
            <div className="brandSubtitle">
              Spotify Extended Streaming History archive visualizer
            </div>
          </div>
          <a href="../" className="button secondary small">
            ← SpotKit Hub
          </a>
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
            onLoadDemo={() => {
              setError(null)
              setIsDemo(true)
              setSummary(mockSummary)
              setMode('results')
            }}
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
            onReset={() => {
              setSummary(null)
              setIsDemo(false)
              setMode('idle')
            }}
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
