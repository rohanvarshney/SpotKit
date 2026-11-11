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
            <th style={{ width: 44 }}>#</th>
            <th>Name</th>
            <th style={{ width: 130, textAlign: 'right' }}>Time</th>
            <th style={{ width: 110, textAlign: 'right' }}>Plays</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((it, idx) => (
            <tr key={it.key}>
              <td className="muted">{idx + 1}</td>
              <td>
                <div className="cellTitle">{it.label}</div>
              </td>
              <td style={{ textAlign: 'right' }}>{fmtMinutes(it.msPlayed)}</td>
              <td style={{ textAlign: 'right' }}>{it.playCount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

