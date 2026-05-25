// Starship Lunar Mission Simulation
// Architecture: Starship HLS to Moon via LEO refueling depot, NRHO insertion,
// powered descent, surface stay, ascent back to NRHO.
// Reference architecture: SpaceX HLS for Artemis III.

// ── Physical constants ────────────────────────────────────────────────────────
const G        = 6.674e-20;
const M_EARTH  = 5.972e24;
const M_MOON   = 7.342e22;
const R_EARTH  = 6371;
const R_MOON   = 1737;
const MU_EARTH = G * M_EARTH;
const MU_MOON  = G * M_MOON;
const MOON_SMA    = 384400;
const MOON_PERIOD = 27.321 * 86400;
const MOON_SOI    = 66100;

// ── Vehicle parameters (Starship HLS) ─────────────────────────────────────────
const HEIGHT_STACK     = 121.3;        // m (Super Heavy + Starship Block 2)
const DIAMETER         = 9.0;          // m
const MASS_STACK_WET   = 5000;         // tonnes (full propellant)
const MASS_BOOSTER_DRY = 200;          // tonnes (estimate)
const MASS_SHIP_DRY    = 100;          // tonnes (HLS variant)
const PROP_SHIP        = 1200;         // tonnes (full Starship propellant load)
const PROP_PER_TANKER  = 100;          // tonnes (estimate per tanker delivery)
const N_TANKERS        = 14;           // estimated tanker flights
const RAPTOR_THRUST_SL = 230;          // tf (Raptor 2)
const RAPTOR_THRUST_VAC= 258;          // tf
const RAPTOR_ISP_SL    = 327;          // s
const RAPTOR_ISP_VAC   = 380;          // s
const N_RAPTOR_BOOSTER = 33;
const N_RAPTOR_SHIP    = 6;            // 3 SL + 3 Vac

// ── LEO parking orbit ─────────────────────────────────────────────────────────
const LEO_ALT = 300;
const R_LEO   = R_EARTH + LEO_ALT;
const V_LEO   = Math.sqrt(MU_EARTH / R_LEO);
const W_LEO   = V_LEO / R_LEO;

// ── NRHO parameters (matches Artemis Gateway L2 southern NRHO) ────────────────
const NRHO_PERILUNE_ALT = 3200;        // km above lunar surface
const NRHO_APOLUNE_ALT  = 70000;
const NRHO_R_PERI = R_MOON + NRHO_PERILUNE_ALT;  // ≈ 4937 km
const NRHO_R_APO  = R_MOON + NRHO_APOLUNE_ALT;   // ≈ 71737 km
const NRHO_A      = (NRHO_R_PERI + NRHO_R_APO) / 2;
const NRHO_E      = (NRHO_R_APO - NRHO_R_PERI) / (NRHO_R_APO + NRHO_R_PERI);
const NRHO_N      = Math.sqrt(MU_MOON / Math.pow(NRHO_A, 3));
const NRHO_PERIOD = 2 * Math.PI / NRHO_N; // ≈ 7.8 days (Keplerian; real ~6.5d due to 3-body)

// ── TLI ellipse parameters ────────────────────────────────────────────────────
// Apoapsis is set so the vehicle, on the Earth-Moon line, arrives exactly at the
// NRHO perilune position (NRHO_R_PERI below the Moon, toward Earth).
const R_TLI_APO    = MOON_SMA - NRHO_R_PERI;          // ≈ 379,463 km
const A_TLI        = (R_LEO + R_TLI_APO) / 2;
const E_TLI        = (R_TLI_APO - R_LEO) / (R_TLI_APO + R_LEO);
const N_TLI        = Math.sqrt(MU_EARTH / Math.pow(A_TLI, 3));
const HALF_P_TLI   = Math.PI / N_TLI;                 // half-period ≈ 4.85 days

// Descent ellipse: from NRHO perilune down to surface
const R_DESCENT_PERI = R_MOON + 15;                   // ≈ 1752 km from Moon center
const A_DESCENT      = (NRHO_R_PERI + R_DESCENT_PERI) / 2;
const HALF_P_DESCENT = Math.PI * Math.sqrt(Math.pow(A_DESCENT, 3) / MU_MOON);

// ── Mission timing (seconds) ──────────────────────────────────────────────────
const T_LIFTOFF       = 0;
const T_MAXQ          = 60;
const T_HOT_STAGE     = 162;         // 2:42 - hot staging
const T_BOOSTER_BOOST = 200;
const T_BOOSTER_CATCH = 420;         // 7:00 - Mechazilla catch
const T_SHIP_MECO     = 540;         // 9:00 - ship engine cutoff
const T_LEO_INSERT    = 600;         // 10:00 - LEO insertion
const T_TANKER_BEGIN  = 3600;        // T+1h - first tanker
const T_TANKER_END    = 12 * 3600;   // T+12h
const T_REFUEL_DONE   = 13 * 3600;
const T_TLI           = 14 * 3600;   // T+14h
const T_TLI_END       = T_TLI + 240;
const T_LOI           = T_TLI + Math.round(HALF_P_TLI);   // ≈ T+5.4 days
const T_DOI           = T_LOI + Math.round(NRHO_PERIOD);  // one full NRHO orbit, back at perilune
const T_PD_START      = T_DOI + Math.round(HALF_P_DESCENT); // coast down descent ellipse
const T_LANDING       = T_PD_START + 900;            // 15-min powered descent
const T_SURFACE_END   = T_LANDING + Math.round(2 * 86400); // 2-day surface stay (compressed)
const T_ASCENT_END    = T_SURFACE_END + 900;
const T_NRHO_RV       = T_ASCENT_END + 4 * 3600;
const T_MISSION_END   = T_NRHO_RV + 6 * 3600;

const T_TOTAL = T_MISSION_END;

// ── Mission phases ────────────────────────────────────────────────────────────
const PHASES = [
  { id:'liftoff',     label:'Liftoff',                t:T_LIFTOFF,
    desc:'Super Heavy + Starship stack ignites 33 Raptor 2 engines. Total thrust 7,590 tf — most powerful rocket ever flown.' },
  { id:'maxq',        label:'Max-Q',                  t:T_MAXQ,
    desc:'Maximum aerodynamic pressure. Center engines throttle down briefly.' },
  { id:'hot_stage',   label:'Hot Staging',            t:T_HOT_STAGE,
    desc:'Stage separation while booster center engines still burning. Ship ignites its 6 Raptors before separation. ~10% performance gain vs cold staging.' },
  { id:'boost_burn',  label:'Boostback Burn',         t:T_BOOSTER_BOOST,
    desc:'Super Heavy flips and burns 13 engines to cancel downrange velocity. Trajectory bends back toward Starbase.' },
  { id:'catch',       label:'Mechazilla Catch',       t:T_BOOSTER_CATCH,
    desc:'Booster decelerates with center 3 engines and is caught mid-air by the launch tower chopsticks. No landing legs needed — saves ~20 t dry mass.' },
  { id:'ship_meco',   label:'Ship Engine Cutoff',     t:T_SHIP_MECO,
    desc:'Starship 6 Raptors cut off. Coasts to LEO insertion.' },
  { id:'leo',         label:'LEO Insertion',          t:T_LEO_INSERT,
    desc:'HLS depot inserted into 300 km circular parking orbit. Now awaiting tanker fleet.' },
  { id:'tanker_begin',label:'Tanker Refueling Begins',t:T_TANKER_BEGIN,
    desc:`First tanker launches. Mission requires ~${N_TANKERS} tanker flights delivering ~${PROP_PER_TANKER} t propellant each via cryogenic transfer. Settling thrusters create artificial gravity to keep LOX/LCH4 at the tank outlet.` },
  { id:'refuel_done', label:'Refueling Complete',     t:T_REFUEL_DONE,
    desc:`HLS holds full ${PROP_SHIP} t methalox load. Boil-off mitigated by multi-layer insulation and active cryocooling.` },
  { id:'tli',         label:'Trans-Lunar Injection',  t:T_TLI,
    desc:'HLS performs TLI burn. ΔV ≈ 3.1 km/s. Departs LEO on free-return-style trans-lunar trajectory.' },
  { id:'cislunar',    label:'Cislunar Coast',         t:T_TLI_END,
    desc:'~5-day coast to Moon. Course corrections via reaction control thrusters.' },
  { id:'loi',         label:'Lunar Orbit Insertion',  t:T_LOI,
    desc:'LOI burn at lunar approach captures HLS into Near-Rectilinear Halo Orbit (NRHO). ΔV ≈ 0.45 km/s — much less than LLO insertion.' },
  { id:'nrho',        label:'NRHO Loiter',            t:T_LOI + 1,
    desc:'HLS loiters in NRHO awaiting Orion crew transfer. NRHO is a 9:2 resonant orbit with the lunar synodic period — guarantees no Earth eclipse.' },
  { id:'doi',         label:'Descent Orbit Insertion',t:T_DOI,
    desc:'DOI burn at apolune lowers perilune to ~15 km. Vehicle coasts down the descent ellipse.' },
  { id:'pdi',         label:'Powered Descent',        t:T_PD_START,
    desc:'PDI ignition at ~15 km altitude. High-mounted lunar landing thrusters prevent surface regolith ejecta (avoids Apollo-style dust blast).' },
  { id:'landing',     label:'Lunar Landing',          t:T_LANDING,
    desc:'Touchdown near lunar south pole (Shackleton or de Gerlache crater region). Crew elevator deploys for surface EVA.' },
  { id:'surface',     label:'Surface Operations',     t:T_LANDING + 60,
    desc:'Up to 6.5+ days of surface stay. Solar arrays + batteries provide power. ISRU prospecting at permanent shadow regions.' },
  { id:'ascent',      label:'Lunar Ascent',           t:T_SURFACE_END,
    desc:'HLS Raptors reignite. Ascent burn to NRHO rendezvous trajectory. ΔV ≈ 2.7 km/s ascent + circularization.' },
  { id:'rendezvous',  label:'NRHO Rendezvous',        t:T_NRHO_RV,
    desc:'HLS rejoins Orion at NRHO. Crew transfers back to Orion for return to Earth. HLS remains in NRHO (potentially refuelable for future flights).' },
  { id:'mission_end', label:'Mission Complete',       t:T_MISSION_END,
    desc:'HLS depot established at NRHO. Reusable architecture enables follow-on Artemis missions.' },
];

