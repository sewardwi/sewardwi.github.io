// Thrust & I-V Calculator — real EHD physics from analytical model
// T = I·d/μb, I = (9μbε/8Lc²)·(V−V₀)²
var { useState: useStateTC } = React;

// Physical constants (SI)
var MU_B = 2e-4;       // ion mobility in air [m²/(V·s)]
var EPSILON = 8.85e-12; // permittivity of air [F/m]

// Empirical onset voltage (Peek's law approximation for wire-plate geometry)
// V₀ ≈ 3×10⁶ × r × ln(d/r) / 1000  [kV], r=wire radius ~50μm
function onsetVoltage(d_mm) {
  var r = 0.00005; // 50μm wire radius
  var d = d_mm / 1000;
  return 3e6 * r * Math.log(d / r) / 1000;
}

// Thrust from analytical model [mN] given voltage [kV], gap [mm], emitter length [mm]
function computeThrust(V_kV, d_mm, L_mm) {
  var V = V_kV * 1000;  // V
  var d = d_mm / 1000;  // m
  var Lc = d;           // characteristic length ≈ gap
  var V0 = onsetVoltage(d_mm) * 1000;
  if (V <= V0) return 0;
  var dV = V - V0;
  var C = 9 * MU_B * EPSILON / (8 * Lc * Lc);
  var I = C * dV * dV * (L_mm / 1000) / Lc; // scale by emitter length
  return (I * d / MU_B) * 1000; // [mN]
}

function computeCurrent(V_kV, d_mm, L_mm) {
  var V = V_kV * 1000;
  var d = d_mm / 1000;
  var Lc = d;
  var V0 = onsetVoltage(d_mm) * 1000;
  if (V <= V0) return 0;
  var dV = V - V0;
  var C = 9 * MU_B * EPSILON / (8 * Lc * Lc);
  return C * dV * dV * (L_mm / 1000) / Lc * 1000; // [mA]
}

