// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type { TopEntity } from '../../lib/spotify/types'

type Props = {
  items: TopEntity[]
  topN: number
}

function fmtMinutes(ms: number): string {
  const minutes = ms / 1000 / 60
  if (minutes >= 60) {
    const hours = minutes / 60
    return `${hours.toFixed(1)} h`
  }
  return `${Math.round(minutes).toLocaleString()} min`
}

export function TopEntitiesTable({ items, topN }: Props) {
  const slice = items.slice(0, topN)

  return (
    <div className="tableWrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 52 }}>Rank</th>
            <th>Title / Artist</th>
            <th style={{ width: 110, textAlign: 'right' }}>Time</th>
            <th style={{ width: 96, textAlign: 'right' }}>Streams</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((it, idx) => (
            <tr key={it.key}>
              <td>
                <span className={idx < 3 ? 'rankBadge top3' : 'rankBadge'}>
                  #{idx + 1}
                </span>
              </td>
              <td>
                <div className="cellTitle">{it.label}</div>
              </td>
              <td className="cellMetric" style={{ textAlign: 'right' }}>
                {fmtMinutes(it.msPlayed)}
              </td>
              <td className="cellMetric" style={{ textAlign: 'right' }}>
                {it.playCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
