// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type { ProcessorProgress } from '../../lib/spotify/types'

type Props = {
  progress: ProcessorProgress | null
  onCancel: () => void
}

const STAGES = [
  { id: 'unzip', label: 'Unpack ZIP Archive', icon: '📦' },
  { id: 'parse', label: 'Parse Audio Streams', icon: '🎵' },
  { id: 'aggregate', label: 'Aggregate Top Rankings', icon: '🏆' },
] as const

export function ProcessingScreen({ progress, onCancel }: Props) {
  const processedFiles =
    progress !== null &&
    progress.stage !== 'done' &&
    typeof progress.processedFiles === 'number'
      ? progress.processedFiles
      : null
  const totalFiles =
    progress !== null &&
    progress.stage !== 'done' &&
    typeof progress.totalFiles === 'number'
      ? progress.totalFiles
      : null
  const hasFileProgress = processedFiles !== null && totalFiles !== null
  const percent = hasFileProgress
    ? Math.max(8, Math.round((processedFiles / Math.max(1, totalFiles)) * 100))
    : progress?.stage === 'aggregate'
      ? 90
      : 18

  const activeIdx = STAGES.findIndex((s) => s.id === progress?.stage)

  return (
    <div className="loadingContainer">
      <section className="card">
        <div className="loadingHeader">
          <div className="vinylSpinner" aria-hidden="true">
            <div className="vinylGroove" />
            <div className="vinylCenter" />
          </div>
          <div>
            <div className="heroBadge">ANALYZING EXTENDED STREAMING HISTORY</div>
            <h2 className="loadingTitle">Processing Archive in Browser…</h2>
            <p className="muted">
              {progress?.message ?? 'Reading streaming history files…'}
            </p>
          </div>
        </div>

        <div className="progressRow">
          <div className="progressBar">
            <div className="progressFill" style={{ width: `${percent}%` }} />
          </div>
          <div className="progressStatsRow">
            <span>{percent}% complete</span>
            <span>
              {hasFileProgress
                ? `${processedFiles} / ${totalFiles} history files parsed`
                : 'Working in background thread…'}
            </span>
          </div>
        </div>

        <div className="stageSteps">
          {STAGES.map((st, idx) => {
            const state =
              activeIdx > idx
                ? 'done'
                : activeIdx === idx
                  ? 'active'
                  : 'pending'
            return (
              <div key={st.id} className={`stageStep ${state}`}>
                <span>{state === 'done' ? '✓' : st.icon}</span>
                <span>{st.label}</span>
              </div>
            )
          })}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="button secondary small" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}
