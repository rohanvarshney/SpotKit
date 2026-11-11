import { useMemo, useState } from 'react'
import type { SummaryResult, TimeWindowKey, TopEntity } from '../../lib/spotify/types'
import { TopEntitiesChart } from './TopEntitiesChart'
import { TopEntitiesTable } from './TopEntitiesTable'

type EntityKind = 'songs' | 'albums' | 'artists'
type Scope = { kind: 'window'; key: TimeWindowKey } | { kind: 'year'; year: string }

type Props = {
  summary: SummaryResult
  topN: number
  onReset: () => void
}

function fmtMinutes(ms: number): string {
  return `${Math.round(ms / 1000 / 60).toLocaleString()} min`
}

function windowLabel(key: TimeWindowKey): string {
  switch (key) {
    case 'last_1_month':
      return 'Last 1 month'
    case 'last_1_year':
      return 'Last 1 year'
    case 'last_5_years':
      return 'Last 5 years'
    case 'all_time':
      return 'All-time'
  }
}

function getItems(summary: SummaryResult, scope: Scope, kind: EntityKind): TopEntity[] {
  if (scope.kind === 'window') {
    return summary.windows[scope.key][kind]
  }
  return summary.yearly[scope.year]?.[kind] ?? []
}

export function Dashboard({ summary, topN, onReset }: Props) {
  const [kind, setKind] = useState<EntityKind>('songs')
  const [scope, setScope] = useState<Scope>({ kind: 'window', key: 'all_time' })

  const years = useMemo(() => Object.keys(summary.yearly).sort((a, b) => Number(b) - Number(a)), [summary])
  const items = useMemo(() => getItems(summary, scope, kind), [summary, scope, kind])

  return (
    <section className="card">
      <div className="dashHeader">
        <div>
          <h1>Your listening stats</h1>
          <p className="muted">
            Total music plays: <b>{summary.totalMusicPlays.toLocaleString()}</b> · Total time:{' '}
            <b>{fmtMinutes(summary.totalMusicMsPlayed)}</b>
          </p>
        </div>
        <div className="dashActions">
          <button className="button secondary" onClick={onReset}>
            Upload another ZIP
          </button>
        </div>
      </div>

      <div className="controls">
        <div className="segmented">
          <button className={kind === 'songs' ? 'segBtn active' : 'segBtn'} onClick={() => setKind('songs')}>
            Songs
          </button>
          <button className={kind === 'albums' ? 'segBtn active' : 'segBtn'} onClick={() => setKind('albums')}>
            Albums
          </button>
          <button className={kind === 'artists' ? 'segBtn active' : 'segBtn'} onClick={() => setKind('artists')}>
            Artists
          </button>
        </div>

        <div className="scopeRow">
          <label className="label">
            Time scope
            <select
              className="select"
              value={scope.kind === 'window' ? `w:${scope.key}` : `y:${scope.year}`}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('w:')) {
                  setScope({ kind: 'window', key: v.slice(2) as TimeWindowKey })
                } else if (v.startsWith('y:')) {
                  setScope({ kind: 'year', year: v.slice(2) })
                }
              }}
            >
              <optgroup label="Windows">
                {(['last_1_month', 'last_1_year', 'last_5_years', 'all_time'] as TimeWindowKey[]).map((k) => (
                  <option key={k} value={`w:${k}`}>
                    {windowLabel(k)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Calendar year">
                {years.map((y) => (
                  <option key={y} value={`y:${y}`}>
                    {y}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="label">
            Show top
            <select className="select" value={topN} disabled>
              <option value={topN}>{topN}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid">
        <div className="gridCard">
          <div className="gridTitle">Ranking</div>
          <TopEntitiesChart items={items} topN={Math.min(topN, 15)} />
        </div>
        <div className="gridCard">
          <div className="gridTitle">Details</div>
          <TopEntitiesTable items={items} topN={topN} />
        </div>
      </div>
    </section>
  )
}

