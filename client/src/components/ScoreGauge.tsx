interface ScoreGaugeProps {
  value: number
  max?: number
  size?: number
}

// Semi-circle gauge with red/amber/green bands and a needle, drawn as plain SVG
// (no chart library needed for a fixed 3-band dial).
export function ScoreGauge({ value, max = 100, size = 160 }: ScoreGaugeProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 10
  const clamped = Math.max(0, Math.min(max, value))
  const pct = clamped / max

  const polarToCartesian = (angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(angleRad), y: cy - r * Math.sin(angleRad) }
  }

  const arcPath = (startDeg: number, endDeg: number) => {
    const start = polarToCartesian(startDeg)
    const end = polarToCartesian(endDeg)
    const largeArc = startDeg - endDeg > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
  }

  const needleAngle = 180 - pct * 180
  const needleTip = polarToCartesian(needleAngle)

  return (
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      <path d={arcPath(180, 120)} stroke="#ef4444" strokeWidth={12} fill="none" strokeLinecap="round" />
      <path d={arcPath(120, 60)} stroke="#f59e0b" strokeWidth={12} fill="none" />
      <path d={arcPath(60, 0)} stroke="#10b981" strokeWidth={12} fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#111827" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill="#111827" />
    </svg>
  )
}
