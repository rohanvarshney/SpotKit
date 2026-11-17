// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useEffect, useRef } from 'react'
import type { SequenceStageId, SequencingProgress } from '../types/spotify'

interface SequencingViewProps {
  progress: SequencingProgress
  maxTracks: number | null
  onCancel: () => void
}

const STAGES: { id: SequenceStageId; label: string; icon: string }[] = [
  { id: 'sources', label: 'Import Crate', icon: '📥' },
  { id: 'audio_features', label: 'Audio & BPM Scan', icon: '🎛️' },
  { id: 'camelot_mapping', label: 'Camelot Mapping', icon: '🎡' },
  { id: 'recursive_search', label: 'Recursive Search', icon: '🧠' },
  { id: 'iterative_refine', label: 'Iterative Refine', icon: '🔁' },
]

export function SequencingView({
  progress,
  maxTracks,
  onCancel,
}: SequencingViewProps) {
  const activeIdx =
    progress.stage === 'ready'
      ? STAGES.length
      : STAGES.findIndex((s) => s.id === progress.stage)

  const terminalRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [progress.narrationLogs.length])

  return (
    <div className="loadingContainer">
      <div className="card loadingCard">
        <div className="loadingHeader">
          <div className="vinylSpinner" aria-hidden="true">
            <div className="vinylGroove" />
            <div className="vinylCenter" />
          </div>
          <div>
            <div className="heroBadge">
              CAMELOT SCAN &amp; RECURSIVE SEQUENCER
            </div>
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
                ? `${progress.tracksFetched.toLocaleString()} / ${progress.tracksTotal.toLocaleString()} tracks loaded`
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

        <div className="loadingCounters fourCols">
          <div className="counterBox">
            <div className="counterValue">
              {progress.tracksAnalyzed.toLocaleString()}
              {progress.tracksTotal > 0
                ? ` / ${progress.tracksTotal.toLocaleString()}`
                : ''}
            </div>
            <div className="counterLabel">Tracks Mapped</div>
          </div>

          <div className="counterBox">
            <div className="counterValue">
              {progress.branchesExplored.toLocaleString()}
            </div>
            <div className="counterLabel">Branches Explored</div>
          </div>

          <div className="counterBox">
            <div className="counterValue">
              {maxTracks && maxTracks > 0
                ? `Up to ${maxTracks}`
                : progress.tracksTotal > 0
                  ? `All ${progress.tracksTotal}`
                  : 'All'}
            </div>
            <div className="counterLabel">Subset Target</div>
          </div>

          <div className="counterBox">
            <div className="counterValue">
              {progress.currentCohesion > 0
                ? `${progress.currentCohesion}%`
                : '—'}
            </div>
            <div className="counterLabel">Live Set Cohesion</div>
          </div>
        </div>

        <div className="narrationTerminal">
          <div className="narrationTerminalHeader">
            <span>LIVE NARRATED THOUGHT PROCESS</span>
            <span className="mutedSmall">
              {progress.narrationLogs.length} steps logged
            </span>
          </div>
          <div className="narrationScroll" ref={terminalRef}>
            {progress.narrationLogs.length === 0 ? (
              <div className="narrationEmpty">
                Waiting for audio &amp; Camelot features to resolve…
              </div>
            ) : (
              progress.narrationLogs.map((entry, idx) => {
                const isLatest = idx === progress.narrationLogs.length - 1
                return (
                  <div
                    key={entry.id}
                    className={`narrationLine ${isLatest ? 'latest' : ''}`}
                  >
                    <span className="narrationStepNum">
                      #{entry.step.toString().padStart(2, '0')}
                    </span>
                    <span className={`phaseBadge phase-${entry.phase}`}>
                      [{entry.badge}]
                    </span>
                    <div className="narrationTextCol">
                      <div className="narrationMsg">{entry.message}</div>
                      {entry.detail && (
                        <div className="narrationDetail">{entry.detail}</div>
                      )}
                    </div>
                    {entry.scoreImpact && (
                      <span className="narrationImpact">{entry.scoreImpact}</span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div
          className="row"
          style={{ justifyContent: 'flex-end', marginTop: 18 }}
        >
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
