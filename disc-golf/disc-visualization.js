var { useState, useEffect, useRef, useMemo } = React;

function DiscVisualization() {
  const [angleOfAttack, setAngleOfAttack] = useState(5);
  const [spinRate, setSpinRate] = useState(800);
  const [speed, setSpeed] = useState(22);
  const [time, setTime] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime(t => t + dt);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const W = 600;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const aoaRad = (angleOfAttack * Math.PI) / 180;

  // Spin animation phase
  const spinPhase = (time * spinRate * 6) % 360; // degrees

  // Streamline offset based on airspeed
  const streamOffset = (time * speed * 12) % 80;

  // Force magnitudes (simplified, for visual scaling)
  const dynamicPressure = 0.5 * 1.225 * speed * speed * 0.057;
  const CL = 0.15 + 1.4 * aoaRad;
  const CD = 0.08 + 2.72 * aoaRad * aoaRad;
  const liftMag = dynamicPressure * CL;
  const dragMag = dynamicPressure * CD;
  const liftScale = Math.min(Math.max(liftMag * 1.2, 0), 80);
  const dragScale = Math.min(dragMag * 1.5, 60);

  // Disc cross-section path (cambered airfoil profile)
  // Rotated by angle of attack around center
  const discWidth = 160;
  const discHeight = 18;
  const rimThickness = 14;
  const domeHeight = 12;

  const discProfile = useMemo(() => {
    const hw = discWidth / 2;
    const pts = [];

    // Top surface: domed
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = -hw + t * discWidth;
      const dome = domeHeight * Math.sin(t * Math.PI);
      // Thicker rim at edges
      const rimFactor = Math.max(0, 1 - Math.abs(t - 0.5) * 2);
      const rimAdd = (1 - rimFactor) * (rimThickness * 0.3);
      pts.push({ x, y: -(discHeight / 2 + dome + rimAdd) });
    }

    // Right rim
    pts.push({ x: hw, y: discHeight / 2 });

    // Bottom surface: mostly flat with slight rim curl
    for (let i = 40; i >= 0; i--) {
      const t = i / 40;
      const x = -hw + t * discWidth;
      const rimFactor = Math.max(0, 1 - Math.abs(t - 0.5) * 2);
      const rimCurl = (1 - rimFactor) * (rimThickness * 0.5);
      pts.push({ x, y: discHeight / 2 + rimCurl });
    }

    return pts;
  }, []);

  // Rotate points by AoA
  const rotatePoint = (px, py) => {
    const rx = px * Math.cos(aoaRad) - py * Math.sin(aoaRad);
    const ry = px * Math.sin(aoaRad) + py * Math.cos(aoaRad);
    return { x: cx + rx, y: cy + ry };
  };

  const discPath = discProfile
    .map((p, i) => {
      const r = rotatePoint(p.x, p.y);
      return `${i === 0 ? 'M' : 'L'}${r.x.toFixed(1)},${r.y.toFixed(1)}`;
    })
    .join(' ') + ' Z';

  // Streamlines
  const generateStreamlines = () => {
    const lines = [];
    const numLines = 8;

    for (let i = 0; i < numLines; i++) {
      const baseY = -100 + (i / (numLines - 1)) * 200;
      const isAbove = baseY < 0;
      const pts = [];
      const segments = 30;

      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        let x = -W / 2 + t * W + streamOffset;
        x = ((x + W) % W) - W / 2;
        let y = baseY;

        // Deflection near the disc
        const distFromCenter = Math.abs(x);
        const discInfluence = Math.max(0, 1 - distFromCenter / (discWidth * 0.7));

        if (discInfluence > 0) {
          if (isAbove) {
            // Air speeds up and compresses over dome
            const compression = discInfluence * (20 + angleOfAttack * 1.5);
            y -= compression;
          } else {
            // Air slows and expands below
            const expansion = discInfluence * (10 + angleOfAttack * 0.8);
            y += expansion;
          }
        }

        // Rotate by AoA
        const r = rotatePoint(x, y);
        pts.push(r);
      }

      lines.push({ pts, isAbove });
    }
    return lines;
  };

  const streamlines = generateStreamlines();

  // Force arrow helper
  const forceArrow = (startX, startY, dx, dy, color, label) => {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return null;
    const endX = startX + dx;
    const endY = startY + dy;
    const headLen = 10;
    const angle = Math.atan2(dy, dx);
    const h1x = endX - headLen * Math.cos(angle - 0.4);
    const h1y = endY - headLen * Math.sin(angle - 0.4);
    const h2x = endX - headLen * Math.cos(angle + 0.4);
    const h2y = endY - headLen * Math.sin(angle + 0.4);

    return (
      <g key={label}>
        <line x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={color} strokeWidth="3" />
        <polygon points={`${endX},${endY} ${h1x},${h1y} ${h2x},${h2y}`}
          fill={color} />
        <text x={endX + 8} y={endY + 4} fill={color}
          fontSize="13" fontWeight="bold">{label}</text>
      </g>
    );
  };

  // Lift direction: perpendicular to disc surface (rotated by AoA)
  const liftDx = -liftScale * Math.sin(aoaRad);
  const liftDy = -liftScale * Math.cos(aoaRad);

  // Drag direction: opposing airflow (horizontal)
  const dragDx = -dragScale;
  const dragDy = 0;

  // Weight: straight down
  const weightScale = 35;

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold mb-2">Disc Aerodynamics</h2>
      <p className="text-gray-600 mb-4 text-sm">
        Cross-section view of a spinning disc in flight. The domed top forces air to travel faster above (blue),
        creating lower pressure and lift. Adjust the angle of attack to see how forces change.
      </p>

      <div className="bg-gray-900 rounded-lg p-4 mb-4">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[600px]">
          <defs>
            <marker id="arrowBlue" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0,0 6,2 0,4" fill="#60a5fa" />
            </marker>
            <marker id="arrowRed" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0,0 6,2 0,4" fill="#f87171" />
            </marker>
          </defs>

          {/* Airflow direction label */}
          <text x={30} y={25} fill="#9ca3af" fontSize="12">Airflow →</text>

          {/* Streamlines */}
          {streamlines.map((line, i) => {
            const pathD = line.pts
              .map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ');
            const color = line.isAbove ? '#60a5fa' : '#f87171';
            const opacity = line.isAbove ? 0.6 : 0.4;
            return (
              <path key={i} d={pathD} fill="none" stroke={color}
                strokeWidth="1.5" opacity={opacity}
                markerEnd={line.isAbove ? 'url(#arrowBlue)' : 'url(#arrowRed)'} />
            );
          })}

          {/* Disc body */}
          <path d={discPath} fill="#6b7280" stroke="#d1d5db" strokeWidth="2" />

          {/* Spin indicator */}
          <g transform={`rotate(${spinPhase}, ${cx}, ${cy})`}>
            <circle cx={cx} cy={cy} r="3" fill="#fbbf24" />
            <line x1={cx} y1={cy} x2={cx + 12} y2={cy}
              stroke="#fbbf24" strokeWidth="2" />
          </g>

          {/* Pressure labels */}
          {(() => {
            const abovePos = rotatePoint(0, -45);
            const belowPos = rotatePoint(0, 45);
            return (
              <>
                <text x={abovePos.x} y={abovePos.y} fill="#60a5fa"
                  fontSize="11" textAnchor="middle" opacity="0.8">
                  Low pressure (fast)
                </text>
                <text x={belowPos.x} y={belowPos.y} fill="#f87171"
                  fontSize="11" textAnchor="middle" opacity="0.8">
                  High pressure (slow)
                </text>
              </>
            );
          })()}

          {/* Force arrows */}
          {forceArrow(cx, cy, liftDx, liftDy, '#22c55e', 'Lift')}
          {forceArrow(cx, cy, dragDx, dragDy, '#f59e0b', 'Drag')}
          {forceArrow(cx, cy, 0, weightScale, '#ef4444', 'Weight')}

          {/* AoA arc indicator */}
          {(() => {
            const arcR = 50;
            const startAngle = 0;
            const endAngle = -aoaRad;
            const x1 = cx + arcR;
            const y1 = cy;
            const x2 = cx + arcR * Math.cos(endAngle);
            const y2 = cy + arcR * Math.sin(endAngle);
            const sweep = angleOfAttack >= 0 ? 0 : 1;
            if (Math.abs(angleOfAttack) < 0.5) return null;
            return (
              <g>
                <path d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 0 ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`}
                  fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4,2" />
                <text x={cx + arcR + 8} y={cy - 8} fill="#a78bfa" fontSize="11">
                  AoA: {angleOfAttack}°
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Angle of Attack: {angleOfAttack}°
          </label>
          <input type="range" min="-15" max="15" step="1" value={angleOfAttack}
            onChange={e => setAngleOfAttack(Number(e.target.value))}
            className="w-full" />
          <p className="text-xs text-gray-400 mt-1">Nose up (+) increases lift and drag</p>
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Spin Rate: {spinRate} RPM
          </label>
          <input type="range" min="200" max="1200" step="50" value={spinRate}
            onChange={e => setSpinRate(Number(e.target.value))}
            className="w-full" />
          <p className="text-xs text-gray-400 mt-1">More spin = more gyroscopic stability</p>
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Airspeed: {speed} m/s ({(speed * 2.237).toFixed(0)} mph)
          </label>
          <input type="range" min="15" max="30" step="1" value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="w-full" />
          <p className="text-xs text-gray-400 mt-1">Faster = more lift and drag</p>
        </div>
      </div>

      {/* Force readout */}
      <div className="mt-4 flex gap-6 text-sm">
        <span className="text-green-500">Lift: {liftMag.toFixed(1)} N</span>
        <span className="text-yellow-500">Drag: {(dynamicPressure * CD).toFixed(1)} N</span>
        <span className="text-purple-400">L/D Ratio: {(CL / CD).toFixed(1)}</span>
      </div>
    </div>
  );
}
