// Artemis II Simulation
// Units: km, seconds. Origin = Earth center.
//
// The Artemis II free-return trajectory is approximated as a single Keplerian
// ellipse: periapsis at LEO (~6541 km), apoapsis at the Moon's orbit (~384400 km).
// The vehicle departs at TLI, reaches apoapsis at T+5 days (lunar flyby), and
// returns to Earth periapsis at T+10 days (splashdown) — no propulsion needed.
// Moon phase is pre-computed so the Moon is at the apoapsis point at flyby.

// ── Constants ─────────────────────────────────────────────────────────────────
const G        = 6.674e-20;
const M_EARTH  = 5.972e24;
const M_MOON   = 7.342e22;
const R_EARTH  = 6371;       // km
const R_MOON   = 1737;       // km
const MU_EARTH = G * M_EARTH; // ≈ 398600.4 km³/s²
const MOON_SMA    = 384400;   // km (Moon's semi-major axis)
const MOON_PERIOD = 27.321 * 86400; // s

// ── Transfer ellipse parameters ───────────────────────────────────────────────
// R_APO is set PAST the Moon's orbit so the trajectory crosses Moon's orbit
// before apoapsis — matching the real Artemis II free-return geometry.
const R_PARK  = R_EARTH + 170;               // 170 km circular parking orbit
const V_PARK  = Math.sqrt(MU_EARTH / R_PARK); // ≈ 7.806 km/s
const OMEGA_PARK = V_PARK / R_PARK;           // rad/s ≈ 1.194e-3
const R_APO   = 402000;                      // km (past Moon orbit by 17,600 km)
const A_TRANS = (R_PARK + R_APO) / 2;
const ECC     = (A_TRANS - R_PARK) / A_TRANS;
const N_TRANS = Math.sqrt(MU_EARTH / Math.pow(A_TRANS, 3));
const HALF_P  = Math.PI / N_TRANS;           // ≈ 459,464 s ≈ 5.32 days
const FULL_P  = 2 * HALF_P;                  // ≈ 918,928 s ≈ 10.63 days
const V_TLI   = Math.sqrt(MU_EARTH * (2 / R_PARK - 1 / A_TRANS));

// ── Mission timing ────────────────────────────────────────────────────────────
const T_PARKING  = 900;
const T_TLI      = 6300;
const T_ICPS_SEP = T_TLI + 1160;  // end of TLI burn (~19 min)
const T_SPLASH   = Math.round(T_TLI + FULL_P);
const T_SRB      = 126;
const T_CORE     = 488;

// Ascent arc ends at this angle (ENE direction)
const ASCENT_END = Math.PI / 2 - 0.15 * Math.PI; // ≈ 1.1 rad

// Parking orbit angle when TLI fires
const THETA_TLI = ASCENT_END - OMEGA_PARK * (T_TLI - T_PARKING);

// Find the true anomaly where the trajectory crosses Moon's orbital circle (r = MOON_SMA)
// on the outbound leg. At this point the vehicle is closest to the Moon in the 2D picture.
const P_ELLIPSE  = A_TRANS * (1 - ECC * ECC);
const COS_NU_X   = (P_ELLIPSE / MOON_SMA - 1) / ECC; // ≈ -0.9985
const NU_CROSS   = Math.acos(Math.max(-1, Math.min(1, COS_NU_X))); // just before apoapsis

// Time from TLI to outbound Moon-orbit crossing
const HALF_E_CROSS = Math.atan(Math.sqrt((1 - ECC) / (1 + ECC)) * Math.tan(NU_CROSS / 2));
const E_CROSS      = 2 * HALF_E_CROSS;
const M_CROSS      = E_CROSS - ECC * Math.sin(E_CROSS);
const DT_TO_CROSS  = M_CROSS / N_TRANS;
const T_FLYBY      = Math.round(T_TLI + DT_TO_CROSS); // ≈ T+3.5 days

// Inertial angle of the vehicle at the crossing
const THETA_CROSS = THETA_TLI + NU_CROSS;