function ThrustCalculator() {
  var [gapMm, setGapMm] = useStateTC(25);      // electrode gap [mm]
  var [voltageKv, setVoltageKv] = useStateTC(22); // applied voltage [kV]
  var [emitterMm, setEmitterMm] = useStateTC(200); // emitter wire length [mm]

  var V0_kV = onsetVoltage(gapMm);
  var I_mA = computeCurrent(voltageKv, gapMm, emitterMm);
  var T_mN = computeThrust(voltageKv, gapMm, emitterMm);
  var P_W = voltageKv * I_mA / 1000;  // P = V*I
  var efficiency = P_W > 0 ? (T_mN / 1000 / P_W * 1000).toFixed(1) : '—'; // mN/W

  // --- I-V Chart ---
  var ivW = 330, ivH = 220;
  var ivPad = { left: 52, right: 15, top: 20, bottom: 40 };
  var ivPlotW = ivW - ivPad.left - ivPad.right;
  var ivPlotH = ivH - ivPad.top - ivPad.bottom;

  var V_MAX = 40; // kV for chart
  var I_MAX_CHART = Math.max(0.5, computeCurrent(V_MAX, gapMm, emitterMm) * 1.15);

  var ivPoints = Array.from({ length: 81 }, function(_, i) {
    var v = (i / 80) * V_MAX;
    return { v: v, I: computeCurrent(v, gapMm, emitterMm) };
  });

  var toIV_X = function(v) { return ivPad.left + (v / V_MAX) * ivPlotW; };
  var toIV_Y = function(I) { return ivPad.top + (1 - I / I_MAX_CHART) * ivPlotH; };

  var ivPath = ivPoints.map(function(p, i) {
    return (i === 0 ? 'M' : 'L') + toIV_X(p.v).toFixed(1) + ',' + toIV_Y(p.I).toFixed(1);
  }).join(' ');

  // --- Thrust vs Voltage Chart ---
  var tvW = 330, tvH = 220;
  var tvPad = { left: 52, right: 15, top: 20, bottom: 40 };
  var tvPlotW = tvW - tvPad.left - tvPad.right;
  var tvPlotH = tvH - tvPad.top - tvPad.bottom;

  var T_MAX_CHART = Math.max(5, computeThrust(V_MAX, gapMm, emitterMm) * 1.15);

  var tvPoints = Array.from({ length: 81 }, function(_, i) {
    var v = (i / 80) * V_MAX;
    return { v: v, T: computeThrust(v, gapMm, emitterMm) };
  });

  var toTV_X = function(v) { return tvPad.left + (v / V_MAX) * tvPlotW; };
  var toTV_Y = function(T) { return tvPad.top + (1 - T / T_MAX_CHART) * tvPlotH; };

  var tvPath = tvPoints.map(function(p, i) {
    return (i === 0 ? 'M' : 'L') + toTV_X(p.v).toFixed(1) + ',' + toTV_Y(p.T).toFixed(1);
  }).join(' ');

  // Current operating point
  var ivDotX = toIV_X(voltageKv), ivDotY = toIV_Y(I_mA);
  var tvDotX = toTV_X(voltageKv), tvDotY = toTV_Y(T_mN);

  // Efficiency vs gap chart (fixed voltage)
  var gapPoints = Array.from({ length: 50 }, function(_, i) {
    var g = 5 + (i / 49) * 55; // 5–60 mm
    var t = computeThrust(voltageKv, g, emitterMm);
    var curr = computeCurrent(voltageKv, g, emitterMm);
    var p = voltageKv * curr / 1000;
    return { g: g, eff: p > 0 ? t / p : 0 }; // mN/W
  });
  var maxEff = Math.max.apply(null, gapPoints.map(function(p) { return p.eff; })) || 1;
  var effW = 680, effH = 130;
  var effPad = { left: 52, right: 20, top: 15, bottom: 35 };
  var effPlotW = effW - effPad.left - effPad.right;
  var effPlotH = effH - effPad.top - effPad.bottom;
  var toEffX = function(g) { return effPad.left + ((g - 5) / 55) * effPlotW; };
  var toEffY = function(e) { return effPad.top + (1 - e / maxEff) * effPlotH; };
  var effPath = gapPoints.map(function(p, i) {
    return (i === 0 ? 'M' : 'L') + toEffX(p.g).toFixed(1) + ',' + toEffY(p.eff).toFixed(1);
  }).join(' ');
  var currEff = computeThrust(voltageKv, gapMm, emitterMm) / (voltageKv * computeCurrent(voltageKv, gapMm, emitterMm) / 1000 || 1);

  return (
    React.createElement('div', { className: 'mb-10' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'EHD Thrust Calculator'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Using the analytical EHD model: thrust T\u200a=\u200aId/\u03bcb where current follows Townsend\'s law I\u200a=\u200aC(V\u2212V\u2080)\u00b2. ',
        'Ion mobility \u03bcb\u200a=\u200a2\u00d710\u207b\u2074\u200am\u00b2/(V\u00b7s), onset voltage from Peek\'s law. Adjust geometry to explore performance trade-offs.'
      ),

      // Sliders
      React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4 mb-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Voltage: ',
            React.createElement('span', { className: 'font-mono font-bold text-yellow-600' }, voltageKv + ' kV')
          ),
          React.createElement('input', {
            type: 'range', min: '0', max: '40', step: '0.5', value: voltageKv,
            onChange: function(e) { setVoltageKv(Number(e.target.value)); },
            className: 'w-full'
          }),
          React.createElement('div', { className: 'text-xs text-gray-400 mt-0.5' }, 'Corona onset: ' + V0_kV.toFixed(1) + ' kV')
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Electrode Gap: ',
            React.createElement('span', { className: 'font-mono font-bold text-blue-600' }, gapMm + ' mm')
          ),
          React.createElement('input', {
            type: 'range', min: '5', max: '60', step: '1', value: gapMm,
            onChange: function(e) { setGapMm(Number(e.target.value)); },
            className: 'w-full'
          }),
          React.createElement('div', { className: 'text-xs text-gray-400 mt-0.5' }, 'Optimal ~10 kV/cm field gradient')
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Emitter Length: ',
            React.createElement('span', { className: 'font-mono font-bold text-indigo-600' }, emitterMm + ' mm')
          ),
          React.createElement('input', {
            type: 'range', min: '50', max: '500', step: '10', value: emitterMm,
            onChange: function(e) { setEmitterMm(Number(e.target.value)); },
            className: 'w-full'
          }),
          React.createElement('div', { className: 'text-xs text-gray-400 mt-0.5' }, 'Thrust scales linearly with length')
        )
      ),

      // Two charts side by side
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'flex flex-col md:flex-row gap-4' },

          // I-V curve
          React.createElement('div', { className: 'flex-1' },
            React.createElement('div', { className: 'text-xs text-gray-400 mb-1' }, 'Current vs Voltage (Townsend law)'),
            React.createElement('svg', { width: ivW, height: ivH, viewBox: '0 0 ' + ivW + ' ' + ivH, className: 'w-full' },
              React.createElement('rect', { x: ivPad.left, y: ivPad.top, width: ivPlotW, height: ivPlotH, fill: '#0f172a', rx: 4 }),

              // Grid
              [0, 0.25, 0.5, 0.75, 1.0].map(function(f) {
                var I = f * I_MAX_CHART;
                var y = toIV_Y(I);
                return React.createElement('g', { key: 'ig-' + f },
                  React.createElement('line', { x1: ivPad.left, y1: y, x2: ivPad.left + ivPlotW, y2: y, stroke: '#1e293b' }),
                  React.createElement('text', { x: ivPad.left - 4, y: y + 3, fill: '#9ca3af', fontSize: '9', textAnchor: 'end' }, I.toFixed(2))
                );
              }),

              [0, 10, 20, 30, 40].map(function(v) {
                return React.createElement('g', { key: 'iv-' + v },
                  React.createElement('line', { x1: toIV_X(v), y1: ivPad.top, x2: toIV_X(v), y2: ivPad.top + ivPlotH, stroke: '#1e293b' }),
                  React.createElement('text', { x: toIV_X(v), y: ivH - ivPad.bottom + 14, fill: '#9ca3af', fontSize: '9', textAnchor: 'middle' }, v)
                );
              }),

              // Onset line
              React.createElement('line', {
                x1: toIV_X(V0_kV), y1: ivPad.top, x2: toIV_X(V0_kV), y2: ivPad.top + ivPlotH,
                stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4,3'
              }),
              React.createElement('text', { x: toIV_X(V0_kV) + 2, y: ivPad.top + 12, fill: '#f59e0b', fontSize: '8' }, 'V₀'),

              // I-V curve
              React.createElement('path', { d: ivPath, fill: 'none', stroke: '#a78bfa', strokeWidth: 2.5 }),

              // Operating point
              React.createElement('circle', { cx: ivDotX, cy: ivDotY, r: 5, fill: '#f59e0b' }),
              React.createElement('line', { x1: ivDotX, y1: ivPad.top, x2: ivDotX, y2: ivDotY, stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3,2' }),
              React.createElement('line', { x1: ivPad.left, y1: ivDotY, x2: ivDotX, y2: ivDotY, stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3,2' }),

              // Labels
              React.createElement('text', { x: ivPad.left + ivPlotW / 2, y: ivH - 5, fill: '#d1d5db', fontSize: '10', textAnchor: 'middle' }, 'Voltage (kV)'),
              React.createElement('text', {
                x: 12, y: ivPad.top + ivPlotH / 2, fill: '#d1d5db', fontSize: '10', textAnchor: 'middle',
                transform: 'rotate(-90,12,' + (ivPad.top + ivPlotH / 2) + ')'
              }, 'Current (mA)')
            )
          ),

          // Thrust vs Voltage
          React.createElement('div', { className: 'flex-1' },
            React.createElement('div', { className: 'text-xs text-gray-400 mb-1' }, 'Thrust vs Voltage'),
            React.createElement('svg', { width: tvW, height: tvH, viewBox: '0 0 ' + tvW + ' ' + tvH, className: 'w-full' },
              React.createElement('rect', { x: tvPad.left, y: tvPad.top, width: tvPlotW, height: tvPlotH, fill: '#0f172a', rx: 4 }),

              [0, 0.25, 0.5, 0.75, 1.0].map(function(f) {
                var T = f * T_MAX_CHART;
                var y = toTV_Y(T);
                return React.createElement('g', { key: 'tg-' + f },
                  React.createElement('line', { x1: tvPad.left, y1: y, x2: tvPad.left + tvPlotW, y2: y, stroke: '#1e293b' }),
                  React.createElement('text', { x: tvPad.left - 4, y: y + 3, fill: '#9ca3af', fontSize: '9', textAnchor: 'end' }, T.toFixed(1))
                );
              }),

              [0, 10, 20, 30, 40].map(function(v) {
                return React.createElement('g', { key: 'tv-' + v },
                  React.createElement('line', { x1: toTV_X(v), y1: tvPad.top, x2: toTV_X(v), y2: tvPad.top + tvPlotH, stroke: '#1e293b' }),
                  React.createElement('text', { x: toTV_X(v), y: tvH - tvPad.bottom + 14, fill: '#9ca3af', fontSize: '9', textAnchor: 'middle' }, v)
                );
              }),

              // Onset
              React.createElement('line', {
                x1: toTV_X(V0_kV), y1: tvPad.top, x2: toTV_X(V0_kV), y2: tvPad.top + tvPlotH,
                stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4,3'
              }),
              React.createElement('text', { x: toTV_X(V0_kV) + 2, y: tvPad.top + 12, fill: '#f59e0b', fontSize: '8' }, 'V₀'),

              // Thrust curve
              React.createElement('path', { d: tvPath, fill: 'none', stroke: '#22c55e', strokeWidth: 2.5 }),

              // Operating point
              React.createElement('circle', { cx: tvDotX, cy: tvDotY, r: 5, fill: '#f59e0b' }),
              React.createElement('line', { x1: tvDotX, y1: tvPad.top, x2: tvDotX, y2: tvDotY, stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3,2' }),
              React.createElement('line', { x1: tvPad.left, y1: tvDotY, x2: tvDotX, y2: tvDotY, stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3,2' }),

              // Labels
              React.createElement('text', { x: tvPad.left + tvPlotW / 2, y: tvH - 5, fill: '#d1d5db', fontSize: '10', textAnchor: 'middle' }, 'Voltage (kV)'),
              React.createElement('text', {
                x: 12, y: tvPad.top + tvPlotH / 2, fill: '#d1d5db', fontSize: '10', textAnchor: 'middle',
                transform: 'rotate(-90,12,' + (tvPad.top + tvPlotH / 2) + ')'
              }, 'Thrust (mN)')
            )
          )
        )
      ),

      // Efficiency vs gap
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'text-xs text-gray-400 mb-1' },
          'Thrust Efficiency (mN/W) vs Electrode Gap at ' + voltageKv + ' kV — there\'s an optimal gap for each voltage'
        ),
        React.createElement('svg', { width: effW, height: effH, viewBox: '0 0 ' + effW + ' ' + effH, className: 'w-full max-w-[680px]' },
          React.createElement('rect', { x: effPad.left, y: effPad.top, width: effPlotW, height: effPlotH, fill: '#0f172a', rx: 4 }),

          [5, 15, 25, 35, 45, 55].map(function(g) {
            return React.createElement('g', { key: 'eg-' + g },
              React.createElement('text', { x: toEffX(g), y: effH - effPad.bottom + 14, fill: '#9ca3af', fontSize: '9', textAnchor: 'middle' }, g + 'mm')
            );
          }),

          React.createElement('path', { d: effPath, fill: 'none', stroke: '#f472b6', strokeWidth: 2.5 }),

          // Current gap marker
          React.createElement('circle', { cx: toEffX(gapMm), cy: toEffY(currEff), r: 5, fill: '#f59e0b' }),
          React.createElement('line', {
            x1: toEffX(gapMm), y1: effPad.top, x2: toEffX(gapMm), y2: toEffY(currEff),
            stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '3,2'
          }),

          React.createElement('text', { x: effPad.left + effPlotW / 2, y: effH - 4, fill: '#d1d5db', fontSize: '10', textAnchor: 'middle' }, 'Electrode Gap (mm)'),
          React.createElement('text', {
            x: 12, y: effPad.top + effPlotH / 2, fill: '#d1d5db', fontSize: '10', textAnchor: 'middle',
            transform: 'rotate(-90,12,' + (effPad.top + effPlotH / 2) + ')'
          }, 'mN/W')
        )
      ),

      // Info cards
      React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-3 text-sm' },
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Corona Current'),
          React.createElement('div', { className: 'font-mono font-bold text-purple-600' }, I_mA.toFixed(3) + ' mA')
        ),
        React.createElement('div', { className: 'bg-green-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'EHD Thrust'),
          React.createElement('div', { className: 'font-mono font-bold text-green-600' }, T_mN.toFixed(2) + ' mN')
        ),
        React.createElement('div', { className: 'bg-yellow-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Input Power'),
          React.createElement('div', { className: 'font-mono font-bold text-yellow-700' }, P_W.toFixed(2) + ' W')
        ),
        React.createElement('div', { className: 'bg-blue-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Efficiency'),
          React.createElement('div', { className: 'font-mono font-bold text-blue-600' },
            P_W > 0.001 ? (T_mN / P_W).toFixed(1) + ' mN/W' : '—'
          )
        )
      ),

      React.createElement('div', { className: 'mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800' },
        React.createElement('span', { className: 'font-semibold' }, 'Key equations: '),
        'Current: I = (9\u03bcb\u03b5/8d\u00b2)\u00b7(V\u2212V\u2080)\u00b2\u00b7L,  ',
        'Thrust: T = I\u00b7d/\u03bcb,  ',
        'Efficiency: T/P = d/(\u03bcb\u00b7V)  — lower voltage and wider gaps improve efficiency.'
      )
    )
  );
}
