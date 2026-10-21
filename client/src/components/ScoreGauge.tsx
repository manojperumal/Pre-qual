interface ScoreGaugeProps {
  value: number
  max?: number
  size?: number
}

// Speedometer-style gauge: a thick banded arc (red -> amber -> green) with
// tick marks and a needle pointing at the current value.
export function ScoreGauge({ value, max = 100, size = 180 }: ScoreGaugeProps) {
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = size * 0.1
  const r = size / 2 - strokeWidth

  const clamped = Math.max(0, Math.min(max, value))
  const pct = clamped / max

  // Gauge sweeps from 180deg (left, min) to 0deg (right, max), measured the
  // standard math way (counter-clockwise), then flipped for screen's y-down axis.
  const pointAt = (angleDeg: number, radius: number) => {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
  }

  const bandArc = (fromPct: number, toPct: number) => {
    const startAngle = 180 - fromPct * 180
    const endAngle = 180 - toPct * 180
    const start = pointAt(startAngle, r)
    const end = pointAt(endAngle, r)
    const largeArc = startAngle - endAngle > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  const bands = [
    { from: 0, to: 0.45, color: '#ef4444' },
    { from: 0.45, to: 0.75, color: '#f59e0b' },
    { from: 0.75, to: 1, color: '#10b981' },
  ]

  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const needleAngle = 180 - pct * 180
  const needleLen = r - strokeWidth / 2 - 2
  const needleTip = pointAt(needleAngle, needleLen)
  const needleBaseA = pointAt(needleAngle + 90, 3)
  const needleBaseB = pointAt(needleAngle - 90, 3)

  const height = size / 2 + strokeWidth + 8

  return (
    <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
      {bands.map((b) => (
        <path
          key={b.color}
          d={bandArc(b.from, b.to)}
          stroke={b.color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      ))}

      {ticks.map((t) => {
        const angle = 180 - t * 180
        const inner = pointAt(angle, r - strokeWidth / 2 - 4)
        const outer = pointAt(angle, r + strokeWidth / 2 + 2)
        return (
          <line key={t} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#ffffff" strokeWidth={2} />
        )
      })}

      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBaseA.x},${needleBaseA.y} ${needleBaseB.x},${needleBaseB.y}`}
        fill="#1f2937"
      />
      <circle cx={cx} cy={cy} r={6} fill="#1f2937" stroke="#fff" strokeWidth={1.5} />
    </svg>
  )
}