// Moon starting angle: Moon is at THETA_CROSS + FLYBY_OFFSET at T_FLYBY
// giving ~8900 km altitude flyby (10637 km from Moon center)
const FLYBY_ALT_KM = 10637;
const FLYBY_OFFSET = Math.asin(Math.min(FLYBY_ALT_KM / MOON_SMA, 1)); // ≈ 0.0277 rad
const MOON_START   = (THETA_CROSS + FLYBY_OFFSET) - (2 * Math.PI * T_FLYBY / MOON_PERIOD);

const moonPos = (t) => {
  const a = MOON_START + (2 * Math.PI * t) / MOON_PERIOD;
  return { x: MOON_SMA * Math.cos(a), y: MOON_SMA * Math.sin(a) };
};

// ── Kepler eccentric anomaly solver ───────────────────────────────────────────
function solveKepler(M, ecc) {
  let E = M;
  for (let i = 0; i < 12; i++) E -= (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
  return E;
}

// Position on transfer ellipse, T_TRANS seconds after TLI periapsis pass
function ellipseXY(T_TRANS) {
  const M  = N_TRANS * T_TRANS;
  const E  = solveKepler(M, ECC);
  const r  = A_TRANS * (1 - ECC * Math.cos(E));
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + ECC) * Math.sin(E / 2),
    Math.sqrt(1 - ECC) * Math.cos(E / 2)
  );
  const ang = nu + THETA_TLI;
  return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
}

// ── Mission timeline ──────────────────────────────────────────────────────────
const PHASES = [
  { id: 'liftoff',       label: 'Liftoff',               t: 0,
    desc: 'SLS ignites — 4× RS-25 engines + 2 Solid Rocket Boosters generate 8.8 million lbf of thrust.' },
  { id: 'max_q',         label: 'Max-Q',                  t: 65,
    desc: 'Maximum aerodynamic pressure at ~14 km altitude. Vehicle throttles down briefly to reduce structural load.' },
  { id: 'srb_sep',       label: 'SRB Separation',         t: T_SRB,
    desc: 'SRBs burn out and jettison at ~45 km altitude. Core stage RS-25 engines continue.' },
  { id: 'las_jettison',  label: 'LAS Jettison',           t: 184,
    desc: 'Launch Abort System tower jettisoned. Orion capsule is now exposed to space.' },
  { id: 'core_sep',      label: 'Core Stage Sep',         t: T_CORE,
    desc: 'Core Stage (RS-25) shuts down and separates. ICPS (Boeing RL-10) takes over.' },
  { id: 'parking_orbit', label: 'Parking Orbit',          t: T_PARKING,
    desc: 'ICPS inserts stack into a 170 × 170 km circular parking orbit at 28.5° inclination.' },
  { id: 'tli',           label: 'Trans-Lunar Injection',  t: T_TLI,
    desc: 'ICPS fires for ~19 min, boosting Orion to ~10.95 km/s on a free-return trajectory. ΔV ≈ 3.14 km/s.' },
  { id: 'icps_sep',      label: 'ICPS Separation',        t: T_ICPS_SEP,
    desc: 'ICPS separates and vents residual propellant. Orion ESM takes over for mid-course corrections.' },
  { id: 'lunar_flyby',   label: 'Lunar Flyby',            t: T_FLYBY,
    desc: 'Orion swings within ~8,900 km of the lunar surface — closest humans to the Moon since Apollo 17 in 1972.' },
  { id: 'return',        label: 'Return Arc',             t: T_FLYBY + 14400,
    desc: 'Free-return arc carries Orion back to Earth. The same Keplerian orbit that went out brings the crew home.' },
  { id: 'splashdown',    label: 'Splashdown',             t: T_SPLASH,
    desc: 'Orion re-enters the atmosphere at ~11 km/s. Parachutes deploy at 7.6 km and the capsule splashes down in the Pacific.' },
];

