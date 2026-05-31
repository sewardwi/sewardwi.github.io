// Shared rocketry simulation core
// ─────────────────────────────────────────────────────────────────────────────
// The base that every /rocketry simulation builds on. A page supplies its own
// physics + a draw(ctx, env) callback; RocketrySim owns the wall-clock playback
// (1× = real time), the player chrome (controls, status, timeline, legend), and
// the mission clock. Shared math/format helpers and canvas primitives live here
// too so individual pages stay thin.
//
// Load order (each page's index.html):
//   <script type="text/babel" src="/rocketry/constants.js"></script>
//   <script type="text/babel" src="/rocketry/sim-core.js"></script>
//   <script type="text/babel" src="simulation.js"></script>
//
// Depends on React (global) and the constants from /rocketry/constants.js.

// ── Math / format helpers ─────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, f) { return a + (b - a) * f; }

// Newton solver for the eccentric anomaly E given mean anomaly M and ecc e.
function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

// Position on a Keplerian orbit T seconds after periapsis. `angle` rotates the
// orbit's periapsis direction in the plane. Returns {x, y, r, nu}.
function keplerXY(a, e, n, T, angle = 0) {
  const E  = solveKepler(n * T, e);
  const r  = a * (1 - e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2),
                            Math.sqrt(1 - e) * Math.cos(E / 2));
  const ang = nu + angle;
  return { x: r * Math.cos(ang), y: r * Math.sin(ang), r, nu };
}

// Moon position on its circular orbit. `startAngle` lets a page phase-lock the
// Moon so a flyby/insertion lands at the right geometry.
function moonOrbitXY(t, startAngle = 0) {
  const a = startAngle + (2 * Math.PI * t) / MOON_PERIOD;
  return { x: MOON_SMA * Math.cos(a), y: MOON_SMA * Math.sin(a), angle: a };
}

