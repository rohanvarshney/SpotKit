// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useMemo, useState } from 'react'
import type {
  SummaryResult,
  TimeWindowKey,
  TopEntity,
} from '../../lib/spotify/types'
import { TopEntitiesChart } from './TopEntitiesChart'
import { TopEntitiesTable } from './TopEntitiesTable'

type EntityKind = 'songs' | 'albums' | 'artists'
type Scope =
  | { kind: 'window'; key: TimeWindowKey }
  | { kind: 'year'; year: string }

type Props = {
  summary: SummaryResult
  topN: number
  isDemo?: boolean
  onReset: () => void
}

function fmtHoursAndMinutes(ms: number): string {
  const totalMinutes = Math.round(ms / 1000 / 60)
  const hours = Math.floor(totalMinutes / 60)
  if (hours >= 1) {
    return `${hours.toLocaleString()} hrs (${totalMinutes.toLocaleString()} min)`
  }
  return `${totalMinutes.toLocaleString()} min`
}

function windowLabel(key: TimeWindowKey): string {
  switch (key) {
    case 'last_1_month':
      return 'Last 1 Month'
    case 'last_1_year':
      return 'Last 1 Year'
    case 'last_5_years':
      return 'Last 5 Years'
    case 'all_time':
      return 'All-Time'
  }
}

function getItems(
  summary: SummaryResult,
  scope: Scope,
  kind: EntityKind,
): TopEntity[] {
  if (scope.kind === 'window') {
    return summary.windows[scope.key][kind]
  }
  return summary.yearly[scope.year]?.[kind] ?? []
}

export function Dashboard({ summary, topN, isDemo, onReset }: Props) {
  const [kind, setKind] = useState<EntityKind>('songs')
  const [scope, setScope] = useState<Scope>({ kind: 'window', key: 'all_time' })
  const [limit, setLimit] = useState<number>(topN)

  const years = useMemo(
    () => Object.keys(summary.yearly).sort((a, b) => Number(b) - Number(a)),
    [summary],
  )
  const items = useMemo(
    () => getItems(summary, scope, kind),
    [summary, scope, kind],
  )

  const activeScopeTitle =
    scope.kind === 'window' ? windowLabel(scope.key) : `Calendar Year ${scope.year}`

  const kindTitle =
    kind === 'songs'
      ? 'Top Songs'
      : kind === 'albums'
        ? 'Top Albums'
        : 'Top Artists'

  const totalHours = Math.round(summary.totalMusicMsPlayed / 1000 / 3600)

  return (
    <div className="dashStack">
      <section className="card">
        <div className="dashHeader">
          <div>
            <div className="heroBadge">
              {isDemo ? 'DEMO ARCHIVE PREVIEW' : 'EXTENDED STREAMING HISTORY'}
            </div>
            <h1 className="dashTitle">Your Listening Archive</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Total music streams:{' '}
              <strong>{summary.totalMusicPlays.toLocaleString()}</strong> ·
              Listening time:{' '}
              <strong>{fmtHoursAndMinutes(summary.totalMusicMsPlayed)}</strong>
            </p>
          </div>
          <div className="row">
            <button className="button secondary small" onClick={onReset}>
              {isDemo ? '← Upload Your Own ZIP' : 'Upload Another ZIP'}
            </button>
          </div>
        </div>

        <div className="kpiGrid">
          <div className="kpiCard">
            <div className="kpiValue accent">
              {summary.totalMusicPlays.toLocaleString()}
            </div>
            <div className="kpiLabel">Total Music Streams</div>
          </div>
          <div className="kpiCard">
            <div className="kpiValue">{totalHours.toLocaleString()} hrs</div>
            <div className="kpiLabel">Total Listening Time</div>
          </div>
          <div className="kpiCard">
            <div className="kpiValue">{years.length}</div>
            <div className="kpiLabel">Calendar Years Active</div>
          </div>
          <div className="kpiCard">
            <div className="kpiValue" style={{ fontSize: 18 }}>
              {activeScopeTitle}
            </div>
            <div className="kpiLabel">Active Time Scope</div>
          </div>
        </div>

        <div className="controls">
          <div className="segmented" role="tablist" aria-label="Entity category">
            <button
              className={kind === 'songs' ? 'segBtn active' : 'segBtn'}
              onClick={() => setKind('songs')}
            >
              🎵 Songs
            </button>
            <button
              className={kind === 'albums' ? 'segBtn active' : 'segBtn'}
              onClick={() => setKind('albums')}
            >
              💿 Albums
            </button>
            <button
              className={kind === 'artists' ? 'segBtn active' : 'segBtn'}
              onClick={() => setKind('artists')}
            >
              🎙️ Artists
            </button>
          </div>

          <div className="scopeRow">
            <label className="label">
              Time Scope
              <select
                className="select"
                value={
                  scope.kind === 'window'
                    ? `w:${scope.key}`
                    : `y:${scope.year}`
                }
                onChange={(e) => {
                  const v = e.target.value
                  if (v.startsWith('w:')) {
                    setScope({
                      kind: 'window',
                      key: v.slice(2) as TimeWindowKey,
                    })
                  } else if (v.startsWith('y:')) {
                    setScope({ kind: 'year', year: v.slice(2) })
                  }
                }}
              >
                <optgroup label="Rolling Windows">
                  {(
                    [
                      'last_1_month',
                      'last_1_year',
                      'last_5_years',
                      'all_time',
                    ] as TimeWindowKey[]
                  ).map((k) => (
                    <option key={k} value={`w:${k}`}>
                      {windowLabel(k)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Calendar Year">
                  {years.map((y) => (
                    <option key={y} value={`y:${y}`}>
                      {y}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            <label className="label">
              Show Top
              <select
                className="select"
                style={{ minWidth: 110 }}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              >
                {[10, 15, 25].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <div className="grid">
        <div className="gridCard">
          <div className="gridCardHeader">
            <div className="gridTitle">
              {kindTitle} by Listening Time ({activeScopeTitle})
            </div>
            <div className="gridSubtitle">
              Top {Math.min(limit, 15)} visualized
            </div>
          </div>
          <TopEntitiesChart items={items} topN={Math.min(limit, 15)} />
        </div>
        <div className="gridCard">
          <div className="gridCardHeader">
            <div className="gridTitle">
              Ranked {kindTitle} Breakdown
            </div>
            <div className="gridSubtitle">
              Showing {Math.min(limit, items.length)} entries
            </div>
          </div>
          <TopEntitiesTable items={items} topN={limit} />
        </div>
      </div>
    </div>
  )
}