// ── Trajectory generator ──────────────────────────────────────────────────────
function generateTrajectory() {
  const DT    = 60;
  const TOTAL = T_SPLASH + 1800;
  const pts   = [];

  for (let t = 0; t <= TOTAL; t += DT) {
    const moon = moonPos(t);
    let x, y, phase;

    if (t <= T_PARKING) {
      // Parametric gravity-turn ascent
      const frac = Math.min(t / T_PARKING, 1);
      const alt  = R_EARTH + frac * frac * 170;
      const ang  = ASCENT_END + (1 - frac) * (Math.PI / 2 - ASCENT_END);
      x = alt * Math.cos(ang);
      y = alt * Math.sin(ang);
      phase = t < T_SRB ? 'srb' : t < T_CORE ? 'core' : 'icps_coast';

    } else if (t < T_TLI) {
      // Circular parking orbit (analytical Keplerian)
      const theta = ASCENT_END - OMEGA_PARK * (t - T_PARKING);
      x = R_PARK * Math.cos(theta);
      y = R_PARK * Math.sin(theta);
      phase = 'parking_orbit';

    } else if (t <= T_SPLASH) {
      // Keplerian transfer ellipse (outbound + return = one full period)
      const T_TRANS = t - T_TLI;
      const ep = ellipseXY(T_TRANS);
      x = ep.x; y = ep.y;
      if (t < T_ICPS_SEP)             phase = 'tli_burn';
      else if (t < T_FLYBY - 7200)    phase = 'cislunar';
      else if (t < T_FLYBY + 7200)    phase = 'flyby_zone';
      else                             phase = 'return_arc';

    } else {
      // Past splashdown — freeze at Earth surface entry point
      const ep = ellipseXY(T_SPLASH - T_TLI);
      x = ep.x; y = ep.y;
      phase = 'splashdown';
    }

    pts.push({ t, x, y, phase, moon });
  }

  return pts;
}

