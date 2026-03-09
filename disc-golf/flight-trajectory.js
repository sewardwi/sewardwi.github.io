var { useState, useRef, useEffect, useCallback, useMemo } = React;

// Physics constants
const RHO = 1.225;        // air density kg/m^3
const DISC_MASS = 0.175;  // kg
const DISC_AREA = 0.057;  // m^2
const DISC_DIAM = 0.21;   // m
const I_SPIN = 0.002;     // moment of inertia kg*m^2
const G = 9.81;           // gravity m/s^2
const SPIN_DECAY = 0.06;  // fraction per second
const DT = 0.005;         // simulation timestep

// Stability presets: [name, CL0, CLa, CD0, CDa, CM0, CMa_base, turn, fade]
const STABILITY_PRESETS = {
  understable: { name: 'Understable', turn: -3, fade: 1, CM0: -0.02, CMa: -0.06 },
  neutral:     { name: 'Neutral',     turn: -1, fade: 2, CM0: -0.04, CMa: -0.12 },
  overstable:  { name: 'Overstable',  turn: 0,  fade: 4, CM0: -0.06, CMa: -0.20 },
};

function simulateFlight(params) {
  const { speed, spinRPM, hyzerDeg, noseDeg, stability } = params;
  const preset = STABILITY_PRESETS[stability];

  const CL0 = 0.15;
  const CLa = 1.4;
  const CD0 = 0.08;
  const CDa = 2.72;

  // State: position, velocity, roll (bank) angle, spin
  let x = 0, y = 0, z = 1.5; // start at release height
  let phi = (hyzerDeg * Math.PI) / 180; // roll angle (positive = hyzer = tilted left for RHBH)
  const launchAngle = (8 * Math.PI) / 180; // slight upward launch
  const noseAngle = (noseDeg * Math.PI) / 180;

  // Disc pitch orientation is fixed by gyroscopic stability:
  // it's the launch angle plus any nose-up/down the thrower adds
  const discPitch = launchAngle + noseAngle;

  let vx = speed * Math.cos(launchAngle); // forward
  let vy = 0;                              // lateral
  let vz = speed * Math.sin(launchAngle); // vertical
  let omega = (spinRPM * 2 * Math.PI) / 60; // rad/s

  const points = [{ x, y, z, phi, v: speed, t: 0 }];
  let t = 0;
  const maxTime = 8;
  const maxPoints = maxTime / DT;

  for (let step = 0; step < maxPoints; step++) {
    t += DT;
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (v < 1 || z < 0) break;

    const vHoriz = Math.sqrt(vx * vx + vy * vy);
    const heading = Math.atan2(vy, vx);
    const flightPathAngle = Math.atan2(vz, vHoriz);

    // Angle of attack: difference between disc pitch and velocity direction
    // When climbing, flightPathAngle increases, reducing alpha (self-stabilizing)
    // When descending, flightPathAngle decreases, increasing alpha (more lift/fade)
    const alpha = discPitch - flightPathAngle;

    // Aerodynamic coefficients
    const CL = CL0 + CLa * alpha;
    const CD = CD0 + CDa * alpha * alpha;

    // Speed-dependent stability: turn dominates at high speed, fade at low
    const speedFraction = Math.min(v / speed, 1.0);
    const turnEffect = preset.turn * 0.015 * speedFraction;
    const fadeEffect = preset.fade * 0.02 * (1 - speedFraction * 0.5);
    const CM = preset.CM0 + (preset.CMa + turnEffect - fadeEffect) * alpha;

    const qA = 0.5 * RHO * v * v * DISC_AREA;

    const lift = qA * Math.max(CL, 0);
    const drag = qA * CD;

    // Gyroscopic precession: pitching moment -> roll rate
    const moment = qA * DISC_DIAM * CM;
    const rollRate = omega > 5 ? -moment / (I_SPIN * omega) : 0;
    phi += rollRate * DT;

    // Clamp roll to prevent wild spinning
    phi = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, phi));

    // Decompose forces
    // Lift is perpendicular to velocity, tilted by roll angle
    // In the plane perpendicular to velocity:
    //   - vertical component of lift = lift * cos(phi)
    //   - lateral component = lift * sin(phi) (positive phi = left for hyzer)
    const liftVertical = lift * Math.cos(phi);
    const liftLateral = lift * Math.sin(phi);

    // Drag opposes velocity
    const dragX = -(drag / v) * vx;
    const dragY = -(drag / v) * vy;
    const dragZ = -(drag / v) * vz;

    // Lateral lift is perpendicular to heading in XY plane
    const lateralX = -liftLateral * Math.sin(heading) / DISC_MASS;
    const lateralY = liftLateral * Math.cos(heading) / DISC_MASS;

    // Accelerations
    const ax = dragX / DISC_MASS + lateralX;
    const ay = dragY / DISC_MASS + lateralY;
    const az = dragZ / DISC_MASS + liftVertical / DISC_MASS - G;

    vx += ax * DT;
    vy += ay * DT;
    vz += az * DT;
    x += vx * DT;
    y += vy * DT;
    z += vz * DT;

    // Spin decay
    omega *= (1 - SPIN_DECAY * DT);

    // Record every few steps
    if (step % 10 === 0) {
      points.push({ x, y, z, phi, v, t });
    }
  }

  // Final point
  if (z >= 0) {
    points.push({ x, y, z: Math.max(z, 0), phi, v: Math.sqrt(vx*vx+vy*vy+vz*vz), t });
  }

  return points;
}