// ── Helper: Moon position ─────────────────────────────────────────────────────
function moonPos(t) {
  const a = (2 * Math.PI * t) / MOON_PERIOD;
  return { x: MOON_SMA * Math.cos(a), y: MOON_SMA * Math.sin(a), angle: a };
}

// ── Kepler solver ─────────────────────────────────────────────────────────────
function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

// ── Geometry / phase angles ───────────────────────────────────────────────────
// Ascent ends at this angle (Starbase due-east profile in 2D)
const ASCENT_END_ANGLE = Math.PI / 2 - 0.10 * Math.PI;
const W_LEO_ANGLE = W_LEO;

// LEO angle when TLI fires
const THETA_TLI = ASCENT_END_ANGLE - W_LEO_ANGLE * (T_TLI - T_LEO_INSERT);

// Apoapsis of TLI ellipse is in direction THETA_TLI + π. Place Moon there at T_LOI
// so vehicle (at apoapsis) is NRHO_R_PERI inside the Moon's orbit, exactly at NRHO perilune.
const APOAPSIS_DIR = THETA_TLI + Math.PI;
const MOON_START = APOAPSIS_DIR - (2 * Math.PI * T_LOI / MOON_PERIOD);

// Override moonPos with phase-locked start
function moonPosLocked(t) {
  const a = MOON_START + (2 * Math.PI * t) / MOON_PERIOD;
  return { x: MOON_SMA * Math.cos(a), y: MOON_SMA * Math.sin(a), angle: a };
}

// ── TLI ellipse position ──────────────────────────────────────────────────────
function tliEllipsePos(T_TRANS) {
  const M = N_TLI * T_TRANS;
  const E = solveKepler(M, E_TLI);
  const r = A_TLI * (1 - E_TLI * Math.cos(E));
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + E_TLI) * Math.sin(E / 2),
    Math.sqrt(1 - E_TLI) * Math.cos(E / 2)
  );
  const ang = nu + THETA_TLI;
  return { x: r * Math.cos(ang), y: r * Math.sin(ang) };
}

// ── NRHO position in Earth-centered inertial frame ────────────────────────────
// NRHO is a Moon-centered ellipse with apolune toward L2 (away from Earth)
// and perilune toward Earth side of Moon.
function nrhoPos(t, T_TRANS_NRHO) {
  // Solve NRHO Kepler equation
  const M = NRHO_N * T_TRANS_NRHO;
  const E = solveKepler(M, NRHO_E);
  const r = NRHO_A * (1 - NRHO_E * Math.cos(E));
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + NRHO_E) * Math.sin(E / 2),
    Math.sqrt(1 - NRHO_E) * Math.cos(E / 2)
  );
  // Local frame: +x toward Earth, perilune at nu=0
  const xL = r * Math.cos(nu);  // toward Earth at perilune
  const yL = r * Math.sin(nu);  // perpendicular to Earth-Moon line

  // Moon position at time t
  const moon = moonPosLocked(t);
  // Earth-from-Moon direction: opposite of moon position direction
  // Earth-from-Moon angle = moon.angle + π
  const earthDirAngle = moon.angle + Math.PI;
  const cosA = Math.cos(earthDirAngle);
  const sinA = Math.sin(earthDirAngle);

  // Rotate local (xL toward Earth, yL perp) to inertial
  // Local +x maps to (cosA, sinA), local +y maps to (-sinA, cosA)
  const dx = xL * cosA - yL * sinA;
  const dy = xL * sinA + yL * cosA;

  return { x: moon.x + dx, y: moon.y + dy, rMoon: r, moon };
}

// ── Descent / Ascent / Surface (Moon-centered parametric) ─────────────────────
function descentPos(t) {
  // Coast from NRHO perilune down to ~15 km, then powered descent to surface
  // Simplified parametric arc from perilune position to landing site
  const moon = moonPosLocked(t);
  const earthDirAngle = moon.angle + Math.PI;
  const cosA = Math.cos(earthDirAngle);
  const sinA = Math.sin(earthDirAngle);

  if (t < T_PD_START) {
    // Descent ellipse coast: from perilune (NRHO_R_PERI) to ~25 km altitude
    const frac = (t - T_DOI) / (T_PD_START - T_DOI);
    const r = NRHO_R_PERI * (1 - frac) + (R_MOON + 25) * frac;
    // angular drift around Moon
    const theta_local = -0.6 * frac; // arc around Moon
    const xL = r * Math.cos(theta_local);
    const yL = r * Math.sin(theta_local);
    const dx = xL * cosA - yL * sinA;
    const dy = xL * sinA + yL * cosA;
    return { x: moon.x + dx, y: moon.y + dy, rMoon: r, moon };
  } else {
    // Powered descent: vertical drop to surface
    const frac = (t - T_PD_START) / (T_LANDING - T_PD_START);
    const r = (R_MOON + 25) * (1 - frac) + R_MOON * frac;
    const theta_local = -0.6 - 0.3 * frac;
    const xL = r * Math.cos(theta_local);
    const yL = r * Math.sin(theta_local);
    const dx = xL * cosA - yL * sinA;
    const dy = xL * sinA + yL * cosA;
    return { x: moon.x + dx, y: moon.y + dy, rMoon: r, moon };
  }
}

const SURFACE_LOCAL_ANGLE = -0.9; // landing site angular position in local Moon frame
function surfacePos(t) {
  const moon = moonPosLocked(t);
  const earthDirAngle = moon.angle + Math.PI;
  const cosA = Math.cos(earthDirAngle);
  const sinA = Math.sin(earthDirAngle);
  const xL = R_MOON * Math.cos(SURFACE_LOCAL_ANGLE);
  const yL = R_MOON * Math.sin(SURFACE_LOCAL_ANGLE);
  const dx = xL * cosA - yL * sinA;
  const dy = xL * sinA + yL * cosA;
  return { x: moon.x + dx, y: moon.y + dy, rMoon: R_MOON, moon };
}