// ── React component ───────────────────────────────────────────────────────────
function ArtemisSimulation() {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);

  const [trajectory,    setTrajectory]   = React.useState(null);
  const [frameIdx,      setFrameIdx]     = React.useState(0);
  const [playing,       setPlaying]      = React.useState(false);
  const [speed,         setSpeed]        = React.useState(4);
  const [viewMode,      setViewMode]     = React.useState('ascent');
  const [currentPhase,  setCurrentPhase] = React.useState(PHASES[0]);
  const [closestMoon,   setClosestMoon]  = React.useState(null);

  React.useEffect(() => {
    const id = setTimeout(() => {
      const traj = generateTrajectory();
      setTrajectory(traj);
      let best = Infinity, bestT = 0;
      for (const p of traj) {
        const dx = p.x - p.moon.x, dy = p.y - p.moon.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) { best = d; bestT = p.t; }
      }
      setClosestMoon({ distFromCenter: Math.round(best), alt: Math.round(best - R_MOON), t: bestT });
    }, 30);
    return () => clearTimeout(id);
  }, []);

  React.useEffect(() => {
    if (!playing || !trajectory) return;
    const step = () => {
      setFrameIdx(idx => {
        const next = Math.min(idx + speed, trajectory.length - 1);
        if (next >= trajectory.length - 1) setPlaying(false);
        return next;
      });
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, trajectory, speed]);

  React.useEffect(() => {
    if (!trajectory || frameIdx >= trajectory.length) return;
    const t = trajectory[frameIdx].t;
    let ph = PHASES[0];
    for (const p of PHASES) { if (t >= p.t) ph = p; }
    setCurrentPhase(ph);
  }, [frameIdx, trajectory]);

  // ── Canvas draw ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!trajectory || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const VIEW_R = viewMode === 'ascent' ? 20000 : 460000;
    const scale  = (Math.min(W, H) / 2) / VIEW_R;
    const ox = W / 2, oy = H / 2;
    const sc = (kx, ky) => ({ sx: ox + kx * scale, sy: oy - ky * scale });

    // Background
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, W, H);

    // Stars (deterministic)
    for (let i = 0; i < 320; i++) {
      const sx = ((Math.sin(i * 7.31 + 0.4) + 1) / 2) * W;
      const sy = ((Math.cos(i * 13.71 + 1.1) + 1) / 2) * H;
      const br = 0.2 + 0.8 * ((i * 37 % 100) / 100);
      ctx.fillStyle = `rgba(255,255,255,${br.toFixed(2)})`;
      const sz = i % 9 === 0 ? 2 : 1;
      ctx.fillRect(sx - sz/2, sy - sz/2, sz, sz);
    }

    const pt = trajectory[Math.min(frameIdx, trajectory.length - 1)];

    // Earth
    const es = sc(0, 0);
    const er = Math.max(7, R_EARTH * scale);
    const eg = ctx.createRadialGradient(es.sx - er * 0.2, es.sy - er * 0.25, 0, es.sx, es.sy, er);
    eg.addColorStop(0, '#5baae8');
    eg.addColorStop(0.35, '#2c74c9');
    eg.addColorStop(0.7, '#17448a');
    eg.addColorStop(1,   '#091e3e');
    ctx.beginPath(); ctx.arc(es.sx, es.sy, er, 0, Math.PI * 2);
    ctx.fillStyle = eg; ctx.fill();
    // Atmosphere glow
    const atm = ctx.createRadialGradient(es.sx, es.sy, er * 0.97, es.sx, es.sy, er * 1.15);
    atm.addColorStop(0, 'rgba(80,180,255,0.2)');
    atm.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.beginPath(); ctx.arc(es.sx, es.sy, er * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = atm; ctx.fill();

    if (viewMode !== 'ascent') {
      // Moon orbit ring
      ctx.save();
      ctx.setLineDash([5, 14]);
      ctx.beginPath(); ctx.arc(es.sx, es.sy, MOON_SMA * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();

      // Moon body
      const ms = sc(pt.moon.x, pt.moon.y);
      const mr = Math.max(5, R_MOON * scale);
      const mg = ctx.createRadialGradient(ms.sx - mr * 0.2, ms.sy - mr * 0.2, 0, ms.sx, ms.sy, mr);
      mg.addColorStop(0, '#e2ded4'); mg.addColorStop(0.55, '#a09890'); mg.addColorStop(1, '#383838');
      ctx.beginPath(); ctx.arc(ms.sx, ms.sy, mr, 0, Math.PI * 2);
      ctx.fillStyle = mg; ctx.fill();
      ctx.fillStyle = 'rgba(210,205,195,0.8)';
      ctx.font = '11px monospace';
      ctx.fillText('Moon', ms.sx + mr + 4, ms.sy + 4);
    }

    // Full ellipse ghost (faint)
    if (viewMode !== 'ascent') {
      ctx.save();
      ctx.setLineDash([3, 10]);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const T_TRANS = (i / 360) * FULL_P;
        const ep = ellipseXY(T_TRANS);
        const s = sc(ep.x, ep.y);
        if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }

    // Trail
    const PHASE_COLOR = {
      srb:          '#ff9428',
      core:         '#ffd040',
      icps_coast:   '#70b8ff',
      parking_orbit:'#38aaff',
      tli_burn:     '#d848ff',
      cislunar:     '#44ff7a',
      flyby_zone:   '#ffdd44',
      return_arc:   '#ff5555',
      splashdown:   '#ffffff',
    };
    const hexToRgb = (hex) => ({
      r: parseInt(hex.slice(1,3),16),
      g: parseInt(hex.slice(3,5),16),
      b: parseInt(hex.slice(5,7),16),
    });
    const TRAIL = Math.min(frameIdx, 1200);
    for (let i = Math.max(0, frameIdx - TRAIL); i < frameIdx; i++) {
      const p0 = trajectory[i], p1 = trajectory[i + 1];
      if (!p0 || !p1) continue;
      const s0 = sc(p0.x, p0.y), s1 = sc(p1.x, p1.y);
      if (s0.sx < -W || s0.sx > 2*W || s0.sy < -H || s0.sy > 2*H) continue;
      const alpha = 0.08 + 0.92 * ((i - (frameIdx - TRAIL)) / TRAIL);
      const col = PHASE_COLOR[p0.phase] || '#aaaaaa';
      const {r,g,b} = hexToRgb(col);
      ctx.beginPath();
      ctx.moveTo(s0.sx, s0.sy); ctx.lineTo(s1.sx, s1.sy);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Stage separation markers
    const SEP_MARKS = [
      { id: 'srb_sep',  color: '#ff5020', label: 'SRBs', t: T_SRB },
      { id: 'core_sep', color: '#ffbb20', label: 'Core', t: T_CORE },
      { id: 'icps_sep', color: '#bb44ff', label: 'ICPS', t: T_ICPS_SEP },
    ];
    for (const mk of SEP_MARKS) {
      if (pt.t < mk.t) continue;
      const sp = trajectory.find(p => p.t >= mk.t);
      if (!sp) continue;
      const ss = sc(sp.x, sp.y);
      if (ss.sx < -12 || ss.sx > W+12 || ss.sy < -12 || ss.sy > H+12) continue;
      ctx.beginPath(); ctx.arc(ss.sx, ss.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = mk.color; ctx.fill();
      ctx.fillStyle = mk.color; ctx.font = '10px monospace';
      ctx.fillText(mk.label, ss.sx + 7, ss.sy - 3);
    }

    // Orion dot
    const vs = sc(pt.x, pt.y);
    if (vs.sx > -30 && vs.sx < W+30 && vs.sy > -30 && vs.sy < H+30) {
      const glow = ctx.createRadialGradient(vs.sx, vs.sy, 0, vs.sx, vs.sy, 20);
      glow.addColorStop(0, 'rgba(255,255,255,0.35)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(vs.sx, vs.sy, 20, 0, Math.PI * 2);
      ctx.fillStyle = glow; ctx.fill();
      ctx.beginPath(); ctx.arc(vs.sx, vs.sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();

      const dist = Math.sqrt(pt.x*pt.x + pt.y*pt.y);
      const alt  = dist - R_EARTH;
      const lbl  = alt < 20 ? 'Splashdown' : alt < 2000 ? `Alt ${Math.round(alt)} km` : `${Math.round(dist).toLocaleString()} km from Earth`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '11px monospace';
      ctx.fillText(lbl, vs.sx + 11, vs.sy - 8);

      // Distance to Moon label (when in cislunar view)
      if (viewMode !== 'ascent') {
        const dx = pt.x - pt.moon.x, dy = pt.y - pt.moon.y;
        const dMoon = Math.round(Math.sqrt(dx*dx+dy*dy));
        ctx.fillStyle = 'rgba(200,200,255,0.7)'; ctx.font = '10px monospace';
        ctx.fillText(`${dMoon.toLocaleString()} km to Moon`, vs.sx + 11, vs.sy + 6);
      }
    }

    // Event flashes
    for (const mk of SEP_MARKS) {
      const dt = Math.abs(pt.t - mk.t);
      if (dt < 240) {
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = `rgba(255,255,255,${(1 - dt/240).toFixed(2)})`;
        ctx.fillText(`✦ ${mk.label} SEPARATION`, ox - 88, 44);
      }
    }
    const flybyDt = Math.abs(pt.t - T_FLYBY);
    if (flybyDt < 10800 && viewMode !== 'ascent') {
      const alpha = (1 - flybyDt / 10800).toFixed(2);
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = `rgba(255,230,100,${alpha})`;
      if (closestMoon) {
        ctx.fillText(`✦ LUNAR FLYBY — ${closestMoon.alt.toLocaleString()} km above surface`, ox - 155, 44);
      }
    }

    // Corner info
    ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(100,100,130,0.6)';
    ctx.fillText(viewMode === 'ascent' ? '±20,000 km' : '±460,000 km', 10, H - 10);
    if (closestMoon && viewMode !== 'ascent') {
      ctx.fillText(`Closest lunar approach: ${closestMoon.alt.toLocaleString()} km alt`, 10, H - 24);
    }

  }, [frameIdx, trajectory, viewMode, closestMoon]);

  const fmt = (s) => {
    if (s < 60)    return `T+${s}s`;
    if (s < 3600)  return `T+${Math.floor(s/60)}m ${s%60}s`;
    if (s < 86400) return `T+${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
    return `T+${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h`;
  };

  const tNow = trajectory ? trajectory[Math.min(frameIdx, trajectory.length-1)].t : 0;

  const box = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '12px',
  };

  const btn = (active, onClick, children, extra = {}) => (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: '7px', border: 'none', cursor: 'pointer',
      fontSize: '12px', fontFamily: 'monospace',
      background: active ? extra.activeBg || '#1d4ed8' : '#1f2937',
      color: active ? extra.activeColor || '#ffffff' : '#6b7280',
      ...extra.style,
    }}>{children}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Canvas */}
      <canvas ref={canvasRef} width={900} height={520}
        style={{ width: '100%', borderRadius: '12px', background: '#05050f', display: 'block' }} />
      {!trajectory && <div style={{ textAlign:'center', color:'#6b7280', padding:'12px' }}>Computing trajectory…</div>}

      {/* Controls */}
      <div style={{ ...box, padding: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => setPlaying(p => !p)} disabled={!trajectory} style={{
          padding: '8px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: playing ? '#374151' : '#2563eb', color: '#fff', fontWeight: '600', fontSize: '14px',
        }}>{playing ? '⏸ Pause' : '▶ Play'}</button>

        <button onClick={() => { setFrameIdx(0); setPlaying(false); }} style={{
          padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: '#1f2937', color: '#9ca3af', fontSize: '13px',
        }}>↺ Reset</button>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', color:'#9ca3af', fontSize:'12px' }}>
          <span>Speed:</span>
          {[1, 4, 16, 64, 256].map(s => btn(speed === s, () => setSpeed(s), `${s}×`))}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', color:'#9ca3af', fontSize:'12px' }}>
          <span>View:</span>
          {btn(viewMode==='ascent', () => setViewMode('ascent'), 'Ascent', { activeBg:'#065f46', activeColor:'#6ee7b7' })}
          {btn(viewMode==='cislunar', () => setViewMode('cislunar'), 'Cislunar', { activeBg:'#065f46', activeColor:'#6ee7b7' })}
        </div>

        {trajectory && (
          <input type="range" min={0} max={trajectory.length-1} value={frameIdx}
            onChange={e => { setFrameIdx(Number(e.target.value)); setPlaying(false); }}
            style={{ flex: 1, minWidth: '80px', accentColor: '#2563eb' }} />
        )}
      </div>

      {/* Status */}
      <div style={{ ...box, padding:'16px', display:'grid', gridTemplateColumns:'160px 1fr 2fr', gap:'20px' }}>
        <div>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'4px' }}>Mission Time</div>
          <div style={{ fontSize:'20px', fontFamily:'monospace', fontWeight:'700', color:'#60a5fa' }}>{fmt(tNow)}</div>
        </div>
        <div>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'4px' }}>Phase</div>
          <div style={{ fontSize:'15px', fontWeight:'600', color:'#f3f4f6' }}>{currentPhase.label}</div>
        </div>
        <div>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'4px' }}>Status</div>
          <div style={{ fontSize:'12px', color:'#9ca3af', lineHeight:'1.55' }}>{currentPhase.desc}</div>
        </div>
      </div>

      {/* Timeline + Legend */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 190px', gap:'12px' }}>
        <div style={{ ...box, padding:'16px' }}>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>
            Mission Timeline — click to jump
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px' }}>
            {PHASES.map(ph => {
              const past   = tNow >= ph.t;
              const active = ph.id === currentPhase.id;
              return (
                <button key={ph.id} onClick={() => {
                  if (!trajectory) return;
                  const idx = trajectory.findIndex(p => p.t >= ph.t);
                  if (idx >= 0) { setFrameIdx(idx); setPlaying(false); }
                }} style={{
                  display:'flex', alignItems:'center', gap:'7px',
                  padding:'6px 8px', borderRadius:'6px', border:'none', textAlign:'left', cursor:'pointer',
                  background: active ? 'rgba(37,99,235,0.18)' : 'transparent',
                  outline: active ? '1px solid rgba(37,99,235,0.4)' : 'none',
                }}>
                  <span style={{
                    width:'7px', height:'7px', borderRadius:'50%', flexShrink:0, display:'block',
                    background: active ? '#60a5fa' : past ? '#34d399' : '#374151',
                  }} />
                  <span style={{ flex:1, fontSize:'12px', color: active ? '#93c5fd' : past ? '#6ee7b7' : '#6b7280' }}>
                    {ph.label}
                  </span>
                  <span style={{ fontSize:'9px', color:'#4b5563', fontFamily:'monospace' }}>{fmt(ph.t)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...box, padding:'16px' }}>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>
            Trail Colors
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {[
              ['#ff9428','SRB phase'],
              ['#ffd040','Core stage'],
              ['#38aaff','Parking orbit'],
              ['#d848ff','TLI burn'],
              ['#44ff7a','Cislunar coast'],
              ['#ffdd44','Lunar flyby zone'],
              ['#ff5555','Return arc'],
            ].map(([color, label]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'22px', height:'3px', borderRadius:'2px', background:color, flexShrink:0 }} />
                <span style={{ fontSize:'11px', color:'#9ca3af' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
