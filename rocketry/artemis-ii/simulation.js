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
const T_END      = T_SPLASH + 1800;  // a little past splashdown
const T_SRB      = 126;
const T_CORE     = 488;
const T_INSERT   = 560;  // ICPS finishes orbital-insertion burn → parking orbit

// ── Ascent profile (altitude/velocity vs. time) ─────────────────────────────────
// Piecewise-linear keyframes approximating the SLS Block 1 powered ascent, used
// for the Rocket view's readouts during the early powered flight (0 → parking
// orbit). Past parking orbit the readouts come from the real Keplerian
// trajectory instead (see missionState), so the whole mission stays continuous.
const ASCENT_KEYS = [
  // t (s),       alt (km),  vel (km/s)
  [0,             0.0,       0.00],
  [65,            13.5,      0.55],  // Max-Q
  [T_SRB,         47,        1.85],  // SRB separation
  [184,           78,        2.55],  // LAS jettison
  [300,           128,       4.20],
  [T_CORE,        162,       7.62],  // Core stage sep / MECO
  [T_INSERT,      170,       7.79],  // ICPS insertion complete
  [T_PARKING,     170,       7.81],  // 170 km parking orbit
];

function ascentState(t) {
  const K = ASCENT_KEYS;
  if (t <= K[0][0]) return { alt: K[0][1], vel: K[0][2] };
  for (let i = 0; i < K.length - 1; i++) {
    if (t <= K[i + 1][0]) {
      const [t0, a0, v0] = K[i];
      const [t1, a1, v1] = K[i + 1];
      const f = (t - t0) / (t1 - t0);
      return { alt: a0 + f * (a1 - a0), vel: v0 + f * (v1 - v0) };
    }
  }
  const last = K[K.length - 1];
  return { alt: last[1], vel: last[2] };
}

// Altitude (km above Earth's surface) + speed (km/s) at any mission time.
// Powered ascent uses the realistic keyframes above; from parking orbit onward
// it reads the actual trajectory so the Rocket view spans the full mission —
// LEO → trans-lunar coast → ~400,000 km lunar flyby → return → splashdown.
function missionState(t) {
  if (t <= T_PARKING) return ascentState(t);
  let r, vel;
  if (t < T_TLI) {
    r = R_PARK; vel = V_PARK;                                  // circular parking orbit
  } else if (t <= T_SPLASH) {
    const ep = ellipseXY(t - T_TLI);                           // transfer ellipse (vis-viva)
    r = Math.hypot(ep.x, ep.y);
    vel = Math.sqrt(MU_EARTH * (2 / r - 1 / A_TRANS));
  } else {
    const ep = ellipseXY(T_SPLASH - T_TLI);
    r = Math.hypot(ep.x, ep.y); vel = 0;                       // splashed down
  }
  return { alt: r - R_EARTH, vel };
}

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
// Position + phase for a given mission time.
function posAt(t) {
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
    const ep = ellipseXY(t - T_TLI);
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
  return { x, y, phase };
}

function generateTrajectory() {
  const TOTAL = T_END;
  const pts   = [];
  const push  = (t) => {
    const p = posAt(t);
    pts.push({ t, x: p.x, y: p.y, phase: p.phase, moon: moonPos(t) });
  };

  // Fine sampling through powered ascent + insertion so the Launch view is
  // smooth and stage-separation events land precisely; coarse afterward.
  for (let t = 0; t <= 1000; t += 5)        push(t);
  for (let t = 1020; t <= TOTAL; t += 60)   push(t);

  return pts;
}

// ── Rocket view: SLS vehicle profile, stage separations, full mission ────────────
// A vehicle-centric, side-profile animation. The rocket holds near screen center;
// the altitude tape and ground scroll to convey climb, the stack tilts over in a
// gravity turn, and each spent stage tumbles away as it separates. The altitude
// axis is linear near the ground then logarithmic, so the same view follows the
// whole mission out to the ~384,400 km lunar flyby and back to splashdown.
//
// Local rocket coords: origin at the core-engine gimbal plane, +x right, -y "up"
// the stack. Dimensions are schematic (not to exact scale) but ordered correctly.
const SLS = {
  coreTop: -150, coreW: 26,          // orange core stage
  lvsaTop: -164,                     // launch vehicle stage adapter
  icpsTop: -200, icpsW: 18,          // ICPS (RL-10)
  osaTop:  -210,                     // Orion stage adapter
  smTop:   -232, smW: 20,            // service module
  cmTop:   -250,                     // crew module (cone apex)
  lasTop:  -288, lasNose: -306,      // launch abort system tower
  srbX: 22, srbW: 16, srbTop: -190,  // solid rocket boosters
};

