export default function Sparkline({ data, color = '#26a69a', width = 80, height = 28 }) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} style={{ display: 'block', opacity: 0.3 }}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke={color} strokeWidth={1} />
      </svg>
    );
  }

  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    // SVG y-axis is inverted: 0 is top, height is bottom
    const y = height - ((value - min) / range) * (height - 4) - 2; 
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* The actual sparkline */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dot at the latest price */}
      {(() => {
        const last  = data[data.length - 1];
        const lastY = height - ((last - min) / range) * (height - 4) - 2;
        return (
          <circle cx={width} cy={lastY} r={2.5} fill={color} />
        );
      })()}
    </svg>
  );
}