// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type { TopEntity } from '../../lib/spotify/types'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Props = {
  items: TopEntity[]
  topN: number
}

type ChartRow = {
  key: string
  label: string
  minutes: number
}

function toRows(items: TopEntity[], topN: number): ChartRow[] {
  return items.slice(0, topN).map((it) => ({
    key: it.key,
    label: it.label.length > 42 ? `${it.label.slice(0, 42)}…` : it.label,
    minutes: Math.round(it.msPlayed / 1000 / 60),
  }))
}

export function TopEntitiesChart({ items, topN }: Props) {
  const data = toRows(items, topN).reverse()

  return (
    <div className="chartWrap">
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 12 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
            stroke="rgba(255,255,255,0.12)"
          />
          <YAxis
            type="category"
            dataKey="label"
            width={220}
            tick={{ fill: 'rgba(255,255,255,0.75)', fontSize: 12 }}
            stroke="rgba(255,255,255,0.12)"
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(10,10,16,0.96)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              color: 'rgba(255,255,255,0.92)',
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.75)' }}
            formatter={(value) => [`${value} min`, 'Time']}
          />
          <Bar dataKey="minutes" fill="rgba(16, 185, 129, 0.85)" radius={[8, 8, 8, 8]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

