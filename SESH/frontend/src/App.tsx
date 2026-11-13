// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef, useState } from 'react'
import type { ProcessorProgress, SummaryResult, WorkerResponse } from './lib/spotify/types'
import { Dashboard } from './features/dashboard/Dashboard'
import { ProcessingScreen } from './features/loading/ProcessingScreen'
import { UploadDropzone } from './features/upload/UploadDropzone'
import { mockSummary } from './mocks/mockSummary'
import './App.css'

function App() {
  const [mode, setMode] = useState<'idle' | 'processing' | 'results' | 'error'>('idle')
  const [progress, setProgress] = useState<ProcessorProgress | null>(null)
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mockMode, setMockMode] = useState(false)

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
    setProgress({ stage: 'unzip', message: 'Starting…' })
    setMode('processing')

    if (workerRef.current) workerRef.current.terminate()
    const w = new Worker(new URL('./workers/spotifyProcessor.worker.ts', import.meta.url), {
      type: 'module',
    })
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
      <header className="appHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="brand" style={{ textAlign: 'left' }}>
          <div className="brandTitle">SESH</div>
          <div className="brandSubtitle">Spotify Extended Streaming History</div>
        </div>
        <a href="../" className="button secondary" style={{ textDecoration: 'none', fontSize: 13 }}>
          ← SpotKit Hub
        </a>
      </header>

      <main className="appMain">
        {mode === 'idle' && (
          <UploadDropzone
            title="Upload your Spotify data ZIP"
            subtitle={
              <>
                Processing happens locally in your browser. Drop <code>my_spotify_data.zip</code> to generate your stats.
              </>
            }
            onFile={(f) => onFile(f)}
            extra={
              <div className="row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={mockMode}
                    onChange={(e) => setMockMode(e.target.checked)}
                  />
                  <span>Use mock data (for UI iteration)</span>
                </label>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSummary(mockSummary)
                    setMode('results')
                  }}
                  disabled={!mockMode}
                >
                  Load mock dashboard
                </button>
              </div>
            }
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
          <section className="card">
            <h1>Something went wrong</h1>
            <pre className="errorBox">{error ?? 'Unknown error'}</pre>
            <div className="row">
              <button
                className="button"
                onClick={() => {
                  setError(null)
                  setMode('idle')
                }}
              >
                Try again
              </button>
            </div>
          </section>
        )}

        {mode === 'results' && summary && (
          <Dashboard
            summary={summary}
            topN={topN}
            onReset={() => {
              setSummary(null)
              setMode('idle')
            }}
          />
        )}
      </main>
    </div>
  )
}

export default App
