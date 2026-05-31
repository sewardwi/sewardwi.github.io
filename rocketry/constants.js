// Shared rocketry constants
// ─────────────────────────────────────────────────────────────────────────────
// Physical / astronomical constants common to every simulation in /rocketry.
// Load this file (as a text/babel script) BEFORE a page's own simulation.js so
// these top-level consts are in scope for it:
//
//   <script type="text/babel" src="/rocketry/constants.js"></script>
//   <script type="text/babel" src="simulation.js"></script>
//
// Units: km, kg, seconds (so MU is in km³/s² and velocities come out in km/s).

const G        = 6.674e-20;          // gravitational constant, km³·kg⁻¹·s⁻²
const M_EARTH  = 5.972e24;           // Earth mass, kg
const M_MOON   = 7.342e22;           // Moon mass, kg
const R_EARTH  = 6371;               // Earth mean radius, km
const R_MOON   = 1737;               // Moon mean radius, km
const MU_EARTH = G * M_EARTH;        // Earth grav. parameter, ≈ 398,600 km³/s²
const MU_MOON  = G * M_MOON;         // Moon grav. parameter, ≈ 4,903 km³/s²

const MOON_SMA    = 384400;          // Moon orbit semi-major axis, km
const MOON_PERIOD = 27.321 * 86400;  // Moon sidereal period, s
const MOON_SOI    = 66100;           // Moon sphere of influence radius, km