function ascentPos(t) {
  // From surface back to NRHO perilune
  const moon = moonPosLocked(t);
  const earthDirAngle = moon.angle + Math.PI;
  const cosA = Math.cos(earthDirAngle);
  const sinA = Math.sin(earthDirAngle);
  const frac = (t - T_SURFACE_END) / (T_NRHO_RV - T_SURFACE_END);
  const r = R_MOON * (1 - frac) + NRHO_R_PERI * frac;
  const theta_local = SURFACE_LOCAL_ANGLE + frac * 0.9; // arc back toward perilune
  const xL = r * Math.cos(theta_local);
  const yL = r * Math.sin(theta_local);
  const dx = xL * cosA - yL * sinA;
  const dy = xL * sinA + yL * cosA;
  return { x: moon.x + dx, y: moon.y + dy, rMoon: r, moon };
}

// ── Main vehicle position dispatch ────────────────────────────────────────────
function vehiclePos(t) {
  const moon = moonPosLocked(t);

  if (t <= T_LEO_INSERT) {
    // Parametric ascent (gravity-turn-like)
    const frac = Math.min(t / T_LEO_INSERT, 1);
    const alt  = R_EARTH + frac * frac * LEO_ALT;
    const ang  = ASCENT_END_ANGLE + (1 - frac) * (Math.PI / 2 - ASCENT_END_ANGLE);
    return { x: alt * Math.cos(ang), y: alt * Math.sin(ang), moon };
  }
  if (t <= T_TLI) {
    // Circular LEO
    const theta = ASCENT_END_ANGLE - W_LEO_ANGLE * (t - T_LEO_INSERT);
    return { x: R_LEO * Math.cos(theta), y: R_LEO * Math.sin(theta), moon };
  }
  if (t <= T_LOI) {
    // TLI ellipse
    const p = tliEllipsePos(t - T_TLI);
    return { x: p.x, y: p.y, moon };
  }
  if (t <= T_DOI) {
    // NRHO
    return nrhoPos(t, t - T_LOI);
  }
  if (t <= T_LANDING) {
    return descentPos(t);
  }
  if (t <= T_SURFACE_END) {
    return surfacePos(t);
  }
  if (t <= T_NRHO_RV) {
    return ascentPos(t);
  }
  // After rendezvous, continue in NRHO from perilune
  return nrhoPos(t, t - T_NRHO_RV);
}

// ── Booster boostback trajectory (separate from main ship) ────────────────────
// Booster separates at hot staging, performs boostback burn, returns to launch tower.
// Generates a parametric arc from staging point back to launch site.
function boosterPos(t) {
  if (t < T_HOT_STAGE) return null;
  if (t > T_BOOSTER_CATCH + 30) return null;
  // Separation point: at altitude ~70 km, slightly east of launch site
  const sepAlt = R_EARTH + 70;
  const sepAng = ASCENT_END_ANGLE + 0.04;
  const sepX = sepAlt * Math.cos(sepAng);
  const sepY = sepAlt * Math.sin(sepAng);
  // Landing point: launch site
  const landX = R_EARTH * Math.cos(Math.PI / 2);
  const landY = R_EARTH * Math.sin(Math.PI / 2);
  // Parametric arc — peaks higher, curves back
  const frac = (t - T_HOT_STAGE) / (T_BOOSTER_CATCH - T_HOT_STAGE);
  const f = Math.max(0, Math.min(1, frac));
  // Quadratic Bezier control point: high arc midway between sep and land
  const peakAlt = R_EARTH + 110;
  const peakAng = (sepAng + Math.PI/2) / 2;
  const bx = peakAlt * Math.cos(peakAng);
  const by = peakAlt * Math.sin(peakAng);
  const one_f = 1 - f;
  const x = one_f * one_f * sepX + 2 * one_f * f * bx + f * f * landX;
  const y = one_f * one_f * sepY + 2 * one_f * f * by + f * f * landY;
  return { x, y };
}

// ── Tanker trajectories ───────────────────────────────────────────────────────
// Generate several tanker launches between T_TANKER_BEGIN and T_TANKER_END.
// Each tanker launches from Earth, rendezvous with HLS in LEO, returns to Earth.
const TANKER_LAUNCH_TIMES = [];
{
  const total = N_TANKERS;
  const span  = T_TANKER_END - T_TANKER_BEGIN;
  for (let i = 0; i < total; i++) {
    TANKER_LAUNCH_TIMES.push(T_TANKER_BEGIN + (i + 0.5) * span / total);
  }
}
function tankerPositions(t) {
  // Each tanker has: launch_time, ascent_duration ≈ 9 min, docking_duration ≈ 30 min, return ≈ 30 min
  const active = [];
  for (let i = 0; i < TANKER_LAUNCH_TIMES.length; i++) {
    const t0 = TANKER_LAUNCH_TIMES[i];
    const tEnd = t0 + 4200;
    if (t < t0 || t > tEnd) continue;
    const dt = t - t0;
    let x, y, phase;
    if (dt < 540) {
      // Ascent
      const f = dt / 540;
      const alt = R_EARTH + f * f * LEO_ALT;
      const ang = (Math.PI / 2) - f * 0.15 * Math.PI;
      x = alt * Math.cos(ang);
      y = alt * Math.sin(ang);
      phase = 'ascent';
    } else if (dt < 540 + 2400) {
      // Docked at HLS depot (matches HLS LEO position)
      const tDock = T_LEO_INSERT + (t - T_LEO_INSERT);
      const theta = ASCENT_END_ANGLE - W_LEO_ANGLE * (tDock - T_LEO_INSERT);
      x = R_LEO * Math.cos(theta);
      y = R_LEO * Math.sin(theta);
      phase = 'docked';
    } else {
      // Return
      const f = (dt - 540 - 2400) / (4200 - 540 - 2400);
      const tDock = T_LEO_INSERT + (t - T_LEO_INSERT);
      const theta = ASCENT_END_ANGLE - W_LEO_ANGLE * (tDock - T_LEO_INSERT);
      const xL = R_LEO * Math.cos(theta);
      const yL = R_LEO * Math.sin(theta);
      // Glide back to Earth surface
      const ang_re = Math.PI / 2 + 0.1;
      const xE = R_EARTH * Math.cos(ang_re);
      const yE = R_EARTH * Math.sin(ang_re);
      x = xL * (1 - f) + xE * f;
      y = yL * (1 - f) + yE * f;
      phase = 'return';
    }
    active.push({ id: i, x, y, phase, dt });
  }
  return active;
}

// ── Tanker propellant progress (0 to 1) ───────────────────────────────────────
function refuelProgress(t) {
  if (t < T_TANKER_BEGIN) return 0;
  if (t > T_TANKER_END)   return 1;
  let count = 0;
  for (const t0 of TANKER_LAUNCH_TIMES) {
    if (t > t0 + 540 + 1200) count++;  // counted as "transfer complete" mid-dock
  }
  return Math.min(1, count / N_TANKERS);
}

