import { ScoreGauge } from './ScoreGauge'
import { scoreColorClasses } from '@/lib/dummyScorecard'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'

interface BarItem {
  name: string
  score: number
}

interface TrendPoint {
  month: string
  value: number
}

interface ScorecardCategorySectionProps {
  title: string
  score: number
  max?: number
  trend: TrendPoint[]
  byContractor: BarItem[]
  projectName?: string
}

export function ScorecardCategorySection({ title, score, max = 100, trend, byContractor, projectName = 'Downtown Tower' }: ScorecardCategorySectionProps) {
  const sorted = [...byContractor].sort((a, b) => b.score - a.score)

  return (
    <div className="space-y-4">
      <div className="bg-[#111827] text-white text-sm font-semibold px-4 py-2 rounded-md">{title}</div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-500 mb-1">{title} Score</p>
          <ScoreGauge value={score} max={max} />
          <p className="text-3xl font-bold text-gray-900 -mt-1">{score}</p>
        </div>

        <div className="card p-5">
          <p className="text-xs text-gray-500 mb-2">MoM {title} Score</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="value" stroke="#3B6CF5" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500 mb-2">{title} Score by Subcontractor</p>
          <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 36)}>
            <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>
                {sorted.map((entry) => (
                  <Cell key={entry.name} fill="#3B6CF5" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500">{title} Scorecard Overview</p>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Project', 'Subcontractor', `${title} Score`].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2 text-sm text-gray-600">{projectName}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{row.name}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(row.score, max)}`}>
                        {row.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
