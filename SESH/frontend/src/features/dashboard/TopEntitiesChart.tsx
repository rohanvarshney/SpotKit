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
    label: it.label.length > 36 ? `${it.label.slice(0, 36)}…` : it.label,
    minutes: Math.round(it.msPlayed / 1000 / 60),
  }))
}

export function TopEntitiesChart({ items, topN }: Props) {
  const data = toRows(items, topN).reverse()

  return (
    <div className="chartWrap">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 6, right: 18, bottom: 6, left: 8 }}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'rgba(255,255,255,0.62)', fontSize: 12 }}
            stroke="rgba(255,255,255,0.12)"
          />
          <YAxis
            type="category"
            dataKey="label"
            width={200}
            tick={{ fill: 'rgba(255,255,255,0.82)', fontSize: 12 }}
            stroke="rgba(255,255,255,0.12)"
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{
              background: '#161622',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 12,
              color: 'rgba(255,255,255,0.94)',
              boxShadow: '0 12px 28px rgba(0,0,0,0.6)',
            }}
            labelStyle={{ color: '#4ade80', fontWeight: 700, marginBottom: 4 }}
            formatter={(value) => [`${Number(value).toLocaleString()} min`, 'Listening Time']}
          />
          <Bar
            dataKey="minutes"
            fill="#1ed760"
            radius={[0, 8, 8, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