// ── Trajectory generation ─────────────────────────────────────────────────────
function generateTrajectory() {
  // Variable time-step: dense near events, sparser during coasts
  const samples = [];
  const addRange = (t0, t1, dt) => {
    for (let t = t0; t < t1; t += dt) samples.push(t);
  };
  // Ascent through LEO insertion: 5 s
  addRange(0, T_LEO_INSERT + 60, 5);
  // LEO + tanker phase: 60 s
  addRange(T_LEO_INSERT + 60, T_TLI - 60, 120);
  // TLI burn: 5 s
  addRange(T_TLI - 60, T_TLI + 300, 5);
  // Cislunar coast: 600 s (10 min)
  addRange(T_TLI + 300, T_LOI - 1800, 600);
  // NRHO insertion: 60 s
  addRange(T_LOI - 1800, T_LOI + 3600, 60);
  // NRHO orbits: 600 s
  addRange(T_LOI + 3600, T_DOI - 600, 600);
  // DOI and descent: 30 s
  addRange(T_DOI - 600, T_LANDING + 600, 30);
  // Surface stay: 1200 s (20 min) — boring phase
  addRange(T_LANDING + 600, T_SURFACE_END, 1200);
  // Ascent and rendezvous: 60 s
  addRange(T_SURFACE_END, T_NRHO_RV + 600, 60);
  // Mission end: 600 s
  addRange(T_NRHO_RV + 600, T_TOTAL + 600, 600);

  const pts = samples.map(t => {
    const v = vehiclePos(t);
    const moon = moonPosLocked(t);
    let phase = 'cruise';
    if (t <= T_HOT_STAGE)             phase = 'boost_ascent';
    else if (t <= T_SHIP_MECO)        phase = 'ship_ascent';
    else if (t <= T_TLI)              phase = 'leo';
    else if (t <= T_TLI_END)          phase = 'tli_burn';
    else if (t <= T_LOI)              phase = 'cislunar';
    else if (t <= T_DOI)              phase = 'nrho';
    else if (t <= T_PD_START)         phase = 'descent_coast';
    else if (t <= T_LANDING)          phase = 'powered_descent';
    else if (t <= T_SURFACE_END)      phase = 'surface';
    else if (t <= T_NRHO_RV)          phase = 'ascent';
    else                              phase = 'nrho_final';
    return { t, x: v.x, y: v.y, moon, phase };
  });
  return pts;
}

// ════════════════════════════════════════════════════════════════════════════
// REACT COMPONENT
// ════════════════════════════════════════════════════════════════════════════

