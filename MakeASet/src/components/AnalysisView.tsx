// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type { AnalysisProgress, AnalysisStageId } from '../types/spotify'

interface AnalysisViewProps {
  progress: AnalysisProgress
  onCancel: () => void
}

const STAGES: { id: AnalysisStageId; label: string; icon: string }[] = [
  { id: 'sources', label: 'Import Crate', icon: '📥' },
  { id: 'audio_features', label: 'Spotify Audio', icon: '🎛️' },
  { id: 'fallback_lookup', label: 'BPM & Key Lookup', icon: '🔎' },
  { id: 'camelot_mapping', label: 'Song Keys', icon: '🎡' },
  { id: 'ready', label: 'Crate Ready', icon: '✨' },
]

export function AnalysisView({ progress, onCancel }: AnalysisViewProps) {
  const activeIdx = STAGES.findIndex((s) => s.id === progress.stage)

  return (
    <div className="loadingContainer">
      <div className="card loadingCard">
        <div className="loadingHeader">
          <div className="vinylSpinner" aria-hidden="true">
            <div className="vinylGroove" />
            <div className="vinylCenter" />
          </div>
          <div>
            <div className="heroBadge">TRACK-BY-TRACK ANALYSIS</div>
            <h2 className="loadingTitle">{progress.stageLabel}</h2>
            <p className="muted">{progress.detail}</p>
          </div>
        </div>

        <div className="progressRow" style={{ marginTop: 22 }}>
          <div className="progressBar large">
            <div
              className="progressFill animated"
              style={{ width: `${Math.max(4, progress.percent)}%` }}
            />
          </div>
          <div className="progressStatsRow">
            <span>{progress.percent}% complete</span>
            <span>
              {progress.tracksTotal > 0
                ? `${progress.tracksFetched.toLocaleString()} / ${progress.tracksTotal.toLocaleString()} tracks`
                : 'Connecting…'}
            </span>
          </div>
        </div>

        <div className="stageSteps">
          {STAGES.map((stage, idx) => {
            const state =
              idx < activeIdx
                ? 'done'
                : idx === activeIdx
                  ? 'active'
                  : 'pending'
            return (
              <div key={stage.id} className={`stageStep ${state}`}>
                <span className="stageIcon">
                  {state === 'done' ? '✓' : stage.icon}
                </span>
                <span className="stageName">{stage.label}</span>
              </div>
            )
          })}
        </div>

        <div className="loadingCounters">
          <div className="counterBox">
            <div className="counterValue">
              {progress.tracksFetched.toLocaleString()}
            </div>
            <div className="counterLabel">Tracks Loaded in Crate</div>
          </div>
          <div className="counterBox">
            <div className="counterValue">
              {progress.tracksAnalyzed.toLocaleString()}
              {progress.tracksTotal > 0
                ? ` / ${progress.tracksTotal.toLocaleString()}`
                : ''}
            </div>
            <div className="counterLabel">
              Harmonic &amp; BPM Profiles Resolved
            </div>
          </div>
        </div>

        {progress.recentLogs.length > 0 && (
          <div className="liveTicker">
            <div className="tickerTitle">LIVE TRACK-BY-TRACK LOG</div>
            <ul className="tickerList">
              {progress.recentLogs.map((item, i) => (
                <li key={`${i}-${item}`} className={i === 0 ? 'latest' : ''}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            className="button secondary small"
            onClick={onCancel}
          >
            Cancel &amp; Change Source
          </button>
        </div>
      </div>
    </div>
  )
}