function FlightTrajectory() {
  const topCanvasRef = useRef(null);
  const sideCanvasRef = useRef(null);

  const [speed, setSpeed] = useState(22);
  const [spinRPM, setSpinRPM] = useState(800);
  const [hyzerDeg, setHyzerDeg] = useState(5);
  const [noseDeg, setNoseDeg] = useState(-2);
  const [stability, setStability] = useState('neutral');

  const points = useMemo(() =>
    simulateFlight({ speed, spinRPM, hyzerDeg, noseDeg, stability }),
    [speed, spinRPM, hyzerDeg, noseDeg, stability]
  );

  const canvasW = 580;
  const topH = 300;
  const sideH = 200;
  const padding = 40;

  const draw = useCallback(() => {
    const topCanvas = topCanvasRef.current;
    const sideCanvas = sideCanvasRef.current;
    if (!topCanvas || !sideCanvas) return;

    const topCtx = topCanvas.getContext('2d');
    const sideCtx = sideCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas resolution
    for (const [canvas, h] of [[topCanvas, topH], [sideCanvas, sideH]]) {
      canvas.width = canvasW * dpr;
      canvas.height = h * dpr;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
    }

    if (points.length < 2) return;

    // Compute bounds
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let maxZ = 0;
    const maxV = points[0].v;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    }

    // Add margins
    const xRange = Math.max(maxX - minX, 10);
    const yRange = Math.max(maxY - minY, 5);
    const zRange = Math.max(maxZ, 3);

    // Scale with some padding
    const yPadding = Math.max(yRange * 0.3, 3);

    const topScaleX = (canvasW - padding * 2) / xRange;
    const topScaleY = (topH - padding * 2) / (yRange + yPadding * 2);
    const topScale = Math.min(topScaleX, topScaleY);

    const sideScaleX = (canvasW - padding * 2) / xRange;
    const sideScaleZ = (sideH - padding * 2) / (zRange * 1.2);

    const mapTopX = (x) => padding + (x - minX) * topScale;
    const mapTopY = (y) => topH / 2 + (y - (minY + maxY) / 2) * topScale;
    const mapSideX = (x) => padding + (x - minX) * sideScaleX;
    const mapSideZ = (z) => sideH - padding - z * sideScaleZ;

    // Speed to color
    const speedColor = (v) => {
      const t = Math.min(v / maxV, 1);
      const r = Math.round(255 * (1 - t) + 59 * t);
      const g = Math.round(100 * (1 - t) + 130 * t);
      const b = Math.round(100 * (1 - t) + 246 * t);
      return `rgb(${r},${g},${b})`;
    };

    // --- TOP-DOWN VIEW ---
    topCtx.fillStyle = '#111827';
    topCtx.fillRect(0, 0, canvasW, topH);

    // Grid
    topCtx.strokeStyle = '#1f2937';
    topCtx.lineWidth = 1;
    const gridSpacingM = xRange > 80 ? 20 : 10;
    for (let gx = Math.ceil(minX / gridSpacingM) * gridSpacingM; gx <= maxX; gx += gridSpacingM) {
      const px = mapTopX(gx);
      topCtx.beginPath();
      topCtx.moveTo(px, 0);
      topCtx.lineTo(px, topH);
      topCtx.stroke();
    }

    // Axis labels
    topCtx.fillStyle = '#6b7280';
    topCtx.font = '11px sans-serif';
    topCtx.fillText('Top-down view (bird\'s eye)', padding, 16);
    topCtx.fillText('Distance →', canvasW - 80, topH - 8);
    topCtx.save();
    topCtx.translate(12, topH / 2);
    topCtx.rotate(-Math.PI / 2);
    topCtx.fillText('← Left / Right →', -40, 0);
    topCtx.restore();

    // Trajectory
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      topCtx.strokeStyle = speedColor(p1.v);
      topCtx.lineWidth = 3;
      topCtx.beginPath();
      topCtx.moveTo(mapTopX(p0.x), mapTopY(p0.y));
      topCtx.lineTo(mapTopX(p1.x), mapTopY(p1.y));
      topCtx.stroke();
    }

    // Disc orientation markers along path
    for (let i = 0; i < points.length; i += Math.max(1, Math.floor(points.length / 12))) {
      const p = points[i];
      const px = mapTopX(p.x);
      const py = mapTopY(p.y);

      // Small line showing bank angle
      const bankLen = 8;
      const bankAngle = p.phi;
      topCtx.strokeStyle = '#fbbf24';
      topCtx.lineWidth = 2;
      topCtx.beginPath();
      topCtx.moveTo(px - bankLen * Math.cos(bankAngle), py - bankLen * Math.sin(bankAngle));
      topCtx.lineTo(px + bankLen * Math.cos(bankAngle), py + bankLen * Math.sin(bankAngle));
      topCtx.stroke();
    }

    // Start/end markers
    topCtx.fillStyle = '#22c55e';
    topCtx.beginPath();
    topCtx.arc(mapTopX(points[0].x), mapTopY(points[0].y), 5, 0, Math.PI * 2);
    topCtx.fill();
    topCtx.fillStyle = '#ef4444';
    const last = points[points.length - 1];
    topCtx.beginPath();
    topCtx.arc(mapTopX(last.x), mapTopY(last.y), 5, 0, Math.PI * 2);
    topCtx.fill();

    // Distance label
    topCtx.fillStyle = '#9ca3af';
    topCtx.font = '12px sans-serif';
    topCtx.fillText(`Distance: ${last.x.toFixed(0)}m (${(last.x * 3.281).toFixed(0)}ft)`, padding, topH - 8);

    // --- SIDE VIEW ---
    sideCtx.fillStyle = '#111827';
    sideCtx.fillRect(0, 0, canvasW, sideH);

    // Ground line
    sideCtx.strokeStyle = '#374151';
    sideCtx.lineWidth = 2;
    const groundY = mapSideZ(0);
    sideCtx.beginPath();
    sideCtx.moveTo(padding, groundY);
    sideCtx.lineTo(canvasW - padding, groundY);
    sideCtx.stroke();

    // Ground fill
    sideCtx.fillStyle = '#1a2e1a';
    sideCtx.fillRect(padding, groundY, canvasW - padding * 2, sideH - groundY);

    // Labels
    sideCtx.fillStyle = '#6b7280';
    sideCtx.font = '11px sans-serif';
    sideCtx.fillText('Side view (altitude)', padding, 16);
    sideCtx.fillText('Distance →', canvasW - 80, sideH - 8);
    sideCtx.save();
    sideCtx.translate(12, sideH / 2);
    sideCtx.rotate(-Math.PI / 2);
    sideCtx.fillText('Height', -15, 0);
    sideCtx.restore();

    // Trajectory
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      sideCtx.strokeStyle = speedColor(p1.v);
      sideCtx.lineWidth = 3;
      sideCtx.beginPath();
      sideCtx.moveTo(mapSideX(p0.x), mapSideZ(Math.max(p0.z, 0)));
      sideCtx.lineTo(mapSideX(p1.x), mapSideZ(Math.max(p1.z, 0)));
      sideCtx.stroke();
    }

    // Start/end markers
    sideCtx.fillStyle = '#22c55e';
    sideCtx.beginPath();
    sideCtx.arc(mapSideX(points[0].x), mapSideZ(points[0].z), 5, 0, Math.PI * 2);
    sideCtx.fill();
    sideCtx.fillStyle = '#ef4444';
    sideCtx.beginPath();
    sideCtx.arc(mapSideX(last.x), mapSideZ(Math.max(last.z, 0)), 5, 0, Math.PI * 2);
    sideCtx.fill();

    // Speed legend
    const legX = canvasW - 150;
    const legY = 30;
    const legW = 100;
    const gradient = sideCtx.createLinearGradient(legX, 0, legX + legW, 0);
    gradient.addColorStop(0, speedColor(maxV));
    gradient.addColorStop(1, speedColor(0));
    sideCtx.fillStyle = gradient;
    sideCtx.fillRect(legX, legY, legW, 8);
    sideCtx.fillStyle = '#6b7280';
    sideCtx.font = '10px sans-serif';
    sideCtx.fillText('Fast', legX, legY - 3);
    sideCtx.fillText('Slow', legX + legW - 20, legY - 3);

  }, [points]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Flight Trajectory</h2>
      <p className="text-gray-600 mb-4 text-sm">
        Simulated flight path based on throw parameters. The disc turns right at high speed
        and fades left as it slows (RHBH throw). Yellow markers show disc bank angle.
      </p>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Release Speed: {speed} m/s ({(speed * 2.237).toFixed(0)} mph)
          </label>
          <input type="range" min="15" max="30" step="1" value={speed}
            onChange={e => setSpeed(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Spin Rate: {spinRPM} RPM
          </label>
          <input type="range" min="400" max="1200" step="50" value={spinRPM}
            onChange={e => setSpinRPM(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Hyzer Angle: {hyzerDeg}° {hyzerDeg > 0 ? '(hyzer)' : hyzerDeg < 0 ? '(anhyzer)' : '(flat)'}
          </label>
          <input type="range" min="-30" max="30" step="1" value={hyzerDeg}
            onChange={e => setHyzerDeg(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">
            Nose Angle: {noseDeg}° {noseDeg > 0 ? '(nose up)' : noseDeg < 0 ? '(nose down)' : '(level)'}
          </label>
          <input type="range" min="-15" max="15" step="1" value={noseDeg}
            onChange={e => setNoseDeg(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-sm text-gray-600 block mb-1">Disc Stability</label>
          <div className="flex gap-2 mt-1">
            {Object.entries(STABILITY_PRESETS).map(([key, val]) => (
              <button key={key}
                onClick={() => setStability(key)}
                className={`px-3 py-1.5 rounded text-sm font-medium ${
                  stability === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}>
                {val.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Turn: {STABILITY_PRESETS[stability].turn} / Fade: {STABILITY_PRESETS[stability].fade}
          </p>
        </div>
      </div>

      {/* Canvases */}
      <div className="space-y-4">
        <canvas ref={topCanvasRef} className="rounded-lg border border-gray-700 w-full max-w-[580px]" />
        <canvas ref={sideCanvasRef} className="rounded-lg border border-gray-700 w-full max-w-[580px]" />
      </div>

      {/* Flight summary */}
      <div className="mt-4 flex gap-6 text-sm text-gray-500">
        <span>Max height: {Math.max(...points.map(p => p.z)).toFixed(1)}m</span>
        <span>Flight time: {points[points.length - 1].t.toFixed(1)}s</span>
        <span>Lateral drift: {points[points.length - 1].y.toFixed(1)}m</span>
      </div>
    </div>
  );
}

// --- Why It's So Hard to Throw Straight ---

const VARIATION_PARAMS = [
  { key: 'hyzerDeg', label: 'Hyzer angle', unit: '°', range: 4 },
  { key: 'noseDeg', label: 'Nose angle', unit: '°', range: 4 },
  { key: 'speed', label: 'Release speed', unit: ' m/s', range: 3 },
  { key: 'spinRPM', label: 'Spin rate', unit: ' RPM', range: 150 },
];

function StraightThrowChallenge() {
  const canvasRef = useRef(null);
  const [variationScale, setVariationScale] = useState(1.0);

  const canvasW = 580;
  const canvasH = 400;
  const padding = 40;

  // "Perfect" baseline: a neutral disc thrown to fly as straight as possible
  const baseline = { speed: 22, spinRPM: 800, hyzerDeg: 2, noseDeg: -2, stability: 'neutral' };

  // Generate perturbed throws
  const allFlights = useMemo(() => {
    const flights = [];

    // The "perfect" throw
    flights.push({
      points: simulateFlight(baseline),
      label: 'Perfect throw',
      color: '#22c55e',
      width: 3,
    });

    // For each parameter, vary it ± while keeping others at baseline
    const colors = ['#f87171', '#60a5fa', '#fbbf24', '#c084fc'];
    VARIATION_PARAMS.forEach((param, pi) => {
      for (const sign of [-1, 1]) {
        const delta = sign * param.range * variationScale;
        const params = { ...baseline, [param.key]: baseline[param.key] + delta };
        const label = `${param.label} ${sign > 0 ? '+' : ''}${delta.toFixed(0)}${param.unit}`;
        flights.push({
          points: simulateFlight(params),
          label,
          color: colors[pi],
          width: 1.5,
        });
      }
    });

    return flights;
  }, [variationScale]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';
    ctx.scale(dpr, dpr);

    // Compute bounds across ALL flights
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const flight of allFlights) {
      for (const p of flight.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }

    const xRange = Math.max(maxX - minX, 20);
    const yRange = Math.max(maxY - minY, 10);
    const yPad = Math.max(yRange * 0.3, 5);

    const scaleX = (canvasW - padding * 2) / xRange;
    const scaleY = (canvasH - padding * 2) / (yRange + yPad * 2);
    const scale = Math.min(scaleX, scaleY);

    const mapX = (x) => padding + (x - minX) * scale;
    const mapY = (y) => canvasH / 2 + (y - (minY + maxY) / 2) * scale;

    // Background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Target line (straight ahead from release)
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    const targetY = mapY(0);
    ctx.beginPath();
    ctx.moveTo(padding, targetY);
    ctx.lineTo(canvasW - padding, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#4b5563';
    ctx.font = '10px sans-serif';
    ctx.fillText('Target line', canvasW - padding - 55, targetY - 5);

    // Labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px sans-serif';
    ctx.fillText('Top-down view — Why straight is hard', padding, 16);
    ctx.fillText('Distance →', canvasW - 80, canvasH - 8);

    // Draw variation flights first (behind), then perfect on top
    const sorted = [...allFlights].reverse();
    for (const flight of sorted) {
      ctx.strokeStyle = flight.color;
      ctx.lineWidth = flight.width;
      ctx.globalAlpha = flight.width > 2 ? 1 : 0.7;
      ctx.beginPath();
      for (let i = 0; i < flight.points.length; i++) {
        const p = flight.points[i];
        const px = mapX(p.x);
        const py = mapY(p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Landing dot
      const last = flight.points[flight.points.length - 1];
      ctx.fillStyle = flight.color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(mapX(last.x), mapY(last.y), flight.width > 2 ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Compute landing spread
    const landings = allFlights.slice(1).map(f => {
      const last = f.points[f.points.length - 1];
      return { x: last.x, y: last.y };
    });
    const perfectLanding = allFlights[0].points[allFlights[0].points.length - 1];
    const maxDrift = Math.max(...landings.map(l =>
      Math.sqrt((l.x - perfectLanding.x) ** 2 + (l.y - perfectLanding.y) ** 2)
    ));

    // Spread stat
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `Landing spread: ${maxDrift.toFixed(1)}m (${(maxDrift * 3.281).toFixed(0)}ft) from perfect`,
      padding, canvasH - 8
    );

    // Legend
    const legendX = canvasW - 170;
    let legendY = 35;
    ctx.font = '10px sans-serif';
    const legendItems = [
      { color: '#22c55e', label: 'Perfect throw' },
      { color: '#f87171', label: `Hyzer ±${(VARIATION_PARAMS[0].range * variationScale).toFixed(0)}°` },
      { color: '#60a5fa', label: `Nose ±${(VARIATION_PARAMS[1].range * variationScale).toFixed(0)}°` },
      { color: '#fbbf24', label: `Speed ±${(VARIATION_PARAMS[2].range * variationScale).toFixed(0)} m/s` },
      { color: '#c084fc', label: `Spin ±${(VARIATION_PARAMS[3].range * variationScale).toFixed(0)} RPM` },
    ];
    for (const item of legendItems) {
      ctx.fillStyle = item.color;
      ctx.fillRect(legendX, legendY - 6, 10, 10);
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(item.label, legendX + 14, legendY + 3);
      legendY += 16;
    }

  }, [allFlights, variationScale]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Why Throwing Straight Is So Hard</h2>
      <p className="text-gray-600 mb-4 text-sm">
        Even tiny variations in release angles, speed, or spin cause the disc to curve dramatically.
        The green line shows a "perfect" throw. Each colored pair shows what happens when a single
        parameter is off by a small amount — everything else held constant.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">Error magnitude:</label>
        <input type="range" min="0.2" max="2.0" step="0.1" value={variationScale}
          onChange={e => setVariationScale(Number(e.target.value))}
          className="w-48" />
        <span className="text-sm text-gray-500">{(variationScale * 100).toFixed(0)}%</span>
      </div>

      <canvas ref={canvasRef} className="rounded-lg border border-gray-700 w-full max-w-[580px]" />

      <div className="mt-4 text-sm text-gray-500 space-y-1">
        <p>A typical amateur's release varies by ±3-5° in hyzer and nose angle, ±2-3 m/s in speed,
          and ±100-200 RPM in spin. Pros reduce these to ±1-2° and ±1 m/s — and still rarely throw
          perfectly straight.</p>
      </div>
    </div>
  );
}