function StarshipSimulation() {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);

  const [trajectory, setTrajectory] = React.useState(null);
  const [frameIdx,   setFrameIdx]   = React.useState(0);
  const [playing,    setPlaying]    = React.useState(false);
  const [speed,      setSpeed]      = React.useState(64);
  const [viewMode,   setViewMode]   = React.useState('ascent');
  const [currentPhase, setCurrentPhase] = React.useState(PHASES[0]);

  React.useEffect(() => {
    const id = setTimeout(() => setTrajectory(generateTrajectory()), 40);
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
    for (const p of PHASES) if (t >= p.t) ph = p;
    setCurrentPhase(ph);
  }, [frameIdx, trajectory]);

  // ── Canvas rendering ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!trajectory || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#040410';
    ctx.fillRect(0, 0, W, H);

    const pt = trajectory[Math.min(frameIdx, trajectory.length - 1)];

    // View centering and scale
    let cx_km = 0, cy_km = 0, VIEW_R;
    if (viewMode === 'ascent') { VIEW_R = 20000; }
    else if (viewMode === 'cislunar') { VIEW_R = 460000; }
    else if (viewMode === 'lunar') {
      // Center on Moon for lunar view
      cx_km = pt.moon.x; cy_km = pt.moon.y;
      VIEW_R = 90000;
    }
    const scale = (Math.min(W, H) / 2) / VIEW_R;
    const ox = W / 2, oy = H / 2;
    const sc = (kx, ky) => ({ sx: ox + (kx - cx_km) * scale, sy: oy - (ky - cy_km) * scale });

    // Stars
    for (let i = 0; i < 350; i++) {
      const sx = ((Math.sin(i * 7.31 + 0.4) + 1) / 2) * W;
      const sy = ((Math.cos(i * 13.71 + 1.1) + 1) / 2) * H;
      const br = 0.2 + 0.8 * ((i * 37 % 100) / 100);
      ctx.fillStyle = `rgba(255,255,255,${br.toFixed(2)})`;
      const sz = i % 11 === 0 ? 2 : 1;
      ctx.fillRect(sx - sz/2, sy - sz/2, sz, sz);
    }

    // Earth
    const es = sc(0, 0);
    const er = Math.max(7, R_EARTH * scale);
    if (es.sx > -er*2 && es.sx < W + er*2 && es.sy > -er*2 && es.sy < H + er*2) {
      const eg = ctx.createRadialGradient(es.sx - er*0.2, es.sy - er*0.25, 0, es.sx, es.sy, er);
      eg.addColorStop(0, '#5baae8'); eg.addColorStop(0.35, '#2c74c9');
      eg.addColorStop(0.7, '#17448a'); eg.addColorStop(1, '#091e3e');
      ctx.beginPath(); ctx.arc(es.sx, es.sy, er, 0, Math.PI*2);
      ctx.fillStyle = eg; ctx.fill();
      const atm = ctx.createRadialGradient(es.sx, es.sy, er * 0.97, es.sx, es.sy, er * 1.15);
      atm.addColorStop(0, 'rgba(80,180,255,0.2)'); atm.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.beginPath(); ctx.arc(es.sx, es.sy, er * 1.15, 0, Math.PI*2);
      ctx.fillStyle = atm; ctx.fill();
    }

    // Moon orbit ring (cislunar view)
    if (viewMode === 'cislunar') {
      ctx.save(); ctx.setLineDash([6, 14]);
      ctx.beginPath(); ctx.arc(es.sx, es.sy, MOON_SMA * scale, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    // Moon
    const ms = sc(pt.moon.x, pt.moon.y);
    const mr = Math.max(viewMode === 'lunar' ? 8 : 4, R_MOON * scale);
    if (ms.sx > -mr*3 && ms.sx < W + mr*3 && ms.sy > -mr*3 && ms.sy < H + mr*3) {
      const mg = ctx.createRadialGradient(ms.sx - mr*0.2, ms.sy - mr*0.2, 0, ms.sx, ms.sy, mr);
      mg.addColorStop(0, '#e2ded4'); mg.addColorStop(0.55, '#a09890'); mg.addColorStop(1, '#383838');
      ctx.beginPath(); ctx.arc(ms.sx, ms.sy, mr, 0, Math.PI*2);
      ctx.fillStyle = mg; ctx.fill();
      ctx.fillStyle = 'rgba(210,205,195,0.75)';
      ctx.font = '11px monospace';
      ctx.fillText('Moon', ms.sx + mr + 4, ms.sy + 4);
    }

    // NRHO ghost orbit in lunar view
    if (viewMode === 'lunar') {
      ctx.save();
      ctx.setLineDash([3, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      const moonAng = pt.moon.angle + Math.PI; // Earth direction from Moon
      const ca = Math.cos(moonAng), sa = Math.sin(moonAng);
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const nu = (i / 180) * Math.PI;
        const r = NRHO_A * (1 - NRHO_E*NRHO_E) / (1 + NRHO_E * Math.cos(nu));
        const xL = r * Math.cos(nu), yL = r * Math.sin(nu);
        const dx = xL * ca - yL * sa, dy = xL * sa + yL * ca;
        const s = sc(pt.moon.x + dx, pt.moon.y + dy);
        if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();

      // Label NRHO perilune/apolune
      const peri = sc(pt.moon.x + NRHO_R_PERI * Math.cos(pt.moon.angle + Math.PI),
                      pt.moon.y + NRHO_R_PERI * Math.sin(pt.moon.angle + Math.PI));
      const apo  = sc(pt.moon.x + NRHO_R_APO * Math.cos(pt.moon.angle),
                      pt.moon.y + NRHO_R_APO * Math.sin(pt.moon.angle));
      ctx.fillStyle = 'rgba(150,200,255,0.4)';
      ctx.font = '9px monospace';
      ctx.fillText('perilune (3200 km)', peri.sx + 5, peri.sy);
      ctx.fillText('apolune (70,000 km)', apo.sx - 110, apo.sy);
    }

    // ── Booster trail (boost_ascent → catch) ──────────────────────────────────
    if (viewMode === 'ascent') {
      for (let i = Math.max(0, frameIdx - 800); i < frameIdx; i++) {
        const p0 = trajectory[i]; if (!p0) continue;
        const bp = boosterPos(p0.t);
        if (!bp) continue;
        const bpNext = trajectory[i+1] ? boosterPos(trajectory[i+1].t) : null;
        if (!bpNext) continue;
        const s0 = sc(bp.x, bp.y), s1 = sc(bpNext.x, bpNext.y);
        ctx.beginPath(); ctx.moveTo(s0.sx, s0.sy); ctx.lineTo(s1.sx, s1.sy);
        ctx.strokeStyle = 'rgba(255,120,40,0.55)'; ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      const bp = boosterPos(pt.t);
      if (bp) {
        const bs = sc(bp.x, bp.y);
        ctx.beginPath(); ctx.arc(bs.sx, bs.sy, 4, 0, Math.PI*2);
        ctx.fillStyle = '#ff8030'; ctx.fill();
        ctx.fillStyle = 'rgba(255,180,80,0.8)'; ctx.font = '10px monospace';
        ctx.fillText('Super Heavy', bs.sx + 6, bs.sy - 3);
      }
    }

    // ── Tanker trails ─────────────────────────────────────────────────────────
    if (viewMode === 'ascent' && pt.t >= T_TANKER_BEGIN && pt.t < T_REFUEL_DONE) {
      const tanks = tankerPositions(pt.t);
      for (const tk of tanks) {
        const ts = sc(tk.x, tk.y);
        ctx.beginPath(); ctx.arc(ts.sx, ts.sy, 2.5, 0, Math.PI*2);
        ctx.fillStyle = tk.phase === 'docked' ? '#80ffd0' : tk.phase === 'ascent' ? '#ffd080' : '#a0a0ff';
        ctx.fill();
      }
    }

    // ── Vehicle trail ─────────────────────────────────────────────────────────
    const PHASE_COLOR = {
      boost_ascent:    '#ff7030',
      ship_ascent:     '#ffc040',
      leo:             '#40aaff',
      tli_burn:        '#dd44ff',
      cislunar:        '#44ff7a',
      nrho:            '#80c0ff',
      descent_coast:   '#ffd040',
      powered_descent: '#ff5050',
      surface:         '#ffffff',
      ascent:          '#50ffaa',
      nrho_final:      '#a080ff',
    };
    const hex2rgb = (h) => ({ r:parseInt(h.slice(1,3),16), g:parseInt(h.slice(3,5),16), b:parseInt(h.slice(5,7),16) });

    const TRAIL = Math.min(frameIdx, 1500);
    for (let i = Math.max(0, frameIdx - TRAIL); i < frameIdx; i++) {
      const p0 = trajectory[i], p1 = trajectory[i+1];
      if (!p0 || !p1) continue;
      const s0 = sc(p0.x, p0.y), s1 = sc(p1.x, p1.y);
      if (s0.sx < -W || s0.sx > 2*W || s0.sy < -H || s0.sy > 2*H) continue;
      const alpha = 0.1 + 0.9 * ((i - (frameIdx - TRAIL)) / TRAIL);
      const col = PHASE_COLOR[p0.phase] || '#cccccc';
      const c = hex2rgb(col);
      ctx.beginPath(); ctx.moveTo(s0.sx, s0.sy); ctx.lineTo(s1.sx, s1.sy);
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ── Vehicle dot ───────────────────────────────────────────────────────────
    const vs = sc(pt.x, pt.y);
    if (vs.sx > -30 && vs.sx < W+30 && vs.sy > -30 && vs.sy < H+30) {
      const glow = ctx.createRadialGradient(vs.sx, vs.sy, 0, vs.sx, vs.sy, 18);
      glow.addColorStop(0, 'rgba(255,255,255,0.4)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(vs.sx, vs.sy, 18, 0, Math.PI*2);
      ctx.fillStyle = glow; ctx.fill();
      ctx.beginPath(); ctx.arc(vs.sx, vs.sy, 5, 0, Math.PI*2);
      ctx.fillStyle = '#ffffff'; ctx.fill();

      const dist = Math.sqrt(pt.x*pt.x + pt.y*pt.y);
      const alt  = dist - R_EARTH;
      const dxM = pt.x - pt.moon.x, dyM = pt.y - pt.moon.y;
      const distMoon = Math.sqrt(dxM*dxM + dyM*dyM);
      const altMoon = distMoon - R_MOON;

      let mainLabel;
      if (alt < 1500) mainLabel = `Earth alt: ${Math.round(alt)} km`;
      else            mainLabel = `${Math.round(dist).toLocaleString()} km from Earth`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '11px monospace';
      ctx.fillText(mainLabel, vs.sx + 11, vs.sy - 8);

      if (viewMode !== 'ascent' && distMoon < 200000) {
        const moonLabel = altMoon < 1 ? 'On lunar surface' :
                          altMoon < 100 ? `Lunar alt: ${altMoon.toFixed(1)} km` :
                          `${Math.round(altMoon).toLocaleString()} km above Moon`;
        ctx.fillStyle = 'rgba(180,210,255,0.75)'; ctx.font = '10px monospace';
        ctx.fillText(moonLabel, vs.sx + 11, vs.sy + 6);
      }

      // HLS label
      ctx.fillStyle = 'rgba(180,220,255,0.6)'; ctx.font = '9px monospace';
      ctx.fillText('HLS', vs.sx - 22, vs.sy + 4);
    }

    // Event flashes
    const flashes = [
      { t: T_HOT_STAGE,     label: '✦ HOT STAGING',       color: '#ffaa50' },
      { t: T_BOOSTER_CATCH, label: '✦ MECHAZILLA CATCH',  color: '#ff8030' },
      { t: T_TLI,           label: '✦ TLI BURN',          color: '#cc55ff' },
      { t: T_LOI,           label: '✦ NRHO INSERTION',    color: '#80c0ff' },
      { t: T_LANDING,       label: '✦ LUNAR LANDING',     color: '#80ffaa' },
      { t: T_SURFACE_END,   label: '✦ LUNAR ASCENT',      color: '#50ffaa' },
      { t: T_NRHO_RV,       label: '✦ NRHO RENDEZVOUS',   color: '#a0a0ff' },
    ];
    for (const fl of flashes) {
      const dt = Math.abs(pt.t - fl.t);
      const window = fl.t < 1000 ? 60 : fl.t < 86400 ? 600 : 14400;
      if (dt < window) {
        const alpha = (1 - dt / window).toFixed(2);
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(fl.label, ox - 90, 44);
      }
    }

    // Corner info
    ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(120,120,140,0.6)';
    const viewLabel = viewMode === 'ascent' ? '±20,000 km (Earth)' : viewMode === 'cislunar' ? '±460,000 km (Cislunar)' : '±90,000 km (Lunar)';
    ctx.fillText(viewLabel, 10, H - 10);

    // Refuel progress bar
    if (pt.t >= T_TANKER_BEGIN && pt.t < T_REFUEL_DONE) {
      const prog = refuelProgress(pt.t);
      const barW = 200, barH = 8;
      const bx = W - barW - 14, by = 14;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#50ffaa';
      ctx.fillRect(bx, by, barW * prog, barH);
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(200,220,200,0.85)';
      ctx.fillText(`Refuel: ${Math.round(prog * 100)}% (${Math.round(prog * PROP_SHIP)} / ${PROP_SHIP} t methalox)`, bx, by - 4);
    }

  }, [frameIdx, trajectory, viewMode]);

  const fmt = (s) => {
    if (s < 60)    return `T+${s}s`;
    if (s < 3600)  return `T+${Math.floor(s/60)}m ${s%60}s`;
    if (s < 86400) return `T+${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
    return `T+${Math.floor(s/86400)}d ${Math.floor((s%86400)/3600)}h`;
  };

  const tNow = trajectory ? trajectory[Math.min(frameIdx, trajectory.length-1)].t : 0;
  const box = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '12px' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      <canvas ref={canvasRef} width={900} height={520}
        style={{ width:'100%', borderRadius:'12px', background:'#040410', display:'block' }} />
      {!trajectory && <div style={{ textAlign:'center', color:'#6b7280', padding:'12px' }}>Computing trajectory…</div>}

      {/* Controls */}
      <div style={{ ...box, padding:'14px', display:'flex', flexWrap:'wrap', alignItems:'center', gap:'10px' }}>
        <button onClick={() => setPlaying(p => !p)} disabled={!trajectory} style={{
          padding:'8px 22px', borderRadius:'8px', border:'none', cursor:'pointer',
          background: playing ? '#374151' : '#2563eb', color:'#fff', fontWeight:'600', fontSize:'14px',
        }}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <button onClick={() => { setFrameIdx(0); setPlaying(false); }} style={{
          padding:'8px 14px', borderRadius:'8px', border:'none', cursor:'pointer',
          background:'#1f2937', color:'#9ca3af', fontSize:'13px',
        }}>↺ Reset</button>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', color:'#9ca3af', fontSize:'12px' }}>
          <span>Speed:</span>
          {[1, 16, 64, 256, 1024].map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              padding:'4px 8px', borderRadius:'6px', border:'none', fontSize:'12px', fontFamily:'monospace', cursor:'pointer',
              background: speed === s ? '#1d4ed8' : '#1f2937', color: speed === s ? '#fff' : '#6b7280',
            }}>{s}×</button>
          ))}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'5px', color:'#9ca3af', fontSize:'12px' }}>
          <span>View:</span>
          {[
            { id:'ascent',   label:'Ascent' },
            { id:'cislunar', label:'Cislunar' },
            { id:'lunar',    label:'Lunar/NRHO' },
          ].map(v => (
            <button key={v.id} onClick={() => setViewMode(v.id)} style={{
              padding:'4px 10px', borderRadius:'6px', border:'none', fontSize:'12px', cursor:'pointer',
              background: viewMode === v.id ? '#065f46' : '#1f2937', color: viewMode === v.id ? '#6ee7b7' : '#6b7280',
            }}>{v.label}</button>
          ))}
        </div>

        {trajectory && (
          <input type="range" min={0} max={trajectory.length-1} value={frameIdx}
            onChange={e => { setFrameIdx(Number(e.target.value)); setPlaying(false); }}
            style={{ flex:1, minWidth:'80px', accentColor:'#2563eb' }} />
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
      <div style={{ display:'grid', gridTemplateColumns:'1fr 210px', gap:'12px' }}>
        <div style={{ ...box, padding:'14px' }}>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>
            Mission Timeline — click to jump
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px', maxHeight:'420px', overflowY:'auto' }}>
            {PHASES.map(ph => {
              const past   = tNow >= ph.t;
              const active = ph.id === currentPhase.id;
              return (
                <button key={ph.id} onClick={() => {
                  if (!trajectory) return;
                  const idx = trajectory.findIndex(p => p.t >= ph.t);
                  if (idx >= 0) { setFrameIdx(idx); setPlaying(false); }
                }} style={{
                  display:'flex', alignItems:'center', gap:'6px',
                  padding:'5px 7px', borderRadius:'6px', border:'none', textAlign:'left', cursor:'pointer',
                  background: active ? 'rgba(37,99,235,0.18)' : 'transparent',
                  outline: active ? '1px solid rgba(37,99,235,0.4)' : 'none',
                }}>
                  <span style={{ width:'7px', height:'7px', borderRadius:'50%', flexShrink:0,
                    background: active ? '#60a5fa' : past ? '#34d399' : '#374151' }} />
                  <span style={{ flex:1, fontSize:'11px', color: active ? '#93c5fd' : past ? '#6ee7b7' : '#6b7280' }}>
                    {ph.label}
                  </span>
                  <span style={{ fontSize:'9px', color:'#4b5563', fontFamily:'monospace' }}>{fmt(ph.t)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...box, padding:'14px' }}>
          <div style={{ fontSize:'10px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>
            Trail Colors
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {[
              ['#ff7030','Super Heavy ascent'],
              ['#ffc040','Starship ascent'],
              ['#40aaff','LEO + refueling'],
              ['#dd44ff','TLI burn'],
              ['#44ff7a','Cislunar coast'],
              ['#80c0ff','NRHO'],
              ['#ff5050','Powered descent'],
              ['#50ffaa','Lunar ascent'],
            ].map(([color, label]) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <div style={{ width:'18px', height:'3px', borderRadius:'2px', background:color }} />
                <span style={{ fontSize:'10px', color:'#9ca3af' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TECHNICAL CONTENT SECTIONS
// ════════════════════════════════════════════════════════════════════════════

function Section({ title, children }) {
  return (
    <section style={{
      background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)',
      borderRadius:'12px', padding:'24px', marginTop:'16px',
    }}>
      <h2 style={{ fontSize:'20px', fontWeight:'700', color:'#f3f4f6', marginBottom:'14px' }}>{title}</h2>
      {children}
    </section>
  );
}

function SpecTable({ rows }) {
  return (
    <table style={{ width:'100%', fontSize:'13px', color:'#d1d5db', borderCollapse:'collapse' }}>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <td style={{ padding:'8px 12px 8px 0', color:'#9ca3af', verticalAlign:'top', width:'40%' }}>{k}</td>
            <td style={{ padding:'8px 0', color:'#e5e7eb' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VehicleSpecsSection() {
  return (
    <Section title="Vehicle Architecture">
      <p style={{ color:'#9ca3af', fontSize:'13px', lineHeight:'1.65', marginBottom:'14px' }}>
        Starship is a fully reusable, two-stage methalox launch system. The HLS (Human Landing System)
        variant is optimized for the Moon: no flaps, no heat shield, mounted landing thrusters near the
        nose to avoid kicking up regolith, and an elevator for crew transfer. The architecture chooses
        full reuse + on-orbit refueling over single-launch direct injection — a fundamentally different
        bet than SLS.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>
        <div>
          <div style={{ fontSize:'11px', color:'#60a5fa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Stack</div>
          <SpecTable rows={[
            ['Total height', '121.3 m (~33-story building)'],
            ['Diameter', '9.0 m (Saturn V: 10.1 m)'],
            ['Wet mass (stack)', '~5,000 t'],
            ['Liftoff thrust', '7,590 tf (74.4 MN) — 2× Saturn V'],
            ['Payload to LEO (reusable)', '~100–150 t'],
            ['Payload to LEO (expendable)', '~250 t'],
            ['Production line', 'Starbase, TX — 1 ship/month target'],
          ]} />
        </div>
        <div>
          <div style={{ fontSize:'11px', color:'#60a5fa', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'8px' }}>Raptor 2 Engine</div>
          <SpecTable rows={[
            ['Cycle', 'Full-flow staged combustion (FFSC)'],
            ['Propellant', 'CH₄ / LOX (methalox)'],
            ['SL thrust', '230 tf'],
            ['Vacuum thrust', '258 tf'],
            ['SL ISP', '327 s'],
            ['Vacuum ISP', '380 s'],
            ['Chamber pressure', '~300 bar (Raptor 3 target: 350 bar)'],
            ['Booster engines', '33 (Block 2)'],
            ['Ship engines', '3 SL + 3 RVac'],
          ]} />
        </div>
      </div>
      <div style={{ marginTop:'18px', padding:'14px', background:'rgba(96,165,250,0.08)', borderRadius:'8px', borderLeft:'3px solid #60a5fa' }}>
        <div style={{ fontSize:'12px', color:'#93c5fd', fontWeight:'600', marginBottom:'6px' }}>Why FFSC matters</div>
        <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.55' }}>
          Full-flow staged combustion runs <em>both</em> propellants through preburners. This eliminates
          turbine seals (no fuel-rich + ox-rich mixing across a shaft), enables higher chamber pressures,
          and improves ISP. Only three FFSC engines have ever flown: the Soviet RD-270 (test only),
          NASA's IPD (test only), and Raptor — Raptor is the first to fly a payload.
        </div>
      </div>
    </Section>
  );
}

function RefuelingSection() {
  return (
    <Section title="The Refueling Architecture — Why ~14 Tanker Flights?">
      <p style={{ color:'#9ca3af', fontSize:'13px', lineHeight:'1.65', marginBottom:'14px' }}>
        Apollo went to the Moon in one launch by throwing away nearly the entire stack. Starship is fully
        reusable, but a fully-reusable Starship can only deliver ~100 t to LEO. HLS needs ~1,200 t of
        propellant in LEO to push itself to NRHO, land, and ascend. That math forces orbital refueling.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'16px' }}>
        <SpecTable rows={[
          ['HLS propellant capacity', `~${PROP_SHIP} t LCH₄ + LOX`],
          ['Tanker payload to LEO', `~${PROP_PER_TANKER} t`],
          ['Tanker flights required', `~${N_TANKERS} (modulo boil-off + margins)`],
          ['Architecture', 'Depot Starship aggregates propellant, HLS docks once'],
          ['Transfer method', 'Cryogenic propellant transfer'],
          ['Settling', 'Cold-gas RCS thrusters create artificial gravity'],
          ['Tank pressurization', 'Autogenous (boiled propellant)'],
        ]} />
        <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.65' }}>
          <div style={{ color:'#f3f4f6', fontWeight:'600', marginBottom:'8px' }}>The boil-off problem</div>
          <p>
            LOX boils at 90 K, LCH₄ at 110 K. Solar heating in LEO causes continuous boil-off — every
            day in orbit, depot propellant evaporates. SpaceX's mitigations:
          </p>
          <ul style={{ marginTop:'8px', paddingLeft:'18px', listStyle:'disc' }}>
            <li>Multi-layer insulation (MLI) blankets on tank walls</li>
            <li>Sun-shading the depot in a fixed solar attitude</li>
            <li>Active cryocoolers to re-liquefy boil-off (concept)</li>
            <li>Methalox over hydrolox: critical point 191 K vs 33 K, much easier to keep liquid</li>
          </ul>
          <p style={{ marginTop:'10px' }}>
            <em>Methalox vs hydrolox is the unsung win.</em> Apollo and SLS use hydrolox: better ISP but
            LH₂ density 71 kg/m³ vs LCH₄'s 422 kg/m³ → tanks 6× smaller, much less boil-off, ISRU-able on
            Mars (Sabatier: CO₂ + 4H₂ → CH₄ + 2H₂O).
          </p>
        </div>
      </div>

      <div style={{ padding:'14px', background:'rgba(168,85,247,0.08)', borderRadius:'8px', borderLeft:'3px solid #a855f7' }}>
        <div style={{ fontSize:'12px', color:'#d8b4fe', fontWeight:'600', marginBottom:'6px' }}>Depot vs direct tanker</div>
        <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.55' }}>
          Two architectures: (1) tanker-to-HLS direct, requiring ~14 rendezvous each with HLS, or
          (2) a depot Starship that tankers fill, then HLS docks once. SpaceX has publicly favored the
          depot approach since 2022 — it amortizes boil-off insulation onto a single dedicated vehicle
          and means HLS only does one rendezvous, simplifying flight ops for the human-rated vehicle.
        </div>
      </div>
    </Section>
  );
}

function NRHOSection() {
  return (
    <Section title="Why NRHO? — The 9:2 Resonant Halo Orbit">
      <p style={{ color:'#9ca3af', fontSize:'13px', lineHeight:'1.65', marginBottom:'14px' }}>
        NRHO (Near-Rectilinear Halo Orbit) is a family of orbits around the Earth-Moon L₂ Lagrange point.
        Artemis specifically uses an L₂ Southern NRHO with perilune ~3,200 km and apolune ~70,000 km
        above the lunar surface. It's not just a clever choice — it's enabling.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
        <SpecTable rows={[
          ['Perilune altitude', '~3,200 km'],
          ['Apolune altitude', '~70,000 km'],
          ['Orbital period', '~6.5 days (real; 7.8 d Keplerian)'],
          ['Inclination', '~50–90° (polar, varies in family)'],
          ['Resonance', '9:2 with lunar synodic month'],
          ['Stationkeeping ΔV', '~5–15 m/s/year'],
          ['NRHO insertion ΔV from TLI', '~0.45 km/s (vs LLO ~0.9 km/s)'],
          ['Surface access ΔV from NRHO', '~2.5 km/s (descent)'],
        ]} />
        <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.65' }}>
          <div style={{ color:'#f3f4f6', fontWeight:'600', marginBottom:'8px' }}>What "9:2 resonance" buys you</div>
          <p>
            In the time the Moon orbits Earth twice (relative to the Sun — one synodic period is 29.5
            days), NRHO completes exactly 9 revolutions: 9 × 6.5 ≈ 58.5 ≈ 2 × 29.5. This phase-locks
            the orbit to the Sun-Earth-Moon geometry and means:
          </p>
          <ul style={{ marginTop:'8px', paddingLeft:'18px', listStyle:'disc' }}>
            <li><strong>No lunar/Earth eclipses</strong> — the orbit threads between shadow cones</li>
            <li><strong>Continuous Earth communication</strong> — never occluded by the Moon</li>
            <li><strong>Cheap stationkeeping</strong> — quasi-stable in the 3-body problem</li>
            <li><strong>Accessible from anywhere on the lunar surface</strong> — including the polar regions where Artemis wants to land</li>
          </ul>
          <p style={{ marginTop:'10px' }}>
            Apollo used LLO (low lunar orbit, ~100 km circular). LLO requires more ΔV to reach from TLI,
            is gravitationally unstable due to lunar mascons, and loses comm whenever the orbiter is
            behind the Moon. NRHO trades those problems for a longer descent — worth it for Gateway.
          </p>
        </div>
      </div>
    </Section>
  );
}

function DeltaVSection() {
  return (
    <Section title="ΔV Budget — How Starship Compares">
      <p style={{ color:'#9ca3af', fontSize:'13px', lineHeight:'1.65', marginBottom:'14px' }}>
        The total ΔV from LEO to lunar surface and back is ~9–10 km/s. Starship's reusability tax — that
        100 t of LEO payload — means it cannot do this on the propellant it lifts itself. Refueling
        in LEO unlocks Earth-escape ΔV by treating LEO as a propellant well.
      </p>
      <table style={{ width:'100%', fontSize:'13px', color:'#d1d5db', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.15)' }}>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#9ca3af', fontWeight:'600' }}>Maneuver</th>
            <th style={{ padding:'10px 8px', textAlign:'right', color:'#9ca3af', fontWeight:'600' }}>ΔV (km/s)</th>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#9ca3af', fontWeight:'600' }}>Vehicle</th>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#9ca3af', fontWeight:'600' }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['LEO insertion', '~9.4', 'Booster + Ship', 'Includes gravity & drag losses'],
            ['LEO → TLI', '~3.1', 'HLS (after refuel)', 'Equivalent to direct Hohmann to Moon'],
            ['TLI → NRHO insertion', '~0.45', 'HLS', 'Much cheaper than LLO (~0.9)'],
            ['NRHO → descent ellipse', '~0.05', 'HLS', 'DOI burn at apolune'],
            ['Powered descent', '~2.0', 'HLS', 'From 15 km to soft touchdown'],
            ['Lunar ascent', '~1.9', 'HLS', 'Surface → NRHO insertion'],
            ['NRHO insertion (return)', '~0.5', 'HLS', 'Rendezvous with Orion'],
          ].map((row, i) => (
            <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding:'8px', color:'#e5e7eb' }}>{row[0]}</td>
              <td style={{ padding:'8px', textAlign:'right', color:'#fbbf24', fontFamily:'monospace' }}>{row[1]}</td>
              <td style={{ padding:'8px', color:'#9ca3af' }}>{row[2]}</td>
              <td style={{ padding:'8px', color:'#9ca3af', fontSize:'12px' }}>{row[3]}</td>
            </tr>
          ))}
          <tr style={{ borderTop:'2px solid rgba(255,255,255,0.15)', background:'rgba(96,165,250,0.06)' }}>
            <td style={{ padding:'10px 8px', fontWeight:'600', color:'#f3f4f6' }}>HLS total (LEO → NRHO → surface → NRHO)</td>
            <td style={{ padding:'10px 8px', textAlign:'right', color:'#fbbf24', fontFamily:'monospace', fontWeight:'700' }}>~8.0</td>
            <td style={{ padding:'10px 8px' }}></td>
            <td style={{ padding:'10px 8px', color:'#9ca3af', fontSize:'12px' }}>Requires full ~1,200 t methalox load</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop:'14px', fontSize:'12px', color:'#9ca3af', lineHeight:'1.6' }}>
        With Raptor's 380 s vacuum ISP, the rocket equation says HLS needs a mass ratio of
        e^(8000/(380·9.81)) ≈ 8.6× — i.e., 1 kg of dry mass per 8.6 kg of stack at burnout. That's why
        the dry mass of HLS (~100 t) gets paired with ~1,200 t of propellant. There's no slack.
      </div>
    </Section>
  );
}

function InnovationsSection() {
  return (
    <Section title="Engineering Innovations">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
        <div>
          <div style={{ color:'#f3f4f6', fontWeight:'600', marginBottom:'6px', fontSize:'14px' }}>Hot Staging (IFT-4, June 2024)</div>
          <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.6' }}>
            Stage separation while the booster's center 3 engines are still firing — Soviet-style.
            Ship lights all 6 Raptors before the booster stops thrusting, eliminating the ullage and
            settling deadtime of cold staging. Yields ~10% more payload to LEO. Required a vented
            hot staging ring (added between booster and ship in Block 2) to channel ship exhaust.
          </div>
        </div>
        <div>
          <div style={{ color:'#f3f4f6', fontWeight:'600', marginBottom:'6px', fontSize:'14px' }}>Mechazilla Chopstick Catch (IFT-5, Oct 2024)</div>
          <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.6' }}>
            Super Heavy returns directly to the launch tower and is caught mid-air by two articulated
            arms. Saves ~20 t of landing legs, eliminates a separate landing pad, and allows the same
            tower to lift the booster back onto a new ship — same-day reuse target. Catch tolerance:
            ~1 m radial, ~50 cm/s descent velocity.
          </div>
        </div>
        <div>
          <div style={{ color:'#f3f4f6', fontWeight:'600', marginBottom:'6px', fontSize:'14px' }}>Methalox Choice (vs Hydrolox)</div>
          <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.6' }}>
            Lower ISP than hydrolox (380 s vs 450 s) but: (1) 6× denser → smaller tanks → lower dry
            mass, (2) doesn't embrittle steel → cheap structural steel instead of aluminum-lithium,
            (3) easier cryo storage, (4) <strong>producible on Mars</strong> from CO₂ + H₂O via the
            Sabatier process — the whole Starship architecture is downstream of this choice.
          </div>
        </div>
        <div>
          <div style={{ color:'#f3f4f6', fontWeight:'600', marginBottom:'6px', fontSize:'14px' }}>Lunar Regolith Mitigation</div>
          <div style={{ fontSize:'12px', color:'#cbd5e1', lineHeight:'1.6' }}>
            Apollo's descent engines blasted regolith hundreds of meters laterally, damaging Surveyor 3.
            Starship HLS mounts its terminal descent thrusters ~30 m up the body so the exhaust plume
            spreads before reaching the surface. Trade-off: heavier vehicle, but no dust contamination
            of solar panels, no fouling of surface samples, no risk to nearby assets.
          </div>
        </div>
      </div>
    </Section>
  );
}

function OpenChallengesSection() {
  return (
    <Section title="Open Engineering Challenges">
      <div style={{ fontSize:'13px', color:'#cbd5e1', lineHeight:'1.65' }}>
        <p>
          Public technical risks and what they imply:
        </p>
        <ul style={{ marginTop:'10px', paddingLeft:'20px', listStyle:'disc' }}>
          <li style={{ marginBottom:'8px' }}>
            <strong style={{ color:'#fbbf24' }}>Cryogenic propellant transfer at scale.</strong> NASA's
            CRYOTE and Robotic Refueling Mission-3 have demonstrated transfer at small scale.
            Transferring 100+ tonnes through a settling-induced ullage with sub-1% loss is unprecedented.
            Probably the schedule-driving risk for Artemis III.
          </li>
          <li style={{ marginBottom:'8px' }}>
            <strong style={{ color:'#fbbf24' }}>Boil-off over multi-week storage.</strong> 14 tanker
            flights at one per week means the depot stores propellant for ~3 months. Even with MLI,
            passive boil-off is non-trivial — Artemis III may require active cooling, which has
            never flown.
          </li>
          <li style={{ marginBottom:'8px' }}>
            <strong style={{ color:'#fbbf24' }}>Raptor reliability.</strong> 33 engines on the booster
            with the loss of any 3 catastrophic to mission success. SpaceX has driven engine-out
            tolerance via redundancy, but reaching aircraft-like reliability (~10⁻⁹ failures/cycle)
            requires order-of-magnitude improvements over current ~10⁻³ per-test rate.
          </li>
          <li style={{ marginBottom:'8px' }}>
            <strong style={{ color:'#fbbf24' }}>Lunar surface integrity.</strong> Starship HLS will be
            the heaviest object ever placed on the Moon (~100 t dry). The landing pad — regolith,
            potentially with sub-surface ice — has to support that without collapsing. Bearing-pressure
            margins are being modeled but not tested at scale.
          </li>
          <li>
            <strong style={{ color:'#fbbf24' }}>Crew launch ConOps.</strong> Crew currently launches on
            SLS/Orion and rendezvous with HLS at NRHO. A "Starship for crew" path requires LES, abort
            modes during ascent, and a launch profile suitable for human ratings — none of which the
            current vehicle has demonstrated.
          </li>
        </ul>
      </div>
    </Section>
  );
}

function ComparisonSection() {
  return (
    <Section title="Architecture Comparison: Apollo · SLS/Orion · Starship HLS">
      <table style={{ width:'100%', fontSize:'13px', color:'#d1d5db', borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.15)' }}>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#9ca3af' }}></th>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#60a5fa' }}>Apollo</th>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#60a5fa' }}>SLS / Orion</th>
            <th style={{ padding:'10px 8px', textAlign:'left', color:'#60a5fa' }}>Starship HLS</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Mass to TLI', '~45 t', '~27 t', '~150 t (post-refuel)'],
            ['Mass to lunar surface', '~5 t (LM)', 'N/A (orbit only)', '~50–100 t (HLS dry + payload)'],
            ['Launches per mission', '1', '1 (crew) + multiple HLS', '1 (crew) + ~15 (HLS + tankers)'],
            ['Architecture', 'Direct ascent', 'LOR via NRHO', 'Refueled NRHO rendezvous'],
            ['Propellant', 'LH₂ + LOX / N₂O₄+UDMH', 'LH₂ + LOX', 'LCH₄ + LOX (methalox)'],
            ['Lunar surface stay', '~3 days (Apollo 17)', 'N/A', '~6.5+ days'],
            ['Cost per mission', '~$1.5B (2024 USD)', '~$4.2B', '~$2B (SpaceX target; will vary)'],
            ['Reusability', 'None', 'Orion reusable (planned)', 'Booster + Ship fully reusable'],
          ].map((row, i) => (
            <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding:'8px', color:'#9ca3af', fontWeight:'600' }}>{row[0]}</td>
              <td style={{ padding:'8px' }}>{row[1]}</td>
              <td style={{ padding:'8px' }}>{row[2]}</td>
              <td style={{ padding:'8px', color:'#f3f4f6' }}>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE ROOT
// ════════════════════════════════════════════════════════════════════════════
function StarshipLunarPage() {
  return (
    <div>
      <StarshipSimulation />
      <VehicleSpecsSection />
      <RefuelingSection />
      <NRHOSection />
      <DeltaVSection />
      <InnovationsSection />
      <OpenChallengesSection />
      <ComparisonSection />

      <div style={{
        marginTop:'24px', padding:'16px', fontSize:'12px', color:'#6b7280', lineHeight:'1.55',
        background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:'12px',
      }}>
        <strong style={{ color:'#9ca3af' }}>Note on the simulation:</strong> The trajectory uses
        analytical Keplerian mechanics with patched-conic at the lunar SOI. NRHO is rendered as a
        Moon-centered ellipse rotated to track the Earth-Moon line — in reality NRHO is a polar 3-body
        orbit that doesn't lie in the lunar orbital plane; the 2D projection here is geometrically
        suggestive rather than literal. Tanker counts, ΔV figures, and orbital parameters reflect
        publicly disclosed SpaceX and NASA Artemis III architecture documents.
      </div>
    </div>
  );
}