function fmtMissionTime(sec) {
  const s = Math.floor(sec);
  if (s < 60)    return `T+${s}s`;
  if (s < 3600)  return `T+${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `T+${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `T+${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function hexToRgb(h) {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

// ── Canvas primitives ─────────────────────────────────────────────────────────
// World→screen projector for a top-down view of half-width `viewR` km centered
// on (cx, cy) km. Returns { scale, sc(kx,ky) -> {sx,sy} }.
function makeProjector(W, H, viewR, cx = 0, cy = 0) {
  const scale = (Math.min(W, H) / 2) / viewR;
  const ox = W / 2, oy = H / 2;
  return { scale, sc: (kx, ky) => ({ sx: ox + (kx - cx) * scale, sy: oy - (ky - cy) * scale }) };
}

function drawStarfield(ctx, W, H, count = 320) {
  for (let i = 0; i < count; i++) {
    const sx = ((Math.sin(i * 7.31 + 0.4) + 1) / 2) * W;
    const sy = ((Math.cos(i * 13.71 + 1.1) + 1) / 2) * H;
    const br = 0.2 + 0.8 * ((i * 37 % 100) / 100);
    ctx.fillStyle = `rgba(255,255,255,${br.toFixed(2)})`;
    const sz = i % 11 === 0 ? 2 : 1;
    ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
  }
}

// Earth body + atmosphere glow at screen point s={sx,sy}. Returns drawn radius.
function drawEarth(ctx, s, scale) {
  const er = Math.max(7, R_EARTH * scale);
  const eg = ctx.createRadialGradient(s.sx - er * 0.2, s.sy - er * 0.25, 0, s.sx, s.sy, er);
  eg.addColorStop(0, '#5baae8'); eg.addColorStop(0.35, '#2c74c9');
  eg.addColorStop(0.7, '#17448a'); eg.addColorStop(1, '#091e3e');
  ctx.beginPath(); ctx.arc(s.sx, s.sy, er, 0, Math.PI * 2); ctx.fillStyle = eg; ctx.fill();
  const atm = ctx.createRadialGradient(s.sx, s.sy, er * 0.97, s.sx, s.sy, er * 1.15);
  atm.addColorStop(0, 'rgba(80,180,255,0.2)'); atm.addColorStop(1, 'rgba(80,180,255,0)');
  ctx.beginPath(); ctx.arc(s.sx, s.sy, er * 1.15, 0, Math.PI * 2); ctx.fillStyle = atm; ctx.fill();
  return er;
}

// Moon body at screen point s={sx,sy}. Returns drawn radius.
function drawMoon(ctx, s, scale, { minR = 4, label = 'Moon' } = {}) {
  const mr = Math.max(minR, R_MOON * scale);
  const mg = ctx.createRadialGradient(s.sx - mr * 0.2, s.sy - mr * 0.2, 0, s.sx, s.sy, mr);
  mg.addColorStop(0, '#e2ded4'); mg.addColorStop(0.55, '#a09890'); mg.addColorStop(1, '#383838');
  ctx.beginPath(); ctx.arc(s.sx, s.sy, mr, 0, Math.PI * 2); ctx.fillStyle = mg; ctx.fill();
  if (label) {
    ctx.fillStyle = 'rgba(210,205,195,0.78)'; ctx.font = '11px monospace';
    ctx.fillText(label, s.sx + mr + 4, s.sy + 4);
  }
  return mr;
}

// Glowing vehicle marker.
function drawVehicleDot(ctx, sx, sy, { glow = 18, r = 5, color = '#ffffff' } = {}) {
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glow);
  g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(sx, sy, glow, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

// ── Shared UI styles + presentational components ──────────────────────────────
const panelBox  = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px' };
const eyebrow   = { fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' };

// Card section used by the technical write-ups under a simulation.
function Section({ title, children }) {
  return (
    <section style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '24px', marginTop: '16px',
    }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#f3f4f6', marginBottom: '14px' }}>{title}</h2>
      {children}
    </section>
  );
}

function SpecTable({ rows }) {
  return (
    <table style={{ width: '100%', fontSize: '13px', color: '#d1d5db', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding: '8px 12px 8px 0', color: '#9ca3af', verticalAlign: 'top', width: '40%' }}>{k}</td>
            <td style={{ padding: '8px 0', color: '#e5e7eb' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Standard trail-colour legend body (for the legend panel). `items` = [[color,label],…].
function TrailLegend({ title = 'Trail Colors', items }) {
  return (
    <React.Fragment>
      <div style={eyebrow}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '18px', height: '3px', borderRadius: '2px', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '10px', color: '#9ca3af' }}>{label}</span>
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

// ── Base simulation shell ─────────────────────────────────────────────────────
// Props:
//   phases   [{id,label,t,desc}]            mission timeline (required)
//   tEnd     number                         mission length, seconds (required)
//   draw     (ctx, {W,H,t,view}) => void    page's canvas renderer (required)
//   views    [{id,label}]                   view toggle (optional)
//   defaultView, defaultSpeed               initial selections
//   speeds   [number]                       sim-seconds per real second (1 = real time)
//   speedLabel (s)=>string, speedNote       speed button label / caption
//   legend   [[color,label]] | (view)=>node legend panel content (optional)
//   ready    bool                           false ⇒ "Computing…" overlay + Play disabled
//   width,height,canvasBg
function RocketrySim({
  phases, tEnd, draw,
  views = null, defaultView,
  speeds = [1, 10, 100, 1000], defaultSpeed,
  speedLabel = (s) => (s >= 1000 ? `${s / 1000}k×` : `${s}×`), speedNote,
  legend = null,
  ready = true, width = 900, height = 520, canvasBg = '#05050f',
}) {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);
  const [simTime, setSimTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed,   setSpeed]   = React.useState(defaultSpeed != null ? defaultSpeed : speeds[0]);
  const [view,    setView]    = React.useState(defaultView != null ? defaultView : (views ? views[0].id : 'default'));

  const tNow = clamp(simTime, 0, tEnd);
  let phase = phases[0];
  for (const p of phases) if (tNow >= p.t) phase = p;

  // Wall-clock playback: advance simTime by (real seconds × speed).
  React.useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);  // clamp tab-stall jumps
      last = now;
      setSimTime(prev => {
        const next = prev + dt * speed;
        if (next >= tEnd) { setPlaying(false); return tEnd; }
        return next;
      });
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed, tEnd]);

  // Hand the canvas to the page's renderer every frame.
  React.useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    draw(cv.getContext('2d'), { W: cv.width, H: cv.height, t: tNow, view });
  }, [simTime, view, draw, ready, tEnd]);

  const pill = (active, onClick, label, activeBg, activeColor) => (
    <button onClick={onClick} style={{
      padding: '6px 13px', borderRadius: '7px', border: 'none', cursor: 'pointer',
      fontSize: '12px', fontFamily: 'monospace',
      background: active ? activeBg : '#1f2937', color: active ? activeColor : '#6b7280',
    }}>{label}</button>
  );

  const legendBody = typeof legend === 'function' ? legend(view)
                   : Array.isArray(legend) ? <TrailLegend items={legend} />
                   : legend;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Canvas */}
      <div style={{ position: 'relative' }}>
        <canvas ref={canvasRef} width={width} height={height}
          style={{ width: '100%', borderRadius: '12px', background: canvasBg, display: 'block' }} />
        {!ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#6b7280', fontSize: '13px' }}>Computing trajectory…</div>
        )}
      </div>

      {/* Controls */}
      <div style={{ ...panelBox, padding: '14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => setPlaying(p => !p)} disabled={!ready} style={{
          padding: '8px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: playing ? '#374151' : '#2563eb', color: '#fff', fontWeight: '600', fontSize: '14px',
        }}>{playing ? '⏸ Pause' : '▶ Play'}</button>

        <button onClick={() => { setSimTime(0); setPlaying(false); }} style={{
          padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: '#1f2937', color: '#9ca3af', fontSize: '13px',
        }}>↺ Reset</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#9ca3af', fontSize: '12px' }}>
          <span>Speed:</span>
          {speeds.map(s => (
            <React.Fragment key={s}>{pill(speed === s, () => setSpeed(s), speedLabel(s), '#1d4ed8', '#ffffff')}</React.Fragment>
          ))}
          {speedNote && <span style={{ fontSize: '10px', color: '#5b616b' }}>{speedNote}</span>}
        </div>

        {views && views.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#9ca3af', fontSize: '12px' }}>
            <span>View:</span>
            {views.map(v => (
              <React.Fragment key={v.id}>{pill(view === v.id, () => setView(v.id), v.label, '#065f46', '#6ee7b7')}</React.Fragment>
            ))}
          </div>
        )}

        <input type="range" min={0} max={tEnd} step={1} value={tNow}
          onChange={e => { setSimTime(Number(e.target.value)); setPlaying(false); }}
          style={{ flex: 1, minWidth: '80px', accentColor: '#2563eb' }} />
      </div>

      {/* Status */}
      <div style={{ ...panelBox, padding: '16px', display: 'grid', gridTemplateColumns: '160px 1fr 2fr', gap: '20px' }}>
        <div>
          <div style={eyebrow}>Mission Time</div>
          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '700', color: '#60a5fa' }}>{fmtMissionTime(tNow)}</div>
        </div>
        <div>
          <div style={eyebrow}>Phase</div>
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#f3f4f6' }}>{phase.label}</div>
        </div>
        <div>
          <div style={eyebrow}>Status</div>
          <div style={{ fontSize: '12px', color: '#9ca3af', lineHeight: '1.55' }}>{phase.desc}</div>
        </div>
      </div>

      {/* Timeline + Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: legendBody ? '1fr 210px' : '1fr', gap: '12px' }}>
        <div style={{ ...panelBox, padding: '14px' }}>
          <div style={eyebrow}>Mission Timeline — click to jump</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', maxHeight: '420px', overflowY: 'auto' }}>
            {phases.map(ph => {
              const past   = tNow >= ph.t;
              const active = ph.id === phase.id;
              return (
                <button key={ph.id} onClick={() => { setSimTime(ph.t); setPlaying(false); }} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '5px 7px', borderRadius: '6px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: active ? 'rgba(37,99,235,0.18)' : 'transparent',
                  outline: active ? '1px solid rgba(37,99,235,0.4)' : 'none',
                }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                    background: active ? '#60a5fa' : past ? '#34d399' : '#374151' }} />
                  <span style={{ flex: 1, fontSize: '11px', color: active ? '#93c5fd' : past ? '#6ee7b7' : '#6b7280' }}>{ph.label}</span>
                  <span style={{ fontSize: '9px', color: '#4b5563', fontFamily: 'monospace' }}>{fmtMissionTime(ph.t)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {legendBody && <div style={{ ...panelBox, padding: '14px' }}>{legendBody}</div>}
      </div>
    </div>
  );
}