function drawPlume(ctx, x, yTop, width, length, colors, clock, seed) {
  const flick = 0.78 + 0.22 * Math.sin(clock * 1.9 + seed) * Math.cos(clock * 0.7 + seed * 2);
  const L = length * (0.85 + 0.15 * flick);
  const g = ctx.createLinearGradient(0, yTop, 0, yTop + L);
  g.addColorStop(0,   colors[0]);
  g.addColorStop(0.45, colors[1]);
  g.addColorStop(1,   colors[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, yTop);
  ctx.lineTo(x + width / 2, yTop);
  ctx.lineTo(x + width * 0.12, yTop + L);
  ctx.lineTo(x - width * 0.12, yTop + L);
  ctx.closePath();
  ctx.fill();
}

function drawRocketView(ctx, W, H, t) {
  const { alt, vel } = missionState(t);
  const rocketX = W * 0.32;
  const rocketY = H * 0.60;
  const flick   = performance.now() / 1000;      // wall clock → plumes flicker at any sim speed

  // True-to-scale "camera". The SLS stack is ~98 m tall and is drawn ART_PX px in
  // local art units. We pick a km→px scale that dollies OUT as the vehicle climbs
  // and apply it to BOTH the altitude grid and the rocket art, so the altitude
  // lines are always physically consistent with the on-screen size of the rocket.
  const SLS_KM   = 0.098;                          // real SLS height
  const ART_PX   = 324;                            // rocket art height (local px)
  const A0_KM    = 100;                            // framing floor — small ⇒ zooms out fast. Large
                                                   // keeps the stack big through all separations.
  const viewKm   = (alt + A0_KM) * (0.34 / A0_KM); // visible vertical span; ~0.34 km on the pad
  const pxPerKm  = H / viewKm;
  const artScale = (SLS_KM * pxPerKm) / ART_PX;    // <1, shrinks with altitude
  const a2y      = (a) => rocketY - (a - alt) * pxPerKm;
  const groundY  = a2y(0);

  const fmtAlt = (a) =>
      a < 1    ? Math.round(a * 1000) + ' m'
    : a < 100  ? a.toFixed(1) + ' km'
    : a < 1000 ? Math.round(a) + ' km'
    : a < 1e6  ? (a / 1000).toFixed(a < 1e4 ? 1 : 0) + 'k km'
    :            (a / 1e6).toFixed(2) + 'M km';

  // ── Background: space → sky glow → ground ────────────────────────────────────
  ctx.fillStyle = '#04040d';
  ctx.fillRect(0, 0, W, H);

  // Stars (deterministic)
  for (let i = 0; i < 260; i++) {
    const sx = ((Math.sin(i * 7.31 + 0.4) + 1) / 2) * W;
    const sy = ((Math.cos(i * 13.71 + 1.1) + 1) / 2) * H;
    const br = 0.18 + 0.7 * ((i * 37 % 100) / 100);
    ctx.fillStyle = `rgba(255,255,255,${br.toFixed(2)})`;
    ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }

  // Sky glow + ground (the surface drops away fast under the true-scale zoom)
  if (groundY < H) {
    const skyTop = groundY - 240;
    if (skyTop < H) {
      const ag = ctx.createLinearGradient(0, Math.max(0, skyTop), 0, groundY);
      ag.addColorStop(0, 'rgba(46,120,210,0)');
      ag.addColorStop(1, 'rgba(96,172,236,0.34)');
      ctx.fillStyle = ag;
      ctx.fillRect(0, Math.max(0, skyTop), W, groundY - Math.max(0, skyTop));
    }
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#2f74b8');
    gg.addColorStop(1, '#0b2c54');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, groundY, W, 2);
    if (alt < 0.12) {                              // launch tower, only on the pad
      ctx.fillStyle = 'rgba(120,128,140,0.7)';
      ctx.fillRect(rocketX + 70, groundY - 150, 7, 150);
      ctx.fillRect(rocketX - 70, groundY - 8, 150, 8);
    }
  }

  // ── Altitude tape (right edge) — ticks scale with the camera ─────────────────
  const tapeX = W - 70;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tapeX, 0); ctx.lineTo(tapeX, H); ctx.stroke();
  ctx.font = '10px monospace';
  // "nice" step → ~7 divisions across the visible span
  const niceStep = (span) => {
    const raw = span / 7;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  };
  const step = niceStep(viewKm);
  const aTop = alt + rocketY / pxPerKm;            // altitude at y = 0
  const aBot = alt - (H - rocketY) / pxPerKm;       // altitude at y = H
  for (let a = Math.ceil(Math.max(0, aBot) / step) * step; a <= aTop; a += step) {
    const y = a2y(a);
    if (y < 10 || y > H - 4) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(tapeX, y); ctx.lineTo(tapeX + 6, y); ctx.stroke();
    ctx.fillStyle = 'rgba(170,180,200,0.65)';
    ctx.fillText(fmtAlt(a), tapeX + 10, y + 3);
  }

  // Reference markers (dashed; only the in-view ones show)
  const REF = [
    [13.5,   'Max-Q'],
    [47,     'SRB sep'],
    [100,    'Kármán line'],
    [162,    'MECO'],
    [35786,  'GEO'],
    [384400, 'Moon orbit'],
  ];
  for (const [a, lbl] of REF) {
    const y = a2y(a);
    if (y < 12 || y > H - 4) continue;
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(120,170,255,0.22)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(tapeX, y); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(150,180,235,0.5)';
    ctx.fillText(lbl, tapeX - 82, y - 3);
    if (lbl === 'Moon orbit') {                                // a little moon on its orbit line
      const mx = W * 0.6, mr = 9;
      const mg = ctx.createRadialGradient(mx - 3, y - 3, 0, mx, y, mr);
      mg.addColorStop(0, '#e2ded4'); mg.addColorStop(0.6, '#a09890'); mg.addColorStop(1, '#3a3a3a');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, y, mr, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Current-altitude pointer
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.moveTo(tapeX, rocketY); ctx.lineTo(tapeX + 9, rocketY - 5); ctx.lineTo(tapeX + 9, rocketY + 5);
  ctx.closePath(); ctx.fill();

  // ── Liftoff exhaust cloud ────────────────────────────────────────────────────
  if (alt < 8 && t < 18) {
    const grow = 1 + t * 0.5;
    for (let i = 0; i < 5; i++) {
      const cx = rocketX + (i - 2) * 26 * grow * 0.4;
      const r = 24 * grow + i * 4;
      const cg = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, r);
      cg.addColorStop(0, 'rgba(230,230,235,0.45)');
      cg.addColorStop(1, 'rgba(200,200,210,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, groundY, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Engine burn states ───────────────────────────────────────────────────────
  const srbBurn  = t < T_SRB;
  const coreBurn = t < T_CORE;
  const icpsBurn = (t >= T_CORE && t < T_INSERT) || (t >= T_TLI && t < T_ICPS_SEP);

  // ── Gravity-turn tilt (nose tips downrange / to the right) ───────────────────
  const tf   = Math.min(t / T_CORE, 1);
  const tilt = 1.15 * (1 - Math.cos(Math.PI * tf)) / 2;   // 0 → ~66°
  const detailed = artScale * ART_PX >= 6;   // detailed stack while big enough, else a tracked icon
  const S = SLS;

  // ── Piece geometry (local art coords; reused both attached and separated) ─────
  const artSRB = (bx, burning) => {
    if (burning) drawPlume(ctx, bx, 18, S.srbW, 150,
      ['rgba(255,244,190,0.95)', 'rgba(255,150,45,0.7)', 'rgba(255,70,20,0)'], flick, bx);
    ctx.fillStyle = '#222428';
    ctx.beginPath();
    ctx.moveTo(bx - S.srbW * 0.32, 6); ctx.lineTo(bx + S.srbW * 0.32, 6);
    ctx.lineTo(bx + S.srbW * 0.5, 18); ctx.lineTo(bx - S.srbW * 0.5, 18);
    ctx.closePath(); ctx.fill();
    const bg = ctx.createLinearGradient(bx - S.srbW / 2, 0, bx + S.srbW / 2, 0);
    bg.addColorStop(0, '#cfcfd6'); bg.addColorStop(0.5, '#f0f0f4'); bg.addColorStop(1, '#b6b6c0');
    ctx.fillStyle = bg;
    ctx.fillRect(bx - S.srbW / 2, S.srbTop + 16, S.srbW, 6 - (S.srbTop + 16));
    ctx.fillStyle = '#1c1c20';
    ctx.beginPath();
    ctx.moveTo(bx - S.srbW / 2, S.srbTop + 16); ctx.lineTo(bx + S.srbW / 2, S.srbTop + 16);
    ctx.lineTo(bx, S.srbTop); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,40,46,0.7)';
    ctx.fillRect(bx - S.srbW / 2, S.srbTop + 50, S.srbW, 4);
  };
  const artCore = (burning) => {
    if (burning) {
      drawPlume(ctx, 0, 14, 22, 70, ['rgba(190,215,255,0.85)', 'rgba(120,160,255,0.4)', 'rgba(120,160,255,0)'], flick, 0);
      drawPlume(ctx, 0, 14, 8, 96, ['rgba(255,255,255,0.9)', 'rgba(200,225,255,0.4)', 'rgba(200,225,255,0)'], flick, 3);
    }
    ctx.fillStyle = '#26272b';
    for (const ex of [-9, -3, 3, 9]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, 0); ctx.lineTo(ex + 2, 0); ctx.lineTo(ex + 4, 14); ctx.lineTo(ex - 4, 14);
      ctx.closePath(); ctx.fill();
    }
    const cg = ctx.createLinearGradient(-S.coreW / 2, 0, S.coreW / 2, 0);
    cg.addColorStop(0, '#a8511e'); cg.addColorStop(0.5, '#d97a32'); cg.addColorStop(1, '#94481b');
    ctx.fillStyle = cg;
    ctx.fillRect(-S.coreW / 2, S.coreTop, S.coreW, 0 - S.coreTop);
    ctx.fillStyle = 'rgba(120,60,24,0.6)';
    ctx.fillRect(-S.coreW / 2, -96, S.coreW, 6);
    ctx.fillStyle = '#7e3d18';
    ctx.beginPath();
    ctx.moveTo(-S.coreW / 2, 0); ctx.lineTo(S.coreW / 2, 0);
    ctx.lineTo(S.coreW / 2 - 3, 8); ctx.lineTo(-S.coreW / 2 + 3, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9aa0a6';
    ctx.beginPath();
    ctx.moveTo(-S.coreW / 2, S.coreTop); ctx.lineTo(S.coreW / 2, S.coreTop);
    ctx.lineTo(S.icpsW / 2, S.lvsaTop); ctx.lineTo(-S.icpsW / 2, S.lvsaTop);
    ctx.closePath(); ctx.fill();
  };
  const artICPS = (burning) => {
    if (burning) drawPlume(ctx, 0, S.lvsaTop + 2, 10, 60,
      ['rgba(200,222,255,0.85)', 'rgba(130,170,255,0.4)', 'rgba(130,170,255,0)'], flick, 7);
    const ig = ctx.createLinearGradient(-S.icpsW / 2, 0, S.icpsW / 2, 0);
    ig.addColorStop(0, '#8a9096'); ig.addColorStop(0.5, '#c8ccd2'); ig.addColorStop(1, '#7e848a');
    ctx.fillStyle = ig;
    ctx.fillRect(-S.icpsW / 2, S.icpsTop, S.icpsW, S.lvsaTop - S.icpsTop);
    ctx.fillStyle = '#8d9298';
    ctx.beginPath();
    ctx.moveTo(-S.icpsW / 2, S.icpsTop); ctx.lineTo(S.icpsW / 2, S.icpsTop);
    ctx.lineTo(S.smW / 2, S.osaTop); ctx.lineTo(-S.smW / 2, S.osaTop);
    ctx.closePath(); ctx.fill();
  };
  const artOrion = () => {
    const sg = ctx.createLinearGradient(-S.smW / 2, 0, S.smW / 2, 0);
    sg.addColorStop(0, '#2c3036'); sg.addColorStop(0.5, '#444a52'); sg.addColorStop(1, '#23272c');
    ctx.fillStyle = sg;
    ctx.fillRect(-S.smW / 2, S.smTop, S.smW, S.osaTop - S.smTop);
    ctx.fillStyle = 'rgba(150,160,170,0.5)';
    ctx.fillRect(-S.smW / 2, S.smTop + 6, S.smW, 2);
    const cmg = ctx.createLinearGradient(-S.smW / 2, 0, S.smW / 2, 0);
    cmg.addColorStop(0, '#b7bcc4'); cmg.addColorStop(0.5, '#e3e6ea'); cmg.addColorStop(1, '#a9aeb6');
    ctx.fillStyle = cmg;
    ctx.beginPath();
    ctx.moveTo(-S.smW / 2, S.smTop); ctx.lineTo(S.smW / 2, S.smTop); ctx.lineTo(0, S.cmTop);
    ctx.closePath(); ctx.fill();
  };
  const artLAS = () => {
    ctx.fillStyle = '#b3b8be';
    ctx.fillRect(-2.5, S.lasTop, 5, S.cmTop - S.lasTop);
    ctx.fillStyle = '#cf3b2a';
    ctx.fillRect(-4.5, S.lasNose + 8, 9, S.lasTop - (S.lasNose + 8));
    ctx.fillStyle = '#d6d9de';
    ctx.beginPath();
    ctx.moveTo(-4.5, S.lasNose + 8); ctx.lineTo(4.5, S.lasNose + 8); ctx.lineTo(0, S.lasNose);
    ctx.closePath(); ctx.fill();
  };

  // A spent stage drifting from the (camera-tracked) vehicle. Offsets are in SCREEN
  // px so the piece falls back toward Earth and leaves the frame at any zoom: fall>0
  // accelerates downward (gravity); fall<0 sends the LAS up and away.
  const drawSpent = (sepT, cx, cy, fall, side, spin, artFn) => {
    const e = t - sepT;
    if (e < 0) return;
    const alpha = Math.max(0, 1 - e / 90);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    // screen-space drift from the detach point (continuous at e=0, no jump)
    ctx.translate(rocketX + side * e * pxPerKm, rocketY + 0.5 * fall * e * e * pxPerKm);
    ctx.rotate(tilt);
    ctx.scale(artScale, artScale);
    ctx.translate(cx, cy); ctx.rotate(e * spin); ctx.translate(-cx, -cy);   // tumble about piece centre
    artFn();
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  if (!detailed) {
    // Zoomed far out (deep cislunar): the to-scale rocket is sub-pixel — draw a marker.
    ctx.save();
    ctx.translate(rocketX, rocketY);
    ctx.rotate(tilt);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    glow.addColorStop(0, 'rgba(180,210,255,0.5)'); glow.addColorStop(1, 'rgba(180,210,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
    if (srbBurn || coreBurn || icpsBurn) {
      drawPlume(ctx, 0, 4, 7, 18, ['rgba(255,240,190,0.9)', 'rgba(255,150,45,0.5)', 'rgba(255,80,20,0)'], flick, 0);
    }
    ctx.fillStyle = '#e7eaee';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(4.5, 4); ctx.lineTo(-4.5, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    // Spent stages falling away (drawn first so the live stack overlays them at sep).
    if (t >= T_SRB) {
      drawSpent(T_SRB, -S.srbX, -90, 0.011, -0.013, -0.03, () => artSRB(-S.srbX, false));
      drawSpent(T_SRB,  S.srbX, -90, 0.011,  0.013,  0.03, () => artSRB( S.srbX, false));
    }
    if (t >= T_CORE)     drawSpent(T_CORE, 0, -75, 0.012, -0.004, 0.012, () => artCore(false));
    if (t >= T_ICPS_SEP) drawSpent(T_ICPS_SEP, 0, -185, 0.010, 0.004, 0.02, () => artICPS(false));
    if (t >= 184)        drawSpent(184, 0, -278, -0.02, 0.012, 0.05, artLAS);   // LAS pulled up & away

    // Live (still-attached) stack, camera-tracked at the vehicle.
    ctx.save();
    ctx.translate(rocketX, rocketY);
    ctx.rotate(tilt);
    ctx.scale(artScale, artScale);
    if (t < T_SRB) { artSRB(-S.srbX, srbBurn); artSRB(S.srbX, srbBurn); }
    if (t < T_CORE)     artCore(coreBurn);
    if (t < T_ICPS_SEP) artICPS(icpsBurn);
    artOrion();
    if (t < 184)        artLAS();
    ctx.restore();
  }

  // ── Readout / vehicle-config panel (screen space) ────────────────────────────
  const panelX = 14, panelY = 14;
  ctx.fillStyle = 'rgba(8,10,20,0.62)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(panelX, panelY, 210, 196, 8);
  else ctx.rect(panelX, panelY, 210, 196);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#6b7280';
  ctx.font = '9px monospace';
  ctx.fillText('ALTITUDE', panelX + 14, panelY + 22);
  ctx.fillText('VELOCITY', panelX + 112, panelY + 22);
  ctx.fillStyle = '#60a5fa';
  ctx.font = 'bold 19px monospace';
  ctx.fillText(fmtAlt(alt), panelX + 14, panelY + 42);
  ctx.fillStyle = '#34d399';
  ctx.fillText(`${vel.toFixed(2)}`, panelX + 112, panelY + 42);
  ctx.fillStyle = '#6b7280';
  ctx.font = '9px monospace';
  ctx.fillText('km/s', panelX + 158, panelY + 42);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(panelX + 12, panelY + 54); ctx.lineTo(panelX + 198, panelY + 54); ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('VEHICLE STACK', panelX + 14, panelY + 70);

  const CONFIG = [
    { label: 'LAS tower',   color: '#cf3b2a', goneAt: 184,    note: 'jettison T+3:04' },
    { label: 'Orion',       color: '#dfe3e8', goneAt: null,   note: 'crew' },
    { label: 'ICPS',        color: '#c8ccd2', goneAt: T_ICPS_SEP, note: 'TLI stage' },
    { label: 'Core stage',  color: '#d97a32', goneAt: T_CORE, note: '4× RS-25' },
    { label: 'SRB × 2',     color: '#f0f0f4', goneAt: T_SRB,  note: '2× solid' },
  ];
  let ry = panelY + 86;
  for (const c of CONFIG) {
    const gone = c.goneAt != null && t >= c.goneAt;
    ctx.globalAlpha = gone ? 0.34 : 1;
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(panelX + 19, ry - 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = gone ? '#6b7280' : '#e5e7eb';
    ctx.font = '11px monospace';
    ctx.fillText(c.label, panelX + 30, ry);
    if (gone) {
      const tw = ctx.measureText(c.label).width;
      ctx.strokeStyle = '#6b7280';
      ctx.beginPath(); ctx.moveTo(panelX + 30, ry - 4); ctx.lineTo(panelX + 30 + tw, ry - 4); ctx.stroke();
    }
    ctx.fillStyle = '#5b616b'; ctx.font = '9px monospace';
    ctx.fillText(c.note, panelX + 118, ry);
    ctx.globalAlpha = 1;
    ry += 21;
  }

  // ── Event flashes (window widens for the slow cislunar events) ───────────────
  const FLASH = [
    [T_SRB,      'SRB SEPARATION',        60],
    [184,        'LAS JETTISON',          60],
    [T_CORE,     'CORE STAGE SEP / MECO', 60],
    [T_INSERT,   'ORBITAL INSERTION',     60],
    [T_TLI,      'TRANS-LUNAR INJECTION', 420],
    [T_ICPS_SEP, 'ICPS SEPARATION',       420],
    [T_FLYBY,    'LUNAR FLYBY',           10800],
    [T_SPLASH,   'SPLASHDOWN',            600],
  ];
  for (const [ft, lbl, win] of FLASH) {
    const dt = t - ft;
    if (dt >= 0 && dt < win) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = `rgba(255,255,255,${(1 - dt / win).toFixed(2)})`;
      ctx.textAlign = 'center';
      ctx.fillText(`✦ ${lbl}`, W / 2, 40);
      ctx.textAlign = 'left';
    }
  }
}

// ── React component ───────────────────────────────────────────────────────────
function ArtemisSimulation() {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);

  const [trajectory,    setTrajectory]   = React.useState(null);
  // simTime is the single source of truth: mission elapsed seconds (a float).
  const [simTime,       setSimTime]      = React.useState(0);
  const [playing,       setPlaying]      = React.useState(false);
  const [speed,         setSpeed]        = React.useState(1);   // sim-seconds per real second (1 = real time)
  const [viewMode,      setViewMode]     = React.useState('rocket');
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
    if (!playing) return;
    // Wall-clock driven: advance simTime by (real seconds × speed). At speed 1 the
    // mission unfolds in true real time — the launch takes its real ~8½ min to MECO.
    let last = performance.now();
    const step = (now) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);   // clamp tab-stall jumps
      last = now;
      setSimTime(prev => {
        const next = prev + dtReal * speed;
        if (next >= T_END) { setPlaying(false); return T_END; }
        return next;
      });
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, speed]);

  React.useEffect(() => {
    let ph = PHASES[0];
    for (const p of PHASES) { if (simTime >= p.t) ph = p; }
    setCurrentPhase(ph);
  }, [simTime]);

  // ── Canvas draw ──────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const simT = Math.max(0, Math.min(simTime, T_END));

    // Dedicated vehicle-profile rocket view (continuous, no trajectory needed).
    if (viewMode === 'rocket') {
      drawRocketView(ctx, W, H, simT);
      return;
    }
    if (!trajectory) return;   // orbital views need the precomputed path

    // Current vehicle position/index for the orbital views.
    const pa = posAt(simT);
    const pt = { t: simT, x: pa.x, y: pa.y, moon: moonPos(simT) };
    let frameIdx = 0;
    for (let i = 0; i < trajectory.length; i++) { if (trajectory[i].t <= simT) frameIdx = i; else break; }

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

  }, [simTime, trajectory, viewMode, closestMoon]);

  const fmt = (sec) => {
    const s = Math.floor(sec);
    if (s < 60)    return `T+${s}s`;
    if (s < 3600)  return `T+${Math.floor(s/60)}m ${s%60}s`;
    if (s < 86400) return `T+${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
    return `T+${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h`;
  };

  const tNow = Math.max(0, Math.min(simTime, T_END));

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

        <button onClick={() => { setSimTime(0); setPlaying(false); }} style={{
          padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: '#1f2937', color: '#9ca3af', fontSize: '13px',
        }}>↺ Reset</button>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', color:'#9ca3af', fontSize:'12px' }}>
          <span>Speed:</span>
          {[1, 10, 100, 1000, 10000, 60000].map(s => (
            <React.Fragment key={s}>
              {btn(speed === s, () => setSpeed(s), s >= 1000 ? `${s / 1000}k×` : `${s}×`)}
            </React.Fragment>
          ))}
          <span style={{ fontSize:'10px', color:'#5b616b' }}>(1× = real time)</span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', color:'#9ca3af', fontSize:'12px' }}>
          <span>View:</span>
          {btn(viewMode==='rocket', () => setViewMode('rocket'), 'Rocket', { activeBg:'#065f46', activeColor:'#6ee7b7' })}
          {btn(viewMode==='ascent', () => setViewMode('ascent'), 'Orbit', { activeBg:'#065f46', activeColor:'#6ee7b7' })}
          {btn(viewMode==='cislunar', () => setViewMode('cislunar'), 'Cislunar', { activeBg:'#065f46', activeColor:'#6ee7b7' })}
        </div>

        <input type="range" min={0} max={T_END} step={1} value={tNow}
          onChange={e => { setSimTime(Number(e.target.value)); setPlaying(false); }}
          style={{ flex: 1, minWidth: '80px', accentColor: '#2563eb' }} />
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
                <button key={ph.id} onClick={() => { setSimTime(ph.t); setPlaying(false); }} style={{
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
            {viewMode === 'rocket' ? 'SLS Block 1 Stack' : 'Trail Colors'}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {(viewMode === 'rocket'
              ? [
                  ['#cf3b2a','Launch Abort System'],
                  ['#dfe3e8','Orion (crew + ESM)'],
                  ['#c8ccd2','ICPS — RL-10'],
                  ['#d97a32','Core stage — 4× RS-25'],
                  ['#f0f0f4','Solid Rocket Boosters'],
                ]
              : [
                  ['#ff9428','SRB phase'],
                  ['#ffd040','Core stage'],
                  ['#38aaff','Parking orbit'],
                  ['#d848ff','TLI burn'],
                  ['#44ff7a','Cislunar coast'],
                  ['#ffdd44','Lunar flyby zone'],
                  ['#ff5555','Return arc'],
                ]
            ).map(([color, label]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width: viewMode==='rocket' ? '12px' : '22px', height: viewMode==='rocket' ? '12px' : '3px',
                  borderRadius: viewMode==='rocket' ? '50%' : '2px', background:color, flexShrink:0 }} />
                <span style={{ fontSize:'11px', color:'#9ca3af' }}>{label}</span>
              </div>
            ))}
          </div>
          {viewMode === 'rocket' && (
            <div style={{ fontSize:'10px', color:'#5b616b', marginTop:'12px', lineHeight:'1.5' }}>
              Drawn true-to-scale: the altitude grid matches the rocket's real
              size, and the camera dollies out as it climbs. At 1× the launch
              runs in real time. Spent stages tumble away as they separate.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
