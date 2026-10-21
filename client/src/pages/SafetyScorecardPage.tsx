import { useState } from 'react'
import { ScoreGauge } from '@/components/ScoreGauge'
import { ScorecardCategorySection } from '@/components/ScorecardCategorySection'
import {
  subcontractors,
  safetyScore,
  ptpScore,
  observationScore,
  responsivenessScore,
  kudosScore,
  wpsScore,
  monthlyTrend,
  scoreColorClasses,
} from '@/lib/dummyScorecard'
import {
  ResponsiveContainer,
  Bar,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

export default function SafetyScorecardPage() {
  const [project, setProject] = useState('all')
  const [subcontractor, setSubcontractor] = useState('all')
  const [month, setMonth] = useState('all')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Safety Scorecard</h1>
        <p className="mt-1 text-sm text-gray-500">Ongoing tracking of safety performance across all trades</p>
        <p className="mt-1 text-xs text-amber-600">Showing sample data — this will connect to live tracking data soon.</p>
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Project</label>
          <select className="input-field" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="all">All Projects</option>
            <option value="downtown-tower">Downtown Tower</option>
          </select>
        </div>
        <div>
          <label className="label">Subcontractors</label>
          <select className="input-field" value={subcontractor} onChange={(e) => setSubcontractor(e.target.value)}>
            <option value="all">All Subcontractors</option>
            {subcontractors.map((s) => (
              <option key={s.company} value={s.company}>{s.company}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Month</label>
          <select className="input-field" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All Months</option>
            {monthlyTrend.map((m) => (
              <option key={m.month} value={m.month}>{m.month}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Overall Safety Score + MoM trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 flex flex-col items-center justify-center">
          <p className="text-xs text-gray-500 mb-1">Safety Score</p>
          <ScoreGauge value={safetyScore} />
          <p className="text-3xl font-bold text-gray-900 -mt-1">{safetyScore}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500 mb-2">Safety Score MoM</p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={monthlyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="safety" name="Safety Score" fill="#c3d0fb" radius={[4, 4, 0, 0]} barSize={24} />
              <Line type="monotone" dataKey="safety" name="Trend" stroke="#E8336D" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subcontractor Scorecard (drill) */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-900">Subcontractor Scorecard (Drill)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Subcontractor Company', 'Safety Score', 'PTP Score', 'Observation Score', 'Kudos Score', 'WPS Score', 'Responsiveness Score'].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subcontractors.map((s) => (
                <tr key={s.company}>
                  <td className="px-4 py-2 text-sm text-gray-900 font-medium">{s.company}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(s.safety)}`}>{s.safety}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(s.ptp, 50)}`}>{s.ptp}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(s.observation)}`}>{s.observation}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(s.kudos, 1)}`}>{s.kudos}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(s.wps)}`}>{s.wps}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${scoreColorClasses(s.responsiveness)}`}>{s.responsiveness}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ScorecardCategorySection
        title="Pre Task Plan"
        score={ptpScore}
        max={50}
        trend={monthlyTrend.map((m) => ({ month: m.month, value: m.ptp }))}
        byContractor={subcontractors.map((s) => ({ name: s.company, score: s.ptp }))}
      />

      <ScorecardCategorySection
        title="Observation"
        score={observationScore}
        trend={monthlyTrend.map((m) => ({ month: m.month, value: m.observation }))}
        byContractor={subcontractors.map((s) => ({ name: s.company, score: s.observation }))}
      />

      <ScorecardCategorySection
        title="Responsiveness"
        score={responsivenessScore}
        trend={monthlyTrend.map((m) => ({ month: m.month, value: m.responsiveness }))}
        byContractor={subcontractors.map((s) => ({ name: s.company, score: s.responsiveness }))}
      />

      <ScorecardCategorySection
        title="Kudos"
        score={kudosScore}
        max={1}
        trend={monthlyTrend.map((m) => ({ month: m.month, value: m.kudos }))}
        byContractor={subcontractors.map((s) => ({ name: s.company, score: s.kudos }))}
      />

      <ScorecardCategorySection
        title="WPS"
        score={wpsScore}
        trend={monthlyTrend.map((m) => ({ month: m.month, value: m.wps }))}
        byContractor={subcontractors.map((s) => ({ name: s.company, score: s.wps }))}
      />
    </div>
  )
}
