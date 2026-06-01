// Starship Lunar Mission Simulation
// Architecture: Starship HLS to Moon via LEO refueling depot, NRHO insertion,
// powered descent, surface stay, ascent back to NRHO.
// Reference architecture: SpaceX HLS for Artemis III.

// Physical constants (G, M_EARTH, M_MOON, R_EARTH, R_MOON, MU_EARTH, MU_MOON,
// MOON_SMA, MOON_PERIOD, MOON_SOI) come from the shared /rocketry/constants.js,
// loaded before this script.

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

// solveKepler / keplerXY / moonOrbitXY come from the shared /rocketry/sim-core.js.

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

// Phase-locked Moon position (so the flyby / NRHO geometry lands right).
function moonPosLocked(t) {
  return moonOrbitXY(t, MOON_START);
}

// ── TLI ellipse position ──────────────────────────────────────────────────────
function tliEllipsePos(T_TRANS) {
  return keplerXY(A_TLI, E_TLI, N_TLI, T_TRANS, THETA_TLI);
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
// ROCKET VIEW — Starship / Super Heavy vehicle profile
// ════════════════════════════════════════════════════════════════════════════
// Vehicle-centric side-profile animation, styled after the Artemis II rocket
// view. The stack holds near screen centre; altitude tape + ground scroll;
// gravity-turn tilt; booster tumbles away at hot staging.
//
// Art-space convention: origin at the booster engine gimbal plane (bottom of
// the full stack). -y = up the stack; +y = engine exhaust direction.
// Units: art pixels. ART_PX = total height from nozzle exit to nosecone tip.

// Plume helper — not in sim-core.js, so defined here.
function drawPlume(ctx, x, yTop, width, length, colors, clock, seed) {
  const flick = 0.78 + 0.22 * Math.sin(clock * 1.9 + seed) * Math.cos(clock * 0.7 + seed * 2);
  const L = length * (0.85 + 0.15 * flick);
  const g = ctx.createLinearGradient(0, yTop, 0, yTop + L);
  g.addColorStop(0,    colors[0]);
  g.addColorStop(0.45, colors[1]);
  g.addColorStop(1,    colors[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, yTop);
  ctx.lineTo(x + width / 2, yTop);
  ctx.lineTo(x + width * 0.12, yTop + L);
  ctx.lineTo(x - width * 0.12, yTop + L);
  ctx.closePath();
  ctx.fill();
}

// ── Ascent keyframes (altitude km, velocity km/s vs mission time s) ───────────
const SS_ASCENT_KEYS = [
  [0,             0.0,    0.00],
  [T_MAXQ,        12,     0.45],
  [T_HOT_STAGE,   68,     1.60],
  [300,           120,    4.50],
  [T_SHIP_MECO,   150,    7.20],
  [T_LEO_INSERT,  LEO_ALT, V_LEO],
];

function ssAscentState(t) {
  const K = SS_ASCENT_KEYS;
  if (t <= K[0][0]) return { alt: K[0][1], vel: K[0][2] };
  for (let i = 0; i < K.length - 1; i++) {
    if (t <= K[i+1][0]) {
      const [t0,a0,v0] = K[i], [t1,a1,v1] = K[i+1];
      const f = (t-t0)/(t1-t0);
      return { alt: a0+f*(a1-a0), vel: v0+f*(v1-v0) };
    }
  }
  return { alt: LEO_ALT, vel: V_LEO };
}

// Altitude above Earth (km) + speed (km/s) at any mission time.
function starshipMissionState(t) {
  if (t <= T_LEO_INSERT) return ssAscentState(t);
  if (t < T_TLI) return { alt: LEO_ALT, vel: V_LEO };
  if (t <= T_LOI) {
    const p = tliEllipsePos(t - T_TLI);
    const r = Math.hypot(p.x, p.y);
    return { alt: r - R_EARTH, vel: Math.sqrt(MU_EARTH * (2/r - 1/A_TLI)) };
  }
  // Lunar phases: use vehiclePos for Earth-relative distance
  const vp = vehiclePos(t);
  const r   = Math.hypot(vp.x, vp.y);
  const rM  = Math.hypot(vp.x - vp.moon.x, vp.y - vp.moon.y);
  let vel;
  if      (t <= T_DOI)        vel = Math.sqrt(MU_MOON * (2/rM - 1/NRHO_A));
  else if (t <= T_LANDING)    vel = 1.8 * Math.max(0, 1 - (t-T_DOI)/(T_LANDING-T_DOI));
  else if (t <= T_SURFACE_END) vel = 0;
  else if (t <= T_NRHO_RV)    vel = 1.8 * (t-T_SURFACE_END)/(T_NRHO_RV-T_SURFACE_END);
  else                        vel = Math.sqrt(MU_MOON * (2/rM - 1/NRHO_A));
  return { alt: r - R_EARTH, vel };
}

// ── Vehicle art dimensions ────────────────────────────────────────────────────
const SSHIP = {
  // Super Heavy booster (y=0 at engine gimbal → y=-228 at top)
  boosterW:    30,
  boosterTop:  -228,
  // Hot staging ring (sits on top of booster, part of booster stack)
  hstageW:     36,
  hstageTop:   -246,   // top of ring
  // Starship ship body
  shipW:       28,
  shipBottom:  -258,   // bottom of ship (above ring gap)
  shipBodyTop: -400,   // where nosecone taper begins
  shipNoseTip: -440,   // nosecone tip
  // Aft flaps (large delta wings near ship bottom, one per side)
  aftFlapBotY: -270,
  aftFlapTopY: -316,
  aftFlapSpan: 26,
  // Forward canards (smaller, near nosecone)
  fwdFlapBotY: -382,
  fwdFlapTopY: -400,
  fwdFlapSpan: 14,
};

// ── Plume helper (re-declared local so it doesn't collide with SLS version) ───
// The sim-core version is defined globally; we reuse it directly (drawPlume).

function drawSSBooster(ctx, burning, flick) {
  const S = SSHIP;
  if (burning) {
    // 33-Raptor plume: wide + bright core
    drawPlume(ctx, 0, 10, 34, 210,
      ['rgba(255,248,200,0.95)', 'rgba(255,145,30,0.75)', 'rgba(255,50,5,0)'], flick, 0);
    drawPlume(ctx, 0, 10, 11, 265,
      ['rgba(255,255,255,0.95)', 'rgba(210,228,255,0.5)', 'rgba(210,228,255,0)'], flick, 8);
  }
  // Engine nozzle cluster (5 visible from side)
  ctx.fillStyle = '#1c1e22';
  for (const ex of [-12, -6, 0, 6, 12]) {
    ctx.beginPath();
    ctx.moveTo(ex-2.5, 0); ctx.lineTo(ex+2.5, 0);
    ctx.lineTo(ex+4,   10); ctx.lineTo(ex-4,   10);
    ctx.closePath(); ctx.fill();
  }
  // Thrust structure (slight flare at base)
  ctx.fillStyle = '#2a2c30';
  ctx.beginPath();
  ctx.moveTo(-S.boosterW/2-3, 0); ctx.lineTo(S.boosterW/2+3, 0);
  ctx.lineTo( S.boosterW/2, -16); ctx.lineTo(-S.boosterW/2, -16);
  ctx.closePath(); ctx.fill();
  // Stainless steel body
  const bg = ctx.createLinearGradient(-S.boosterW/2, 0, S.boosterW/2, 0);
  bg.addColorStop(0,   '#686a70');
  bg.addColorStop(0.35,'#b8bcc2');
  bg.addColorStop(0.62,'#d8dce2');
  bg.addColorStop(1,   '#5e6068');
  ctx.fillStyle = bg;
  ctx.fillRect(-S.boosterW/2, S.boosterTop, S.boosterW, -16 - S.boosterTop);
  // Weld ring details
  ctx.strokeStyle = 'rgba(70,72,82,0.45)';
  ctx.lineWidth = 1.2;
  for (const wy of [-50, -100, -150, -200]) {
    ctx.beginPath();
    ctx.moveTo(-S.boosterW/2, wy); ctx.lineTo(S.boosterW/2, wy); ctx.stroke();
  }
  // Grid fins (2 visible, near top)
  const gfY = S.boosterTop + 8, gfH = 28, gfW = 14;
  ctx.fillStyle = '#80838a';
  ctx.fillRect(-S.boosterW/2 - gfW, gfY, gfW, gfH);
  ctx.fillRect( S.boosterW/2,       gfY, gfW, gfH);
  ctx.strokeStyle = 'rgba(30,32,36,0.5)'; ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const gy = gfY + i * gfH / 3;
    ctx.beginPath(); ctx.moveTo(-S.boosterW/2-gfW, gy); ctx.lineTo(-S.boosterW/2, gy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( S.boosterW/2,     gy); ctx.lineTo( S.boosterW/2+gfW, gy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-S.boosterW/2-gfW/2, gfY); ctx.lineTo(-S.boosterW/2-gfW/2, gfY+gfH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( S.boosterW/2+gfW/2, gfY); ctx.lineTo( S.boosterW/2+gfW/2, gfY+gfH); ctx.stroke();
  // Hot staging ring at top of booster
  const hg = ctx.createLinearGradient(-S.hstageW/2, 0, S.hstageW/2, 0);
  hg.addColorStop(0, '#48494f'); hg.addColorStop(0.5, '#80838a'); hg.addColorStop(1, '#40424a');
  ctx.fillStyle = hg;
  ctx.fillRect(-S.hstageW/2, S.boosterTop, S.hstageW, S.hstageTop - S.boosterTop);
  // Vent slots on ring
  ctx.fillStyle = 'rgba(14,14,18,0.7)';
  for (const vx of [-12, -4, 4, 12]) {
    ctx.fillRect(vx - 2, S.boosterTop + 2, 4, 10);
  }
}

function drawSSShip(ctx, burning, flick) {
  const S = SSHIP;
  // Ship Raptor nozzles and plumes (engines at ship bottom, plume extends downward = +y)
  if (burning) {
    drawPlume(ctx, 0, S.shipBottom+9, 18, 110,
      ['rgba(200,218,255,0.9)', 'rgba(140,172,255,0.5)', 'rgba(140,172,255,0)'], flick, 4);
    drawPlume(ctx, 0, S.shipBottom+9, 6,  140,
      ['rgba(255,255,255,0.95)', 'rgba(200,218,255,0.4)', 'rgba(200,218,255,0)'], flick, 11);
  }
  // 3 sea-level Raptors (center)
  ctx.fillStyle = '#202226';
  for (const ex of [-9, 0, 9]) {
    ctx.beginPath();
    ctx.moveTo(ex-2, S.shipBottom+2); ctx.lineTo(ex+2, S.shipBottom+2);
    ctx.lineTo(ex+3.5, S.shipBottom+11); ctx.lineTo(ex-3.5, S.shipBottom+11);
    ctx.closePath(); ctx.fill();
  }
  // 2 vacuum Raptors (wider bell, outer)
  ctx.fillStyle = '#181a1e';
  for (const ex of [-16, 16]) {
    ctx.beginPath();
    ctx.moveTo(ex-2, S.shipBottom+2); ctx.lineTo(ex+2, S.shipBottom+2);
    ctx.lineTo(ex+5.5, S.shipBottom+13); ctx.lineTo(ex-5.5, S.shipBottom+13);
    ctx.closePath(); ctx.fill();
  }
  // Ship body (stainless steel)
  const sg = ctx.createLinearGradient(-S.shipW/2, 0, S.shipW/2, 0);
  sg.addColorStop(0,   '#686a70');
  sg.addColorStop(0.3, '#b8bcc2');
  sg.addColorStop(0.62,'#d8dce2');
  sg.addColorStop(1,   '#5e6068');
  ctx.fillStyle = sg;
  ctx.fillRect(-S.shipW/2, S.shipBodyTop, S.shipW, S.shipBottom - S.shipBodyTop);
  // Weld rings
  ctx.strokeStyle = 'rgba(70,72,82,0.4)'; ctx.lineWidth = 1.2;
  for (const wy of [-278, -308, -338, -368]) {
    ctx.beginPath(); ctx.moveTo(-S.shipW/2, wy); ctx.lineTo(S.shipW/2, wy); ctx.stroke();
  }
  // Aft flaps (large delta wings)
  const af = (sign) => {
    ctx.beginPath();
    ctx.moveTo(sign * S.shipW/2, S.aftFlapBotY);
    ctx.lineTo(sign * (S.shipW/2 + S.aftFlapSpan), (S.aftFlapBotY + S.aftFlapTopY) / 2);
    ctx.lineTo(sign * S.shipW/2, S.aftFlapTopY);
    ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = '#64666c';
  af(1); af(-1);
  // Forward canards
  const fc = (sign) => {
    ctx.beginPath();
    ctx.moveTo(sign * S.shipW/2, S.fwdFlapBotY);
    ctx.lineTo(sign * (S.shipW/2 + S.fwdFlapSpan), (S.fwdFlapBotY + S.fwdFlapTopY) / 2);
    ctx.lineTo(sign * S.shipW/2, S.fwdFlapTopY);
    ctx.closePath(); ctx.fill();
  };
  ctx.fillStyle = '#787a80';
  fc(1); fc(-1);
  // Nosecone
  const ng = ctx.createLinearGradient(-S.shipW/2, 0, S.shipW/2, 0);
  ng.addColorStop(0,   '#5c5e64');
  ng.addColorStop(0.38,'#b0b4ba');
  ng.addColorStop(0.65,'#ccd0d6');
  ng.addColorStop(1,   '#545658');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(-S.shipW/2, S.shipBodyTop);
  ctx.lineTo( S.shipW/2, S.shipBodyTop);
  ctx.lineTo(0, S.shipNoseTip);
  ctx.closePath(); ctx.fill();
  // Header-tank dome (small bulge just below nosecone)
  ctx.fillStyle = 'rgba(96,100,112,0.55)';
  ctx.beginPath();
  ctx.arc(0, S.shipBodyTop + 10, S.shipW * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// ════════════════════════════════════════════════════════════════════════════
// ROCKET-VIEW SCENES — orbital refueling + lunar surface operations
// ════════════════════════════════════════════════════════════════════════════
// Once the stack leaves the atmosphere the true-to-scale camera dollies it down
// to a marker. To keep the rocket view interesting through the long mid-mission
// phases, two dedicated scenes take over the canvas: the LEO tanker-refueling
// depot, and the lunar landing → surface-operations → ascent sequence.

function fmtAltKm(a) {
  return a < 1    ? Math.round(a * 1000) + ' m'
       : a < 100  ? a.toFixed(1) + ' km'
       : a < 1000 ? Math.round(a) + ' km'
       : a < 1e6  ? (a / 1000).toFixed(a < 1e4 ? 1 : 0) + 'k km'
       :            (a / 1e6).toFixed(2) + 'M km';
}

function sceneStars(ctx, W, H, n) {
  for (let i = 0; i < n; i++) {
    const sx = ((Math.sin(i * 7.31 + 0.4) + 1) / 2) * W;
    const sy = ((Math.cos(i * 13.71 + 1.1) + 1) / 2) * H;
    const br = 0.18 + 0.7 * ((i * 37 % 100) / 100);
    ctx.fillStyle = `rgba(255,255,255,${br.toFixed(2)})`;
    ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }
}

function drawScenePanel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,10,20,0.62)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
}

// Big curved Earth limb across the bottom (LEO refuel scene).
function drawEarthLimbBottom(ctx, W, H) {
  const R  = W * 1.7;
  const cx = W * 0.5, cy = H + R - H * 0.20;
  const ag = ctx.createRadialGradient(cx, cy, R, cx, cy, R + 70);
  ag.addColorStop(0, 'rgba(120,180,255,0.45)');
  ag.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(cx, cy, R + 70, 0, Math.PI * 2); ctx.fill();
  const eg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.25, R * 0.2, cx, cy, R);
  eg.addColorStop(0, '#2f6fd0'); eg.addColorStop(0.7, '#1b4a93'); eg.addColorStop(1, '#0c2c5e');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(225,233,242,0.16)';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.16;
    const px = cx + Math.cos(a) * (R - 9), py = cy + Math.sin(a) * (R - 9);
    ctx.beginPath(); ctx.ellipse(px, py, 28, 9, a, 0, Math.PI * 2); ctx.fill();
  }
}

// Small Earth disk hanging in the black lunar sky.
function drawEarthDiskSky(ctx, x, y, r) {
  const gl = ctx.createRadialGradient(x, y, r, x, y, r + 9);
  gl.addColorStop(0, 'rgba(120,170,255,0.4)'); gl.addColorStop(1, 'rgba(120,170,255,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.15, x, y, r);
  g.addColorStop(0, '#3a7fe0'); g.addColorStop(0.65, '#1d4f9b'); g.addColorStop(1, '#0a2550');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(220,235,245,0.22)';
  ctx.beginPath(); ctx.ellipse(x - 2, y + 1, r * 0.6, r * 0.32, 0.5, 0, Math.PI * 2); ctx.fill();
}

// ── Unified Starship profile (origin at engine plane, nose up = -y) ───────────
// variant 'tanker' → aft flaps + forward canards;
// variant 'hls'    → solar-panel band, high-mounted landing thrusters, no flaps,
//                    optional landing legs + crew elevator.
function drawShip(ctx, opts) {
  const o = opts || {};
  const variant = o.variant || 'tanker';
  const flick = o.flick || 0;
  const W2 = 15, bodyTop = -150, noseTip = -186;

  // Main-engine plume (ascent / boostback)
  if (o.burning) {
    drawPlume(ctx, 0, 11, 18, 122,
      ['rgba(210,224,255,0.9)', 'rgba(150,180,255,0.5)', 'rgba(150,180,255,0)'], flick, 4);
    drawPlume(ctx, 0, 11, 6, 152,
      ['rgba(255,255,255,0.95)', 'rgba(210,224,255,0.4)', 'rgba(210,224,255,0)'], flick, 11);
  }
  // High-mounted landing-thruster plumes (HLS final descent) — angled down/out
  if (o.thrusterBurn && variant === 'hls') {
    for (const sgn of [-1, 1]) {
      ctx.save();
      ctx.translate(sgn * (W2 + 1), -104);
      ctx.rotate(sgn * 0.42);
      drawPlume(ctx, 0, 0, 9, 72,
        ['rgba(225,236,255,0.95)', 'rgba(150,185,255,0.6)', 'rgba(150,185,255,0)'], flick, sgn * 3);
      ctx.restore();
    }
  }
  // Engines (3 SL + 2 vac)
  if (o.engines !== false) {
    ctx.fillStyle = '#202226';
    for (const ex of [-9, 0, 9]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, 2); ctx.lineTo(ex + 2, 2);
      ctx.lineTo(ex + 3.5, 11); ctx.lineTo(ex - 3.5, 11);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#181a1e';
    for (const ex of [-15, 15]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2, 2); ctx.lineTo(ex + 2, 2);
      ctx.lineTo(ex + 5, 13); ctx.lineTo(ex - 5, 13);
      ctx.closePath(); ctx.fill();
    }
  }
  // Body (stainless steel)
  const sg = ctx.createLinearGradient(-W2, 0, W2, 0);
  sg.addColorStop(0, '#686a70'); sg.addColorStop(0.3, '#b8bcc2');
  sg.addColorStop(0.62, '#d8dce2'); sg.addColorStop(1, '#5e6068');
  ctx.fillStyle = sg;
  ctx.fillRect(-W2, bodyTop, 2 * W2, -bodyTop);
  // Weld rings
  ctx.strokeStyle = 'rgba(70,72,82,0.4)'; ctx.lineWidth = 1.1;
  for (let wy = -20; wy > bodyTop; wy -= 26) {
    ctx.beginPath(); ctx.moveTo(-W2, wy); ctx.lineTo(W2, wy); ctx.stroke();
  }

  if (variant === 'tanker') {
    const flap = (sgn, y0, y1, span) => {
      ctx.beginPath();
      ctx.moveTo(sgn * W2, y0);
      ctx.lineTo(sgn * (W2 + span), (y0 + y1) / 2);
      ctx.lineTo(sgn * W2, y1);
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = '#64666c'; flap(1, -10, -46, 20); flap(-1, -10, -46, 20);
    ctx.fillStyle = '#787a80'; flap(1, -120, -146, 11); flap(-1, -120, -146, 11);
  } else {
    // HLS solar-panel band near top
    ctx.fillStyle = 'rgba(18,26,58,0.94)';
    ctx.fillRect(-W2, -150, 2 * W2, 30);
    ctx.strokeStyle = 'rgba(90,120,200,0.35)'; ctx.lineWidth = 0.8;
    for (let pc = -W2 + 5; pc < W2; pc += 6) {
      ctx.beginPath(); ctx.moveTo(pc, -150); ctx.lineTo(pc, -120); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-W2, -135); ctx.lineTo(W2, -135); ctx.stroke();
    // High-mounted landing-thruster pods
    ctx.fillStyle = '#3a3c42';
    ctx.fillRect(-W2 - 4, -110, 5, 12); ctx.fillRect(W2 - 1, -110, 5, 12);
  }

  // Nosecone
  const ng = ctx.createLinearGradient(-W2, 0, W2, 0);
  ng.addColorStop(0, '#5c5e64'); ng.addColorStop(0.4, '#b0b4ba');
  ng.addColorStop(0.66, '#ccd0d6'); ng.addColorStop(1, '#545658');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(-W2, bodyTop); ctx.lineTo(W2, bodyTop); ctx.lineTo(0, noseTip);
  ctx.closePath(); ctx.fill();

  // Landing legs (HLS)
  if (variant === 'hls' && o.legs > 0) {
    const d = Math.min(1, o.legs);
    ctx.strokeStyle = '#9498a0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      const footX = sgn * (10 + 20 * d), footY = 7 * d;
      ctx.beginPath(); ctx.moveTo(sgn * W2 * 0.6, -12); ctx.lineTo(footX, footY); ctx.stroke();
      ctx.fillStyle = '#9498a0'; ctx.fillRect(footX - 5, footY - 1, 10, 3);
    }
    ctx.lineCap = 'butt';
  }
  // Crew elevator (HLS)
  if (variant === 'hls' && o.elevator > 0) {
    const hatchY = -54, platY = hatchY + o.elevator * 52, platX = -W2 - 11;
    ctx.strokeStyle = 'rgba(184,188,194,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-W2, hatchY); ctx.lineTo(platX + 10, platY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-W2, hatchY); ctx.lineTo(platX, platY); ctx.stroke();
    ctx.fillStyle = 'rgba(10,12,16,0.85)'; ctx.fillRect(-W2 - 1, hatchY - 7, 3, 14);
    ctx.fillStyle = '#c2c6cc'; ctx.fillRect(platX - 2, platY, 16, 3);
  }
}

// ── LEO orbital refueling scene ───────────────────────────────────────────────
function drawRefuelScene(ctx, W, H, t) {
  const flick = performance.now() / 1000;
  ctx.fillStyle = '#03030a'; ctx.fillRect(0, 0, W, H);
  sceneStars(ctx, W, H, 220);
  drawEarthLimbBottom(ctx, W, H);

  // Illustrative cadence: keep a tanker docked for most of each delivery cycle so
  // the refuelling is visible whenever the clock sits anywhere in the campaign.
  const campaign  = t >= T_TANKER_BEGIN && t < T_TANKER_END;
  const cycle     = (T_TANKER_END - T_TANKER_BEGIN) / N_TANKERS;
  const cyclePos  = campaign ? ((t - T_TANKER_BEGIN) % cycle) / cycle : 0;
  const docked    = campaign && cyclePos < 0.86;
  const approach  = (campaign && !docked) || (t >= T_LEO_INSERT && t < T_TANKER_BEGIN);
  const xferFrac  = docked ? cyclePos / 0.86 : 0;
  const tankerNum = campaign ? Math.min(N_TANKERS, Math.floor((t - T_TANKER_BEGIN) / cycle) + 1) : 0;
  const prog      = t >= T_TANKER_END ? 1 : campaign ? (t - T_TANKER_BEGIN) / (T_TANKER_END - T_TANKER_BEGIN) : 0;
  const fillFrac  = Math.max(0, Math.min(1, prog));

  const cx = W * 0.40, joinY = H * 0.46, s = 0.82, BW = 15 * s;
  const bodyTopY = joinY - 150 * s;       // depot body top (art -150)
  const noseTopY = joinY - 186 * s;       // depot nose tip

  // Depot tank fill (settled against the aft/join — grows upward over campaign)
  ctx.fillStyle = 'rgba(90,200,255,0.26)';
  ctx.fillRect(cx - BW, joinY - 150 * s * fillFrac, 2 * BW, 150 * s * fillFrac);

  // Depot (HLS) above the join, nose up
  ctx.save();
  ctx.translate(cx, joinY); ctx.scale(s, s);
  drawShip(ctx, { variant: 'hls', engines: !docked, flick });
  ctx.restore();

  if (docked) {
    // Tanker remaining propellant (settled against the join — drains downward)
    ctx.fillStyle = 'rgba(90,200,255,0.22)';
    ctx.fillRect(cx - BW, joinY, 2 * BW, 150 * s * (1 - xferFrac));
    // Tanker below the join, inverted (nose down), aft-to-aft
    ctx.save();
    ctx.translate(cx, joinY); ctx.scale(s, -s);
    drawShip(ctx, { variant: 'tanker', engines: false, flick });
    ctx.restore();
    // Docking collar
    ctx.fillStyle = '#34363c'; ctx.fillRect(cx - 20 * s, joinY - 9, 40 * s, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - 20 * s, joinY - 1, 40 * s, 2);
    // Transfer glow + flowing propellant droplets (tanker → depot)
    const fg = ctx.createRadialGradient(cx, joinY, 0, cx, joinY, 22);
    fg.addColorStop(0, 'rgba(120,210,255,0.5)'); fg.addColorStop(1, 'rgba(120,210,255,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, joinY, 22, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const ph = (flick * 0.8 + i / 5) % 1;
      const yy = joinY + 18 - ph * 36;
      ctx.fillStyle = `rgba(150,220,255,${(0.8 * (1 - Math.abs(ph - 0.5) * 1.4)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx + Math.sin(i * 2.1) * 3, yy, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    // Settling RCS puffs at the depot nose
    const pn = (Math.sin(flick * 3) + 1) / 2;
    ctx.fillStyle = `rgba(220,235,255,${(0.25 + 0.25 * pn).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cx - BW - 4, bodyTopY + 22, 2 + pn * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + BW + 4, bodyTopY + 22, 2 + pn * 1.5, 0, Math.PI * 2); ctx.fill();
    // Labels
    ctx.fillStyle = 'rgba(200,210,225,0.6)'; ctx.font = '9px monospace';
    ctx.fillText('TANKER', cx - 18, joinY + 188 * s + 12);
  } else if (approach) {
    // Next tanker climbing from Earth toward the depot
    const bob = (Math.sin(flick * 0.6) + 1) / 2;
    const tx = W * 0.66, ty = H * 0.74 - bob * 12;
    ctx.save(); ctx.translate(tx, ty); ctx.scale(0.34, 0.34);
    drawShip(ctx, { variant: 'tanker', burning: true, flick });
    ctx.restore();
    ctx.fillStyle = 'rgba(175,192,212,0.7)'; ctx.font = '9px monospace';
    ctx.fillText('tanker inbound', tx - 32, ty + 30);
  }

  ctx.fillStyle = 'rgba(200,210,225,0.6)'; ctx.font = '9px monospace';
  ctx.fillText('HLS DEPOT', cx - 26, noseTopY - 6);

  // ── Readout panel ──
  const px = 14, py = 14;
  drawScenePanel(ctx, px, py, 232, 150);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('ALTITUDE', px + 14, py + 22);
  ctx.fillText('VELOCITY', px + 126, py + 22);
  ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 19px monospace';
  ctx.fillText('300 km', px + 14, py + 42);
  ctx.fillStyle = '#34d399'; ctx.font = 'bold 19px monospace';
  ctx.fillText('7.73', px + 126, py + 42);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('km/s', px + 170, py + 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(px + 12, py + 54); ctx.lineTo(px + 220, py + 54); ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('ORBITAL REFUELING', px + 14, py + 70);

  let statusMain, statusSub;
  if (docked)        { statusMain = `Tanker ${tankerNum} of ~${N_TANKERS} docked`;            statusSub = 'Cryo methalox transfer · aft-to-aft'; }
  else if (prog >= 1){ statusMain = 'Refueling complete';                                    statusSub = 'Full load · preparing for TLI'; }
  else if (campaign) { statusMain = `Tanker ${Math.min(N_TANKERS, tankerNum + 1)} inbound`;  statusSub = 'Previous tanker departing · depot venting'; }
  else               { statusMain = 'Awaiting tanker fleet';                                 statusSub = 'Depot holding attitude · sun-shaded'; }
  ctx.fillStyle = '#e5e7eb'; ctx.font = '11px monospace'; ctx.fillText(statusMain, px + 14, py + 88);
  ctx.fillStyle = '#5b616b'; ctx.font = '9px monospace';  ctx.fillText(statusSub, px + 14, py + 102);
  ctx.fillStyle = '#9ca3af'; ctx.font = '10px monospace';
  ctx.fillText(`Depot load: ${Math.round(fillFrac * PROP_SHIP)} / ${PROP_SHIP} t`, px + 14, py + 122);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(px + 14, py + 130, 204, 7);
  ctx.fillStyle = '#50c8ff'; ctx.fillRect(px + 14, py + 130, 204 * fillFrac, 7);

  ctx.fillStyle = 'rgba(180,190,210,0.55)'; ctx.font = '9px monospace';
  ctx.fillText('LOW EARTH ORBIT · ~300 km', 14, H - 12);

  // ── Flashes ──
  const flash = (lbl, a, color) => {
    ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = `${color},${a.toFixed(2)})`;
    ctx.fillText(lbl, W / 2, 40); ctx.textAlign = 'left';
  };
  if (t < T_LEO_INSERT + 600)
    flash('✦ DEPOT IN LEO — AWAITING TANKER FLEET', 1 - (t - T_LEO_INSERT) / 600, 'rgba(150,200,255');
  else if (t >= T_REFUEL_DONE && t < T_REFUEL_DONE + 1800)
    flash('✦ REFUELING COMPLETE — FULL METHALOX LOAD', 1 - (t - T_REFUEL_DONE) / 1800, 'rgba(120,230,180');
}

// ── Lunar surface state (altitude above Moon, speed, sub-phase) ───────────────
function lunarSurfaceState(t) {
  if (t < T_LANDING) {
    const p = descentPos(t);
    const altMoon = Math.max(0, p.rMoon - R_MOON);
    const f = Math.min(1, Math.max(0, (t - T_PD_START) / (T_LANDING - T_PD_START)));
    return { altMoon, vel: Math.max(0, 1.6 * (1 - f)), phase: 'descent' };
  }
  if (t < T_SURFACE_END) return { altMoon: 0, vel: 0, phase: 'surface' };
  const p = ascentPos(t);
  const altMoon = Math.max(0, p.rMoon - R_MOON);
  const f = Math.min(1, Math.max(0, (t - T_SURFACE_END) / (T_ASCENT_END - T_SURFACE_END)));
  return { altMoon, vel: 1.74 * f, phase: 'ascent' };
}

function drawLunarCraters(ctx, W, groundY, H) {
  for (let i = 0; i < 16; i++) {
    const depth = (i % 6) / 6;
    const cy = groundY + 8 + depth * (H - groundY);
    if (cy < groundY || cy > H + 20) continue;
    const cxp = ((Math.sin(i * 5.13 + 1.7) + 1) / 2) * W;
    const r = 5 + depth * 30;
    ctx.fillStyle = 'rgba(20,20,24,0.5)';
    ctx.beginPath(); ctx.ellipse(cxp, cy, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(225,228,236,0.18)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cxp, cy, r, r * 0.4, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cxp, cy, r, r * 0.4, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
  }
}

// Astronauts, flag and footpath during the surface stay.
function drawSurfaceProps(ctx, shipX, groundY, t) {
  // Artemis flag (rigid — no atmosphere)
  const fx = shipX + 96, fy = groundY - 2;
  ctx.strokeStyle = '#d4d7dd'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 27); ctx.stroke();
  ctx.fillStyle = '#c9352c'; ctx.fillRect(fx, fy - 27, 18, 12);
  ctx.fillStyle = '#1d3f7a'; ctx.fillRect(fx, fy - 27, 7, 12);
  // Two EVA astronauts near the elevator base
  const baseX = shipX - 36;
  for (let i = 0; i < 2; i++) {
    const wob = Math.sin(t * 0.9 + i * 2) * 3;
    const ax = baseX - i * 16 + wob, ay = groundY - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(ax + 9, ay + 2, 11, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8ebf0';
    ctx.fillRect(ax - 3, ay - 9, 6, 9);
    ctx.beginPath(); ctx.arc(ax, ay - 9, 3.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b9bcc4'; ctx.fillRect(ax - 4.5, ay - 8, 2.4, 6);   // backpack
    ctx.fillStyle = '#f2f4f8';
    ctx.beginPath(); ctx.arc(ax, ay - 12, 2.6, 0, Math.PI * 2); ctx.fill(); // helmet
    ctx.fillStyle = '#caa64a';
    ctx.beginPath(); ctx.arc(ax + 0.6, ay - 12, 1.4, 0, Math.PI * 2); ctx.fill(); // gold visor
    ctx.strokeStyle = '#e8ebf0'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 2 + wob * 0.3, ay + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 2 - wob * 0.3, ay + 4); ctx.stroke();
  }
}

function drawLunarTape(ctx, W, H, a2y, rocketY) {
  const tapeX = W - 64;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tapeX, 0); ctx.lineTo(tapeX, H); ctx.stroke();
  ctx.font = '10px monospace';
  for (const [a, lbl] of [[0, 'Surface'], [1, '1 km'], [5, '5 km'], [10, '10 km'], [25, '25 km']]) {
    const y = a2y(a);
    if (y < 12 || y > H - 4) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.moveTo(tapeX, y); ctx.lineTo(tapeX + 6, y); ctx.stroke();
    ctx.fillStyle = 'rgba(180,186,200,0.6)'; ctx.fillText(lbl, tapeX + 10, y + 3);
  }
  ctx.fillStyle = '#9aa6ff';
  ctx.beginPath();
  ctx.moveTo(tapeX, rocketY); ctx.lineTo(tapeX + 9, rocketY - 5); ctx.lineTo(tapeX + 9, rocketY + 5);
  ctx.closePath(); ctx.fill();
}

// ── Lunar landing → surface operations → ascent scene ─────────────────────────
function drawLunarSurfaceScene(ctx, W, H, t) {
  const flick = performance.now() / 1000;
  const st = lunarSurfaceState(t);
  // Lander chase-cam: constant ship size, the ground rises/falls with altitude.
  // (Not true-to-scale — at 25 km a true-scale 50 m ship would be an invisible
  // dot; here it stays clearly visible while the altitude tape carries the scale.)
  const rocketY = H * 0.42, shipX = W * 0.44;
  const ART_PX   = 186;
  const artScale = (H * 0.34) / ART_PX;     // ship ≈ 34% of canvas height, constant
  const PXPERKM  = (H * 0.58) / 2.2;        // ~2.2 km of altitude spans ship → ground
  const a2y      = (a) => rocketY - (a - st.altMoon) * PXPERKM;
  const groundY  = a2y(0);

  ctx.fillStyle = '#01010a'; ctx.fillRect(0, 0, W, H);
  sceneStars(ctx, W, H, 200);
  drawEarthDiskSky(ctx, W * 0.76, H * 0.18, 15);

  // Terrain (recedes as the ship climbs)
  if (groundY < H) {
    const gy = Math.max(0, groundY);
    const tg = ctx.createLinearGradient(0, groundY, 0, H);
    tg.addColorStop(0, '#52535b'); tg.addColorStop(0.5, '#3a3b42'); tg.addColorStop(1, '#15161b');
    ctx.fillStyle = tg; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = 'rgba(210,214,224,0.1)'; ctx.fillRect(0, groundY, W, 2);
    drawLunarCraters(ctx, W, groundY, H);
    if (st.altMoon < 0.04) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(shipX + 62, groundY + 4, 72, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (st.phase === 'surface') drawSurfaceProps(ctx, shipX, groundY, t);
  }

  // Dust (minimal — high thrusters; a brief flare at touchdown / liftoff)
  const touchdownDust = t >= T_LANDING && t < T_LANDING + 2.2;
  if ((st.phase === 'descent' && st.altMoon < 0.05) || touchdownDust ||
      (st.phase === 'ascent' && st.altMoon < 0.06)) {
    const grow = touchdownDust ? 1 + (t - T_LANDING) * 1.2 : 1.4;
    for (let i = 0; i < 5; i++) {
      const dx = (i - 2) * 22 * grow * 0.5, r = 16 * grow + i * 3;
      const cg = ctx.createRadialGradient(shipX + dx, groundY, 0, shipX + dx, groundY, r);
      cg.addColorStop(0, 'rgba(150,150,158,0.3)'); cg.addColorStop(1, 'rgba(150,150,158,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(shipX + dx, groundY, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Vehicle (constant size — always clearly visible)
  const ascentBurn = st.phase === 'ascent' && t < T_ASCENT_END;
  const legs = st.phase === 'descent'
    ? Math.max(0, Math.min(1, (0.6 - st.altMoon) / 0.6)) : 1;
  const elevator = st.phase === 'surface'
    ? Math.max(0, Math.min(1, ((t - T_LANDING) / (T_SURFACE_END - T_LANDING)) / 0.08)) : 0;
  ctx.save();
  ctx.translate(shipX, rocketY);
  ctx.scale(artScale, artScale);
  drawShip(ctx, {
    variant: 'hls', legs, elevator,
    engines: st.phase === 'ascent',
    burning: ascentBurn,
    thrusterBurn: st.phase === 'descent',
    flick,
  });
  ctx.restore();

  drawLunarTape(ctx, W, H, a2y, rocketY);

  // ── Readout panel ──
  const px = 14, py = 14;
  drawScenePanel(ctx, px, py, 228, 132);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('ALT (LUNAR)', px + 14, py + 22);
  ctx.fillText('VELOCITY', px + 128, py + 22);
  ctx.fillStyle = '#9aa6ff'; ctx.font = 'bold 18px monospace';
  ctx.fillText(fmtAltKm(st.altMoon), px + 14, py + 42);
  ctx.fillStyle = '#34d399'; ctx.font = 'bold 18px monospace';
  ctx.fillText(st.vel.toFixed(2), px + 128, py + 42);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('km/s', px + 170, py + 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(px + 12, py + 54); ctx.lineTo(px + 216, py + 54); ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText(st.phase === 'descent' ? 'POWERED DESCENT'
             : st.phase === 'surface' ? 'SURFACE OPERATIONS' : 'LUNAR ASCENT', px + 14, py + 70);
  ctx.fillStyle = '#e5e7eb'; ctx.font = '11px monospace';
  ctx.fillText('Starship HLS', px + 14, py + 88);
  ctx.fillStyle = '#5b616b'; ctx.font = '9px monospace';
  ctx.fillText(st.phase === 'descent' ? 'High-mounted thrusters · low regolith'
             : st.phase === 'surface' ? 'Crew elevator deployed · EVA'
             : '6 Raptors · climbing to NRHO', px + 14, py + 102);
  if (st.phase === 'surface') {
    const days = (t - T_LANDING) / 86400;
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px monospace';
    ctx.fillText(`Surface time: ${days.toFixed(1)} d (planned 6.5+)`, px + 14, py + 122);
  }
  ctx.fillStyle = 'rgba(180,190,210,0.55)'; ctx.font = '9px monospace';
  ctx.fillText('LUNAR SOUTH POLE · Shackleton region', 14, H - 12);

  // ── Flashes ──
  for (const [ft, lbl, win] of [[T_LANDING, 'LUNAR TOUCHDOWN', 4320],
                                [T_SURFACE_END, 'LUNAR ASCENT — LIFTOFF', 4320]]) {
    const dt = t - ft;
    if (dt >= 0 && dt < win) {
      ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${(1 - dt / win).toFixed(2)})`;
      ctx.fillText(`✦ ${lbl}`, W / 2, 40); ctx.textAlign = 'left';
    }
  }
}

// ── Cislunar coast + NRHO scene (TLI → coast → NRHO insertion/loiter/DOI, and
//    the post-rendezvous loiter) — a schematic Earth–Moon transit ────────────
function drawCislunarScene(ctx, W, H, t) {
  const flick = performance.now() / 1000;
  const { alt, vel } = starshipMissionState(t);
  ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H);
  sceneStars(ctx, W, H, 240);

  const earth = { x: W * 0.15, y: H * 0.56, r: 30 };
  const moon  = { x: W * 0.83, y: H * 0.38, r: 19 };
  const eg = ctx.createRadialGradient(earth.x - 10, earth.y - 10, 4, earth.x, earth.y, earth.r);
  eg.addColorStop(0, '#3a7fe0'); eg.addColorStop(0.7, '#1b4a93'); eg.addColorStop(1, '#0a2550');
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(earth.x, earth.y, earth.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(220,235,245,0.18)';
  ctx.beginPath(); ctx.ellipse(earth.x - 4, earth.y + 3, earth.r * 0.6, earth.r * 0.3, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(150,180,235,0.5)'; ctx.font = '9px monospace'; ctx.fillText('EARTH', earth.x - 16, earth.y + earth.r + 14);
  const mg = ctx.createRadialGradient(moon.x - 6, moon.y - 6, 2, moon.x, moon.y, moon.r);
  mg.addColorStop(0, '#e2ded4'); mg.addColorStop(0.6, '#a09890'); mg.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,205,215,0.5)'; ctx.font = '9px monospace'; ctx.fillText('MOON', moon.x - 14, moon.y + moon.r + 14);

  // Trans-lunar arc (Earth → Moon)
  const ctrl = { x: W * 0.5, y: H * 0.16 };
  const bez = (p, a, b, c) => { const u = 1 - p; return u * u * a + 2 * u * p * b + p * p * c; };
  ctx.save(); ctx.setLineDash([5, 8]);
  ctx.strokeStyle = 'rgba(150,180,255,0.3)'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let p = 0; p <= 1.0001; p += 0.02) {
    const x = bez(p, earth.x + earth.r, ctrl.x, moon.x - moon.r);
    const y = bez(p, earth.y, ctrl.y, moon.y);
    if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.restore();

  // NRHO loop around the Moon (shown during loiter / post-rendezvous)
  if ((t >= T_LOI && t < T_PD_START) || t > T_NRHO_RV) {
    ctx.save(); ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(180,200,255,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(moon.x, moon.y - 6, 30, 46, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // Craft position + phase label
  let craftX, craftY, phaseLabel, sub, burning = false;
  if (t < T_LOI) {
    const p = Math.max(0, Math.min(1, (t - T_TLI) / (T_LOI - T_TLI)));
    craftX = bez(p, earth.x + earth.r, ctrl.x, moon.x - moon.r);
    craftY = bez(p, earth.y, ctrl.y, moon.y);
    burning = t < T_TLI_END;
    phaseLabel = burning ? 'TRANS-LUNAR INJECTION' : 'CISLUNAR COAST';
    sub = burning ? 'ΔV ≈ 3.1 km/s · departing LEO' : '~5-day coast to the Moon';
  } else {
    const base = t > T_NRHO_RV ? T_NRHO_RV : T_LOI;
    const ang  = -Math.PI / 2 + (t - base) / NRHO_PERIOD * Math.PI * 2;
    craftX = moon.x + 30 * Math.cos(ang);
    craftY = (moon.y - 6) + 46 * Math.sin(ang);
    if (t > T_NRHO_RV)     { phaseLabel = 'NRHO — RENDEZVOUS COMPLETE'; sub = 'HLS holds in NRHO for reuse'; }
    else if (t >= T_DOI)   { phaseLabel = 'DESCENT ORBIT COAST';        sub = 'Coasting to 15 km perilune'; }
    else                   { phaseLabel = 'NRHO LOITER';                sub = 'Awaiting Orion crew · 9:2 resonant halo'; }
  }

  // Craft (small HLS) + plume during a burn
  ctx.save(); ctx.translate(craftX, craftY); ctx.scale(0.16, 0.16);
  drawShip(ctx, { variant: 'hls', burning, flick });
  ctx.restore();
  ctx.fillStyle = 'rgba(180,220,255,0.7)'; ctx.font = '9px monospace';
  ctx.fillText('HLS', craftX + 9, craftY - 7);

  // Readout panel
  const px = 14, py = 14;
  drawScenePanel(ctx, px, py, 236, 118);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('FROM EARTH', px + 14, py + 22);
  ctx.fillText('VELOCITY', px + 134, py + 22);
  ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 17px monospace';
  ctx.fillText(fmtAltKm(alt), px + 14, py + 42);
  ctx.fillStyle = '#34d399'; ctx.font = 'bold 17px monospace';
  ctx.fillText(vel.toFixed(2), px + 134, py + 42);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace'; ctx.fillText('km/s', px + 178, py + 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(px + 12, py + 54); ctx.lineTo(px + 224, py + 54); ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace'; ctx.fillText(phaseLabel, px + 14, py + 70);
  ctx.fillStyle = '#e5e7eb'; ctx.font = '11px monospace'; ctx.fillText('Starship HLS', px + 14, py + 88);
  ctx.fillStyle = '#5b616b'; ctx.font = '9px monospace'; ctx.fillText(sub, px + 14, py + 104);

  ctx.fillStyle = 'rgba(180,190,210,0.55)'; ctx.font = '9px monospace';
  ctx.fillText('CISLUNAR SPACE · Earth–Moon transit', 14, H - 12);

  // Flashes
  for (const [ft, lbl, win] of [[T_TLI, 'TLI BURN', 600],
                                [T_LOI, 'NRHO INSERTION', 4320],
                                [T_DOI, 'DESCENT ORBIT INSERTION', 4320],
                                [T_NRHO_RV, 'NRHO RENDEZVOUS', 4320]]) {
    const dt = t - ft;
    if (dt >= 0 && dt < win) {
      ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${(1 - dt / win).toFixed(2)})`;
      ctx.fillText(`✦ ${lbl}`, W / 2, 40); ctx.textAlign = 'left';
    }
  }
}

function drawShipAscentView(ctx, W, H, t, opts) {
  const hideSpent = !!(opts && opts.hideSpent);
  const noFlash   = !!(opts && opts.noFlash);
  const { alt, vel } = starshipMissionState(t);
  const rocketX = W * 0.32;
  const rocketY = H * 0.62;
  const flick   = performance.now() / 1000;  // wall clock for plume flicker

  // True-to-scale camera: same algorithm as Artemis II rocket view.
  const STACK_KM = 0.121;   // real Starship+SH height (121 m)
  const ART_PX   = 440;     // art height (nozzle exit → nosecone tip)
  const A0_KM    = 100;
  const viewKm   = (alt + A0_KM) * (0.34 / A0_KM);
  const pxPerKm  = H / viewKm;
  const artScale = (STACK_KM * pxPerKm) / ART_PX;
  const a2y      = (a) => rocketY - (a - alt) * pxPerKm;
  const groundY  = a2y(0);

  const fmtAlt = (a) =>
      a < 1    ? Math.round(a * 1000) + ' m'
    : a < 100  ? a.toFixed(1) + ' km'
    : a < 1000 ? Math.round(a) + ' km'
    : a < 1e6  ? (a / 1000).toFixed(a < 1e4 ? 1 : 0) + 'k km'
    :            (a / 1e6).toFixed(2) + 'M km';

  // ── Background ────────────────────────────────────────────────────────────
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

  // Sky glow + ground
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
    gg.addColorStop(0, '#2f74b8'); gg.addColorStop(1, '#0b2c54');
    ctx.fillStyle = gg;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, groundY, W, 2);
    // Mechazilla launch tower (only on pad)
    if (alt < 0.12) {
      ctx.fillStyle = 'rgba(110,118,132,0.75)';
      ctx.fillRect(rocketX + 66, groundY - 195, 9, 195);  // tower mast
      ctx.fillRect(rocketX + 56, groundY - 8, 110, 8);    // base slab
      if (t < 3) {
        // Chopstick arms (pre-launch)
        ctx.fillStyle = 'rgba(100,110,120,0.6)';
        ctx.fillRect(rocketX + 68, groundY - 110, 22, 6);
        ctx.fillRect(rocketX + 68, groundY - 130, 22, 6);
      }
    }
  }

  // ── Altitude tape ─────────────────────────────────────────────────────────
  const tapeX = W - 70;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tapeX, 0); ctx.lineTo(tapeX, H); ctx.stroke();
  ctx.font = '10px monospace';
  const niceStep = (span) => {
    const raw = span / 7;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n   = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  };
  const step = niceStep(viewKm);
  const aTop = alt + rocketY / pxPerKm;
  const aBot = alt - (H - rocketY) / pxPerKm;
  for (let a = Math.ceil(Math.max(0, aBot) / step) * step; a <= aTop; a += step) {
    const y = a2y(a);
    if (y < 10 || y > H - 4) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(tapeX, y); ctx.lineTo(tapeX + 6, y); ctx.stroke();
    ctx.fillStyle = 'rgba(170,180,200,0.65)';
    ctx.fillText(a >= 1 && step < 1 ? a.toFixed(1) + ' km' : fmtAlt(a), tapeX + 10, y + 3);
  }
  // Reference markers
  const REF = [
    [12,     'Max-Q'],
    [68,     'Hot staging'],
    [100,    'Kármán line'],
    [150,    'MECO'],
    [300,    'LEO'],
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
    if (lbl === 'Moon orbit') {
      const mx = W * 0.6, mr = 9;
      const mg = ctx.createRadialGradient(mx - 3, y - 3, 0, mx, y, mr);
      mg.addColorStop(0, '#e2ded4'); mg.addColorStop(0.6, '#a09890'); mg.addColorStop(1, '#3a3a3a');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, y, mr, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Altitude pointer
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.moveTo(tapeX, rocketY); ctx.lineTo(tapeX + 9, rocketY - 5); ctx.lineTo(tapeX + 9, rocketY + 5);
  ctx.closePath(); ctx.fill();

  // ── Liftoff exhaust cloud ─────────────────────────────────────────────────
  if (alt < 8 && t < 18) {
    const grow = 1 + t * 0.55;
    for (let i = 0; i < 6; i++) {
      const cx = rocketX + (i - 2.5) * 24 * grow * 0.4;
      const r  = 30 * grow + i * 4;
      const cg = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, r);
      cg.addColorStop(0, 'rgba(230,230,235,0.45)');
      cg.addColorStop(1, 'rgba(200,200,210,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, groundY, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Burn states ───────────────────────────────────────────────────────────
  const boosterBurn = t < T_HOT_STAGE;
  const shipBurn    = (t < T_SHIP_MECO) || (t >= T_TLI && t < T_TLI_END);
  const separated   = t >= T_HOT_STAGE;

  // ── Gravity-turn tilt (nose pitches downrange) ───────────────────────────
  const tf   = Math.min(t / T_SHIP_MECO, 1);
  const tilt = 1.15 * (1 - Math.cos(Math.PI * tf)) / 2;

  const detailed = artScale * ART_PX >= 6;

  // Spent-stage drift helper (screen-space; same as Artemis)
  const drawSpent = (sepT, cx, cy, fall, side, spin, artFn) => {
    const e = t - sepT;
    if (e < 0 || e > 90 / Math.max(0.01, 1)) return;
    const alpha = Math.max(0, 1 - e / 90);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(rocketX + side * e * pxPerKm, rocketY + 0.5 * fall * e * e * pxPerKm);
    ctx.rotate(tilt);
    ctx.scale(artScale, artScale);
    ctx.translate(cx, cy); ctx.rotate(e * spin); ctx.translate(-cx, -cy);
    artFn();
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  if (!detailed) {
    // Too far out: draw a glowing marker
    ctx.save();
    ctx.translate(rocketX, rocketY); ctx.rotate(tilt);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
    glow.addColorStop(0, 'rgba(200,212,235,0.5)');
    glow.addColorStop(1, 'rgba(200,212,235,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
    if (boosterBurn || shipBurn) {
      drawPlume(ctx, 0, 4, 7, 18,
        ['rgba(255,240,190,0.9)', 'rgba(255,150,45,0.5)', 'rgba(255,80,20,0)'], flick, 0);
    }
    ctx.fillStyle = '#d0d4d8';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(4.5, 4); ctx.lineTo(-4.5, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    // Booster tumbles away at hot staging (suppressed when the split view owns it)
    if (separated && !hideSpent) {
      drawSpent(T_HOT_STAGE, 0, -114, 0.014, -0.007, -0.018,
        () => drawSSBooster(ctx, false, flick));
    }
    // Live stack (camera-tracked)
    ctx.save();
    ctx.translate(rocketX, rocketY);
    ctx.rotate(tilt);
    ctx.scale(artScale, artScale);
    if (!separated) drawSSBooster(ctx, boosterBurn, flick);
    drawSSShip(ctx, shipBurn, flick);
    ctx.restore();
  }

  // ── Readout panel ─────────────────────────────────────────────────────────
  const panelX = 14, panelY = 14;
  ctx.fillStyle = 'rgba(8,10,20,0.62)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(panelX, panelY, 218, 158, 8);
  else ctx.rect(panelX, panelY, 218, 158);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('ALTITUDE', panelX + 14, panelY + 22);
  ctx.fillText('VELOCITY', panelX + 116, panelY + 22);
  ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 19px monospace';
  ctx.fillText(fmtAlt(alt), panelX + 14, panelY + 42);
  ctx.fillStyle = '#34d399'; ctx.font = 'bold 19px monospace';
  ctx.fillText(vel.toFixed(2), panelX + 116, panelY + 42);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('km/s', panelX + 164, panelY + 42);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(panelX+12, panelY+54); ctx.lineTo(panelX+206, panelY+54); ctx.stroke();
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('VEHICLE STACK', panelX + 14, panelY + 70);

  const CONFIG = [
    { label: 'Starship (HLS)',  color: '#c8ccd2', goneAt: null,        note: '6 Raptors' },
    { label: 'Super Heavy',     color: '#90929a', goneAt: T_HOT_STAGE, note: '33 Raptors · hot-stage sep' },
  ];
  let ry = panelY + 86;
  for (const c of CONFIG) {
    const gone = c.goneAt != null && t >= c.goneAt;
    ctx.globalAlpha = gone ? 0.34 : 1;
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(panelX+19, ry-3, 4, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = gone ? '#6b7280' : '#e5e7eb'; ctx.font = '11px monospace';
    ctx.fillText(c.label, panelX+30, ry);
    if (gone) {
      ctx.strokeStyle = '#6b7280';
      ctx.beginPath();
      ctx.moveTo(panelX+30, ry-4);
      ctx.lineTo(panelX+30 + ctx.measureText(c.label).width, ry-4);
      ctx.stroke();
    }
    ctx.fillStyle = '#5b616b'; ctx.font = '9px monospace';
    ctx.fillText(c.note, panelX+30, ry + 13);
    ctx.globalAlpha = 1;
    ry += 28;
  }

  // ── Event flashes ─────────────────────────────────────────────────────────
  const FLASH = [
    [T_MAXQ,          'MAX-Q',              60],
    [T_HOT_STAGE,     'HOT STAGING',        90],
    [T_BOOSTER_CATCH, 'MECHAZILLA CATCH',   420],
    [T_SHIP_MECO,     'SHIP MECO',          180],
    [T_LEO_INSERT,    'LEO INSERTION',      600],
    [T_TLI,           'TLI BURN',           600],
    [T_LOI,           'NRHO INSERTION',     4320],
    [T_LANDING,       'LUNAR LANDING',      4320],
    [T_SURFACE_END,   'LUNAR ASCENT',       4320],
  ];
  if (!noFlash) for (const [ft, lbl, win] of FLASH) {
    const dt = t - ft;
    if (dt >= 0 && dt < win) {
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = `rgba(255,255,255,${(1 - dt/win).toFixed(2)})`;
      ctx.textAlign = 'center';
      ctx.fillText(`✦ ${lbl}`, W / 2, 40);
      ctx.textAlign = 'left';
    }
  }
}

// ── Booster return profile (alt km, vel km/s vs mission time) ─────────────────
// Both stages separate at ~68 km / 1.6 km/s. The booster only coasts up a little
// (it's shed its drive to the ship and is decelerating), so the ship — still
// firing and accelerating — stays the higher and faster-climbing vehicle the
// whole time. The booster then falls back, flips, and is caught.
const BOOSTER_KEYS = [
  [T_HOT_STAGE,      68,   1.60],   // separation (~68 km)
  [198,              80,   0.55],   // gentle coast to apogee (ship already above)
  [T_BOOSTER_BOOST,  80,   0.50],   // boostback burn near apogee
  [240,              64,   1.00],   // falling back, grid fins steering
  [300,              44,   1.30],
  [360,              20,   1.45],
  [400,               5,   0.55],   // landing burn slows it
  [412,               1.0, 0.25],
  [416,               0.18,0.07],   // arriving at the tower
  [T_BOOSTER_CATCH,   0.07,0.00],   // caught (~70 m)
];
function boosterReturnState(t) {
  const K = BOOSTER_KEYS;
  let alt, vel;
  if (t <= K[0][0]) { alt = K[0][1]; vel = K[0][2]; }
  else if (t >= K[K.length - 1][0]) { alt = K[K.length - 1][1]; vel = K[K.length - 1][2]; }
  else {
    for (let i = 0; i < K.length - 1; i++) {
      if (t <= K[i + 1][0]) {
        const [t0, a0, v0] = K[i], [t1, a1, v1] = K[i + 1];
        const f = (t - t0) / (t1 - t0);
        alt = a0 + f * (a1 - a0); vel = v0 + f * (v1 - v0); break;
      }
    }
  }
  let phase, burning = false;
  if (t >= T_BOOSTER_CATCH)                        phase = 'caught';
  else if (t >= 398)                             { phase = 'landing';   burning = true; }
  else if (t >= T_BOOSTER_BOOST - 6 && t <= 236) { phase = 'boostback'; burning = true; }
  else if (t < T_BOOSTER_BOOST - 6)                phase = 'flip';
  else                                             phase = 'descent';
  return { alt, vel, phase, burning };
}

// ── Booster return view — flip, boostback, descent, Mechazilla catch ──────────
// The booster falls down the frame; the launch tower is off-screen at staging and
// scrolls up into view as the booster nears the pad, then catches it. Altitude
// maps non-linearly — expanded near the pad — so the catch is big while the whole
// 80 km → 0 descent stays on screen.
function drawBoosterReturnView(ctx, W, H, t, opts) {
  const noFlash = !!(opts && opts.noFlash);
  const flick = performance.now() / 1000;
  const st = boosterReturnState(t);
  const boosterX = W * 0.56;                    // right of the top-left readout panel
  const Hg0 = H * 0.88;                          // ground line once fully in view
  const ART_PX = 246, NEAR = 0.4, NEARPX = H * 0.38, TOPROOM = H * 0.30, TAU = 18;
  const altPx = (a) => a <= NEAR ? (a / NEAR) * NEARPX
                                 : NEARPX + TOPROOM * (1 - Math.exp(-(a - NEAR) / TAU));
  const baseY    = (a) => Hg0 - altPx(a);        // fixed altitude ruler (booster rides it down)
  const boosterY = baseY(st.alt);
  const artScale = (H * 0.22) / ART_PX;          // constant booster size
  const bHalfW   = 15 * artScale;
  // The booster falls continuously down the frame. The ground + tower are pushed
  // off the bottom while it's high, then scroll up into view as it nears the pad
  // (no fade-in — Mechazilla simply isn't on screen yet at hot staging).
  const A1 = 0.6, A2 = 7, PUSH = H * 0.5;
  const hide    = PUSH * Math.max(0, Math.min(1, (st.alt - A1) / (A2 - A1)));
  const groundY = Hg0 + hide;

  // Background + stars
  ctx.fillStyle = '#04040d'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 150; i++) {
    const sx = ((Math.sin(i * 8.11 + 2.3) + 1) / 2) * W;
    const sy = ((Math.cos(i * 12.07 + 0.7) + 1) / 2) * H;
    const br = 0.18 + 0.7 * ((i * 41 % 100) / 100);
    ctx.fillStyle = `rgba(255,255,255,${br.toFixed(2)})`;
    ctx.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }
  // Sky glow + ground (scroll up into view as the booster nears the pad)
  if (groundY < H) {
    const top = Math.max(0, groundY - 220);
    const ag = ctx.createLinearGradient(0, top, 0, groundY);
    ag.addColorStop(0, 'rgba(46,120,210,0)'); ag.addColorStop(1, 'rgba(96,172,236,0.34)');
    ctx.fillStyle = ag; ctx.fillRect(0, top, W, groundY - top);
    const gg = ctx.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#2f74b8'); gg.addColorStop(1, '#0b2c54');
    ctx.fillStyle = gg; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, groundY, W, 2);
  }

  // Altitude tape (non-linear ruler; the pointer rides down it)
  const tapeX = W - 64;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tapeX, 0); ctx.lineTo(tapeX, H); ctx.stroke();
  ctx.font = '10px monospace';
  for (const [a, lbl] of [[0.5, '500 m'], [1, '1 km'], [5, '5 km'], [20, '20 km'], [50, '50 km'], [80, '80 km']]) {
    const y = baseY(a);
    if (y < 10 || y > H - 4) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(tapeX, y); ctx.lineTo(tapeX + 6, y); ctx.stroke();
    ctx.fillStyle = 'rgba(170,180,200,0.6)'; ctx.fillText(lbl, tapeX + 10, y + 3);
  }
  ctx.fillStyle = '#ff8a3c';
  ctx.beginPath();
  ctx.moveTo(tapeX, boosterY); ctx.lineTo(tapeX + 9, boosterY - 5); ctx.lineTo(tapeX + 9, boosterY + 5);
  ctx.closePath(); ctx.fill();

  // Booster (falls down the frame as it descends)
  let tilt = 0;
  if (st.phase === 'flip')         tilt = 0.5 * (1 - Math.min(1, (t - T_HOT_STAGE) / Math.max(1, (T_BOOSTER_BOOST - 6) - T_HOT_STAGE)));
  else if (st.phase === 'descent') tilt = 0.04 * Math.sin(t * 0.6);
  else if (st.phase === 'caught')  tilt = 0.012 * Math.sin(flick * 1.2);
  ctx.save();
  ctx.translate(boosterX, boosterY);
  ctx.rotate(tilt);
  ctx.scale(artScale, artScale);
  drawSSBooster(ctx, st.burning, flick);
  ctx.restore();

  // Mechazilla tower — scrolls up from the ground (off-screen while the booster
  // is high); arms close as it settles in, meeting the grid fins at the catch.
  const CATCH_OFFSET = altPx(0.07) + 200 * artScale;   // ground line → arm height
  const gripY = groundY - CATCH_OFFSET;
  if (gripY < H) {
    const mastX = boosterX + bHalfW + 18;               // clear of the grid fins
    const mastTop = gripY - 42, mastBot = Math.min(H, groundY);
    ctx.fillStyle = 'rgba(120,128,142,0.92)'; ctx.fillRect(mastX, mastTop, 9, mastBot - mastTop);
    ctx.strokeStyle = 'rgba(40,44,52,0.5)'; ctx.lineWidth = 1;
    for (let yy = mastTop + 12; yy < mastBot; yy += 15) { ctx.beginPath(); ctx.moveTo(mastX, yy); ctx.lineTo(mastX + 9, yy); ctx.stroke(); }
    if (groundY < H) { ctx.fillStyle = 'rgba(90,96,108,0.9)'; ctx.fillRect(mastX - 26, groundY - 10, 52, 10); }   // OLM / base
    ctx.fillStyle = 'rgba(150,158,172,0.95)'; ctx.fillRect(mastX - 4, gripY - 13, 17, 26);   // carriage
    const close = Math.max(0, Math.min(1, (0.16 - st.alt) / (0.16 - 0.07)));
    const tipX = (mastX - 20) + (boosterX - (mastX - 20)) * close;
    const tipY = (gripY - 46) + 46 * close;
    ctx.strokeStyle = 'rgba(178,184,196,0.97)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const dy of [-5, 5]) {
      ctx.beginPath(); ctx.moveTo(mastX, gripY + dy * 0.3); ctx.lineTo(tipX, tipY + dy); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // Readout panel
  const px = 14, py = 14;
  drawScenePanel(ctx, px, py, 210, 126);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText('ALTITUDE', px + 14, py + 22);
  ctx.fillText('VELOCITY', px + 112, py + 22);
  ctx.fillStyle = '#ff8a3c'; ctx.font = 'bold 17px monospace';
  ctx.fillText(fmtAltKm(st.alt), px + 14, py + 42);
  ctx.fillStyle = '#34d399'; ctx.font = 'bold 17px monospace';
  ctx.fillText(st.vel.toFixed(2), px + 112, py + 42);
  ctx.fillStyle = '#6b7280'; ctx.font = '9px monospace'; ctx.fillText('km/s', px + 156, py + 42);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(px + 12, py + 54); ctx.lineTo(px + 198, py + 54); ctx.stroke();
  const PL = { flip: 'FLIP MANEUVER', boostback: 'BOOSTBACK BURN', descent: 'DESCENT · GRID FINS', landing: 'LANDING BURN', caught: 'CAUGHT ✓' };
  ctx.fillStyle = st.phase === 'caught' ? '#34d399' : '#6b7280'; ctx.font = '9px monospace';
  ctx.fillText(PL[st.phase], px + 14, py + 70);
  ctx.fillStyle = '#e5e7eb'; ctx.font = '11px monospace';
  ctx.fillText('Super Heavy', px + 14, py + 88);
  ctx.fillStyle = '#5b616b'; ctx.font = '9px monospace';
  ctx.fillText('33 Raptors · tower catch, no legs', px + 14, py + 104);

  // Flash
  const dtc = t - T_BOOSTER_CATCH;
  if (!noFlash && dtc >= 0 && dtc < 420) {
    ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(120,230,160,${(1 - dtc / 420).toFixed(2)})`;
    ctx.fillText('✦ MECHAZILLA CATCH', W / 2, 38); ctx.textAlign = 'left';
  }
}

// ── Split view: ship ascent (left) + booster return/catch (right) ─────────────
function drawBoosterSplitView(ctx, W, H, t) {
  const halfW = Math.floor(W / 2), rW = W - halfW;
  const tb = t - T_HOT_STAGE;
  const BOTH = 6, FADE = 2.5;   // s: both panes hold on the separation, then diverge

  // LEFT — ship ascent (the spent booster tumbles out of frame, so both vehicles
  // show right after separation, then the ship is the focus).
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, halfW, H); ctx.clip();
  drawShipAscentView(ctx, halfW, H, t, { hideSpent: false, noFlash: true });
  ctx.restore();

  // RIGHT — opens on the same separation shot, then crossfades to the booster cam.
  ctx.save();
  ctx.beginPath(); ctx.rect(halfW, 0, rW, H); ctx.clip();
  ctx.translate(halfW, 0);
  if (tb < BOTH) {
    drawShipAscentView(ctx, rW, H, t, { hideSpent: false, noFlash: true });
  } else if (tb < BOTH + FADE) {
    drawBoosterReturnView(ctx, rW, H, t, { noFlash: true });
    ctx.globalAlpha = 1 - (tb - BOTH) / FADE;
    drawShipAscentView(ctx, rW, H, t, { hideSpent: false, noFlash: true });
    ctx.globalAlpha = 1;
  } else {
    drawBoosterReturnView(ctx, rW, H, t, { noFlash: true });
  }
  ctx.restore();

  // Divider + labels
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(halfW - 1, 0, 2, H);
  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200,210,225,0.7)';
  if (tb < BOTH) {
    ctx.fillText('HOT STAGING — STARSHIP + SUPER HEAVY', W / 2, H - 14);
  } else {
    ctx.fillText('STARSHIP — ASCENT', halfW * 0.5, H - 14);
    ctx.fillText('SUPER HEAVY — RETURN', halfW + rW * 0.5, H - 14);
  }

  // Combined event banner — centred over the divider, clear of both panels
  let banner = null, col = null;
  if (t >= T_BOOSTER_CATCH && t < T_BOOSTER_CATCH + 18) {
    banner = '✦ MECHAZILLA CATCH'; col = `rgba(120,230,160,${(1 - (t - T_BOOSTER_CATCH) / 18).toFixed(2)})`;
  } else if (t >= T_BOOSTER_BOOST - 6 && t <= 236) {
    banner = 'BOOSTBACK BURN'; col = 'rgba(255,170,80,0.9)';
  } else if (t >= T_HOT_STAGE && t < T_HOT_STAGE + 26) {
    banner = '✦ HOT STAGING'; col = `rgba(255,255,255,${(1 - (t - T_HOT_STAGE) / 26).toFixed(2)})`;
  }
  if (banner) {
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = col;
    ctx.fillText(banner, W / 2, 196);   // over the divider, below both panels
  }
  ctx.textAlign = 'left';
}

function drawStarshipRocketView(ctx, W, H, t) {
  // Scene dispatch — a continuous narrative across the whole mission:
  // launch ascent → LEO refuelling → cislunar/NRHO → lunar landing/ops/ascent
  // → NRHO loiter. Every phase button lands on a real scene.
  if (t >= T_LEO_INSERT && t < T_TLI)     { drawRefuelScene(ctx, W, H, t); return; }
  if (t >= T_PD_START && t <= T_NRHO_RV)  { drawLunarSurfaceScene(ctx, W, H, t); return; }
  if (t >= T_TLI)                         { drawCislunarScene(ctx, W, H, t); return; }
  // From hot staging until the Mechazilla catch, split the canvas: watch the
  // ship climb (left) while the booster flies back and is caught (right).
  if (t >= T_HOT_STAGE && t <= T_BOOSTER_CATCH + 15) { drawBoosterSplitView(ctx, W, H, t); return; }

  drawShipAscentView(ctx, W, H, t);
}

// ════════════════════════════════════════════════════════════════════════════
// REACT COMPONENT
// ════════════════════════════════════════════════════════════════════════════

function StarshipSimulation() {
  const [trajectory, setTrajectory] = React.useState(null);

  React.useEffect(() => {
    const id = setTimeout(() => setTrajectory(generateTrajectory()), 40);
    return () => clearTimeout(id);
  }, []);

  // ── Canvas renderer handed to the shared base each frame ─────────────────────
  const draw = React.useCallback((ctx, { W, H, t, view }) => {
    if (view === 'rocket') { drawStarshipRocketView(ctx, W, H, t); return; }

    ctx.fillStyle = '#040410';
    ctx.fillRect(0, 0, W, H);
    if (!trajectory) return;

    const va = vehiclePos(t);
    const pt = { t, x: va.x, y: va.y, moon: va.moon };
    let frameIdx = 0;
    for (let i = 0; i < trajectory.length; i++) { if (trajectory[i].t <= t) frameIdx = i; else break; }

    // View centering + scale
    let cx_km = 0, cy_km = 0, VIEW_R = 20000;
    if (view === 'cislunar') VIEW_R = 460000;
    else if (view === 'lunar') { cx_km = pt.moon.x; cy_km = pt.moon.y; VIEW_R = 90000; }
    const { scale, sc } = makeProjector(W, H, VIEW_R, cx_km, cy_km);
    const ox = W / 2, oy = H / 2;

    drawStarfield(ctx, W, H, 350);

    // Earth (only when on-screen)
    const es = sc(0, 0);
    const er = Math.max(7, R_EARTH * scale);
    if (es.sx > -er*2 && es.sx < W + er*2 && es.sy > -er*2 && es.sy < H + er*2) drawEarth(ctx, es, scale);

    // Moon orbit ring (cislunar view)
    if (view === 'cislunar') {
      ctx.save(); ctx.setLineDash([6, 14]);
      ctx.beginPath(); ctx.arc(es.sx, es.sy, MOON_SMA * scale, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    // Moon (only when on-screen)
    const ms = sc(pt.moon.x, pt.moon.y);
    const mr = Math.max(view === 'lunar' ? 8 : 4, R_MOON * scale);
    if (ms.sx > -mr*3 && ms.sx < W + mr*3 && ms.sy > -mr*3 && ms.sy < H + mr*3)
      drawMoon(ctx, ms, scale, { minR: view === 'lunar' ? 8 : 4 });

    // NRHO ghost orbit in lunar view
    if (view === 'lunar') {
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
    if (view === 'ascent') {
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
    if (view === 'ascent' && pt.t >= T_TANKER_BEGIN && pt.t < T_REFUEL_DONE) {
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
    const TRAIL = Math.min(frameIdx, 1500);
    for (let i = Math.max(0, frameIdx - TRAIL); i < frameIdx; i++) {
      const p0 = trajectory[i], p1 = trajectory[i+1];
      if (!p0 || !p1) continue;
      const s0 = sc(p0.x, p0.y), s1 = sc(p1.x, p1.y);
      if (s0.sx < -W || s0.sx > 2*W || s0.sy < -H || s0.sy > 2*H) continue;
      const alpha = 0.1 + 0.9 * ((i - (frameIdx - TRAIL)) / TRAIL);
      const col = PHASE_COLOR[p0.phase] || '#cccccc';
      const c = hexToRgb(col);
      ctx.beginPath(); ctx.moveTo(s0.sx, s0.sy); ctx.lineTo(s1.sx, s1.sy);
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ── Vehicle dot ───────────────────────────────────────────────────────────
    const vs = sc(pt.x, pt.y);
    if (vs.sx > -30 && vs.sx < W+30 && vs.sy > -30 && vs.sy < H+30) {
      drawVehicleDot(ctx, vs.sx, vs.sy);

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

      if (view !== 'ascent' && distMoon < 200000) {
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
    const viewLabel = view === 'ascent' ? '±20,000 km (Earth)' : view === 'cislunar' ? '±460,000 km (Cislunar)' : '±90,000 km (Lunar)';
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

  }, [trajectory]);

  const legend = (view) => view === 'rocket' ? (
    <React.Fragment>
      <div style={eyebrow}>Starship Stack</div>
      <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
        {[
          ['#c8ccd2','Starship (HLS) — 6 Raptors'],
          ['#90929a','Super Heavy — 33 Raptors'],
        ].map(([color, label]) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ width:'12px', height:'12px', borderRadius:'50%', background:color, flexShrink:0 }} />
            <span style={{ fontSize:'11px', color:'#9ca3af' }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:'10px', color:'#5b616b', marginTop:'12px', lineHeight:'1.5' }}>
        A continuous mission story — use the phase buttons below to jump between
        acts. Launch is true-to-scale; at hot staging (~T+2:42) the view splits
        to follow the ship's climb (left) and the booster's flyback + Mechazilla
        catch (right) side by side. Then the LEO depot during tanker refueling
        (aft-to-aft cryo transfer), the Earth–Moon cislunar coast and NRHO
        insertion, and the lunar south pole for powered descent, crew-elevator
        surface ops, and liftoff back to NRHO.
      </div>
    </React.Fragment>
  ) : (
    <TrailLegend items={[
      ['#ff7030','Super Heavy ascent'],
      ['#ffc040','Starship ascent'],
      ['#40aaff','LEO + refueling'],
      ['#dd44ff','TLI burn'],
      ['#44ff7a','Cislunar coast'],
      ['#80c0ff','NRHO'],
      ['#ff5050','Powered descent'],
      ['#50ffaa','Lunar ascent'],
    ]} />
  );

  return (
    <RocketrySim
      phases={PHASES} tEnd={T_TOTAL} draw={draw} ready={!!trajectory}
      views={[
        { id:'rocket',   label:'Rocket' },
        { id:'ascent',   label:'Ascent' },
        { id:'cislunar', label:'Cislunar' },
        { id:'lunar',    label:'Lunar/NRHO' },
      ]}
      defaultView="rocket"
      speeds={[1, 10, 100, 1000, 10000, 100000]} defaultSpeed={1}
      speedNote="(1× = real time)"
      legend={legend}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// VISUAL SUMMARIES  (replaced the old spec / table sections)
// ════════════════════════════════════════════════════════════════════════════

// ΔV budget as a bar chart: each maneuver sized by its velocity change, with the
// LEO refuel point marked — shows why a reusable Starship can't reach the Moon
// on the propellant it lifts itself.
function DeltaVLadder() {
  const BURNS = [
    { label: 'Launch → LEO',        dv: 9.4,  who: 'Booster + Ship', color: '#ff7030' },
    { label: 'LEO → TLI',           dv: 3.1,  who: 'HLS · refueled', color: '#a855f7' },
    { label: 'TLI → NRHO',          dv: 0.45, who: 'HLS',            color: '#60a5fa' },
    { label: 'DOI (descent orbit)', dv: 0.05, who: 'HLS',            color: '#60a5fa' },
    { label: 'Powered descent',     dv: 2.0,  who: 'HLS',            color: '#34d399' },
    { label: 'Lunar ascent',        dv: 1.9,  who: 'HLS',            color: '#fbbf24' },
    { label: 'NRHO rendezvous',     dv: 0.5,  who: 'HLS',            color: '#60a5fa' },
  ];
  const MAX = 9.4;
  return (
    <Section title="ΔV Budget — why it must refuel to leave LEO">
      <p style={{ color:'#9ca3af', fontSize:'13px', lineHeight:'1.6', marginBottom:'16px' }}>
        Each bar is the velocity change for one maneuver (km/s). The full stack spends ~9.4 km/s just
        reaching orbit — a reusable Starship has nothing left for the Moon. Refueling in LEO refills the
        tanks so HLS can spend another ~8 km/s on the round trip.
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        {BURNS.map((b, i) => (
          <React.Fragment key={b.label}>
            {i === 1 && (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'2px 0' }}>
                <div style={{ flex:1, height:'1px', background:'rgba(52,211,153,0.4)' }} />
                <span style={{ fontSize:'11px', color:'#34d399', whiteSpace:'nowrap' }}>⛽ refuel in LEO — tanks back to full (~1,200 t)</span>
                <div style={{ flex:1, height:'1px', background:'rgba(52,211,153,0.4)' }} />
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'132px', fontSize:'12px', color:'#cbd5e1', textAlign:'right', flexShrink:0 }}>{b.label}</div>
              <div style={{ flex:1, height:'20px', background:'rgba(255,255,255,0.04)', borderRadius:'4px', overflow:'hidden' }}>
                <div style={{ width:((b.dv / MAX) * 100) + '%', height:'100%', background:b.color, opacity:0.9, minWidth:'2px' }} />
              </div>
              <div style={{ width:'42px', fontSize:'12px', fontFamily:'monospace', color:'#fbbf24', textAlign:'right', flexShrink:0 }}>{b.dv.toFixed(2)}</div>
              <div style={{ width:'94px', fontSize:'10px', color:'#6b7280', flexShrink:0 }}>{b.who}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop:'16px', display:'flex', gap:'12px', flexWrap:'wrap' }}>
        {[
          ['HLS ΔV after LEO', '~8.0 km/s'],
          ['Raptor vacuum ISP', '380 s'],
          ['Mass ratio needed', '≈ 8.6×'],
          ['Propellant for ~100 t dry', '~1,200 t'],
        ].map(([k, v]) => (
          <div key={k} style={{ flex:'1 1 140px', padding:'10px 12px', background:'rgba(96,165,250,0.07)', borderRadius:'8px', borderLeft:'3px solid #60a5fa' }}>
            <div style={{ fontSize:'10px', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em' }}>{k}</div>
            <div style={{ fontSize:'16px', color:'#f3f4f6', fontFamily:'monospace', marginTop:'3px' }}>{v}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// Refueling shown as a fuel gauge: ~14 tanker flights fill a 1,200 t depot, plus
// a methalox-vs-hydrolox density comparison (same mass, very different volume).
function RefuelingInfographic() {
  const N = 14, PER = 100, NEED = 1200;
  const CH4_H = 26, H2_H = Math.round(CH4_H * (422 / 71));  // equal-mass tank heights (px)
  return (
    <Section title="Orbital Refueling — why ~14 flights, and why methalox">
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:'28px', alignItems:'center' }}>
        <div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginBottom:'12px', maxWidth:'330px' }}>
            {Array.from({ length: N }).map((_, i) => (
              <div key={i} style={{ width:'15px', height:'34px', borderRadius:'4px 4px 2px 2px',
                background:'linear-gradient(180deg,#d4d8de,#9aa0a8)', position:'relative' }}>
                <div style={{ position:'absolute', top:'-5px', left:'50%', transform:'translateX(-50%)',
                  width:0, height:0, borderLeft:'4px solid transparent', borderRight:'4px solid transparent', borderBottom:'5px solid #c8ccd2' }} />
                <div style={{ position:'absolute', bottom:'2px', left:'50%', transform:'translateX(-50%)', width:'7px', height:'4px', background:'rgba(120,160,255,0.85)', borderRadius:'1px' }} />
              </div>
            ))}
          </div>
          <p style={{ color:'#cbd5e1', fontSize:'13px', lineHeight:'1.6', maxWidth:'460px' }}>
            A <strong style={{ color:'#f3f4f6' }}>fully reusable</strong> Starship lifts only ~{PER} t to
            LEO — keeping propellant to fly home costs payload. HLS needs
            <strong style={{ color:'#f3f4f6' }}> ~{NEED} t</strong> waiting in orbit to reach the Moon, land,
            and return. A depot Starship aggregates it over the campaign; HLS docks once.
          </p>
          <div style={{ marginTop:'10px', fontSize:'17px', fontFamily:'monospace', color:'#50c8ff' }}>
            {PER} t × ~{N} flights ≈ {NEED} t
          </div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ position:'relative', width:'72px', height:'160px', margin:'0 auto',
            border:'2px solid rgba(255,255,255,0.2)', borderRadius:'10px', overflow:'hidden', background:'rgba(255,255,255,0.03)' }}>
            <div style={{ position:'absolute', left:0, right:0, bottom:0, top:0,
              background:'linear-gradient(180deg, rgba(80,200,255,0.5), rgba(42,127,208,0.6))' }} />
            {Array.from({ length: N - 1 }).map((_, i) => (
              <div key={i} style={{ position:'absolute', left:0, right:0, bottom:(((i + 1) / N) * 100) + '%', height:'1px', background:'rgba(255,255,255,0.16)' }} />
            ))}
            <div style={{ position:'absolute', top:'5px', left:0, right:0, textAlign:'center', fontSize:'11px', fontFamily:'monospace', color:'#eaf5ff' }}>{NEED} t</div>
          </div>
          <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'6px' }}>LEO depot</div>
        </div>
      </div>

      <div style={{ marginTop:'20px', paddingTop:'18px', borderTop:'1px solid rgba(255,255,255,0.08)',
        display:'flex', gap:'28px', alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:'24px', alignItems:'flex-end' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:'56px', height:H2_H + 'px', margin:'0 auto', border:'2px solid rgba(150,190,255,0.35)', borderRadius:'6px',
              background:'linear-gradient(180deg, rgba(150,190,255,0.35), rgba(110,150,230,0.2))' }} />
            <div style={{ fontSize:'11px', color:'#cbd5e1', marginTop:'6px' }}>LH₂</div>
            <div style={{ fontSize:'10px', color:'#6b7280' }}>71 kg/m³</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:'56px', height:CH4_H + 'px', margin:'0 auto', border:'2px solid rgba(80,200,255,0.4)', borderRadius:'6px',
              background:'linear-gradient(180deg, rgba(80,200,255,0.55), rgba(42,127,208,0.6))' }} />
            <div style={{ fontSize:'11px', color:'#cbd5e1', marginTop:'6px' }}>LCH₄</div>
            <div style={{ fontSize:'10px', color:'#6b7280' }}>422 kg/m³</div>
          </div>
        </div>
        <p style={{ flex:'1 1 260px', color:'#cbd5e1', fontSize:'12px', lineHeight:'1.6', minWidth:'240px' }}>
          <strong style={{ color:'#f3f4f6' }}>Same propellant mass.</strong> Methalox is ~6× denser than
          liquid hydrogen, so it packs into a fraction of the volume → smaller, lighter tanks and far less
          boil-off in orbit. It also doesn't embrittle steel and is makeable on Mars (Sabatier) — the whole
          architecture is downstream of this choice.
        </p>
      </div>
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
      <DeltaVLadder />
      <RefuelingInfographic />

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
