var { useState: useStateNM } = React;

// Pre-computed H2 dissociation data with noise effects
var NOISE_DISTANCES = [0.30, 0.40, 0.50, 0.60, 0.70, 0.74, 0.80, 0.90, 1.00, 1.20, 1.40, 1.60, 1.80, 2.00, 2.40, 2.80, 3.20, 3.50];

var EXACT_ENERGIES = [-0.3550, -0.7108, -0.9145, -1.0300, -1.0909, -1.1050, -1.1108, -1.1058, -1.0910, -1.0490, -1.0010, -0.9560, -0.9180, -0.8880, -0.8470, -0.8230, -0.8100, -0.8030];

// Noise shifts energy upward (depolarizing noise); magnitude scales with noise rate and circuit depth
var NOISE_OFFSETS = {
  0.001: [0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.010, 0.012, 0.015, 0.018, 0.020, 0.022, 0.023, 0.024, 0.025, 0.025, 0.025],
  0.005: [0.010, 0.015, 0.020, 0.025, 0.032, 0.035, 0.040, 0.048, 0.055, 0.068, 0.078, 0.085, 0.090, 0.095, 0.100, 0.105, 0.108, 0.110],
  0.01:  [0.020, 0.030, 0.042, 0.055, 0.068, 0.075, 0.085, 0.100, 0.115, 0.140, 0.160, 0.175, 0.185, 0.192, 0.200, 0.208, 0.212, 0.215],
  0.02:  [0.040, 0.062, 0.088, 0.115, 0.140, 0.155, 0.175, 0.205, 0.235, 0.280, 0.315, 0.340, 0.358, 0.370, 0.385, 0.395, 0.400, 0.405],
  0.05:  [0.100, 0.155, 0.220, 0.285, 0.345, 0.380, 0.425, 0.490, 0.545, 0.620, 0.670, 0.700, 0.720, 0.735, 0.750, 0.760, 0.765, 0.770],
};

// Shot noise adds random scatter (pre-computed seeds for reproducibility)
var SHOT_SCATTER_SEEDS = [0.3, -0.5, 0.8, -0.2, 0.6, -0.4, 0.1, -0.7, 0.5, -0.3, 0.4, -0.6, 0.2, -0.1, 0.7, -0.8, 0.35, -0.45];

// Error mitigation recovers a fraction of the noise offset
var MITIGATION_FACTORS = {
  1000:  0.55,
  2000:  0.65,
  5000:  0.78,
  10000: 0.88,
};

function NoiseMitigation() {
  var [noiseRate, setNoiseRate] = useStateNM(0.01);
  var [shots, setShots] = useStateNM(5000);

  // Find closest noise rate key
  var noiseKeys = [0.001, 0.005, 0.01, 0.02, 0.05];
  var closestNoise = noiseKeys.reduce(function(prev, curr) {
    return Math.abs(curr - noiseRate) < Math.abs(prev - noiseRate) ? curr : prev;
  });

  var noiseOffsets = NOISE_OFFSETS[closestNoise];
  var shotKeys = [1000, 2000, 5000, 10000];
  var closestShots = shotKeys.reduce(function(prev, curr) {
    return Math.abs(curr - shots) < Math.abs(prev - shots) ? curr : prev;
  });
  var mitFactor = MITIGATION_FACTORS[closestShots];

  // Compute curves
  var shotScatter = 1.0 / Math.sqrt(shots / 1000);
  var noisyEnergies = EXACT_ENERGIES.map(function(e, i) {
    return e + noiseOffsets[i] + SHOT_SCATTER_SEEDS[i] * noiseOffsets[i] * shotScatter * 0.3;
  });
  var mitigatedEnergies = EXACT_ENERGIES.map(function(e, i) {
    var noisyE = noisyEnergies[i];
    var correction = (noisyE - e) * mitFactor;
    return noisyE - correction + SHOT_SCATTER_SEEDS[i] * 0.002 * shotScatter;
  });

  // RMS errors
  var noisyRMS = Math.sqrt(EXACT_ENERGIES.reduce(function(sum, e, i) {
    var diff = noisyEnergies[i] - e;
    return sum + diff * diff;
  }, 0) / EXACT_ENERGIES.length);

  var mitigatedRMS = Math.sqrt(EXACT_ENERGIES.reduce(function(sum, e, i) {
    var diff = mitigatedEnergies[i] - e;
    return sum + diff * diff;
  }, 0) / EXACT_ENERGIES.length);

  // Chart dimensions
  var W = 700, H = 340;
  var pad = { left: 65, right: 30, top: 25, bottom: 45 };
  var plotW = W - pad.left - pad.right;
  var plotH = H - pad.top - pad.bottom;

  var xMin = 0.2, xMax = 3.6;
  var allE = EXACT_ENERGIES.concat(noisyEnergies);
  var yMin = Math.min.apply(null, allE) - 0.05;
  var yMax = Math.max.apply(null, allE) + 0.05;

  var toX = function(d) { return pad.left + ((d - xMin) / (xMax - xMin)) * plotW; };
  var toY = function(e) { return pad.top + (1 - (e - yMin) / (yMax - yMin)) * plotH; };

  var makePath = function(data) {
    return NOISE_DISTANCES.map(function(d, i) {
      return (i === 0 ? 'M' : 'L') + toX(d).toFixed(1) + ',' + toY(data[i]).toFixed(1);
    }).join(' ');
  };

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Noise & Error Mitigation'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Current quantum hardware is noisy (NISQ era). Gate errors shift VQE energies upward, and finite measurement shots add statistical scatter. ',
        'Error mitigation techniques (like zero-noise extrapolation) recover much of the accuracy without full error correction. ',
        'Adjust the noise rate and shot count to see the effect.'
      ),

      // Chart
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, className: 'w-full max-w-[700px]' },

          React.createElement('rect', { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: '#111827', rx: 4 }),

          // Grid
          [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5].map(function(d) {
            return React.createElement('g', { key: 'gx-' + d },
              React.createElement('line', { x1: toX(d), y1: pad.top, x2: toX(d), y2: pad.top + plotH, stroke: '#1f2937', strokeWidth: 0.5 }),
              React.createElement('text', { x: toX(d), y: H - pad.bottom + 18, fill: '#9ca3af', fontSize: '10', textAnchor: 'middle' }, d.toFixed(1))
            );
          }),

          // Y grid lines at regular intervals
          Array.from({ length: 8 }).map(function(_, i) {
            var e = yMin + (i / 7) * (yMax - yMin);
            var y = toY(e);
            return React.createElement('g', { key: 'gy-' + i },
              React.createElement('line', { x1: pad.left, y1: y, x2: pad.left + plotW, y2: y, stroke: '#1f2937', strokeWidth: 0.5 }),
              React.createElement('text', { x: pad.left - 5, y: y + 3, fill: '#9ca3af', fontSize: '9', textAnchor: 'end' }, e.toFixed(2))
            );
          }),

          // Axis labels
          React.createElement('text', { x: pad.left + plotW / 2, y: H - 5, fill: '#d1d5db', fontSize: '12', textAnchor: 'middle' }, 'Bond Distance (Å)'),
          React.createElement('text', {
            x: 14, y: pad.top + plotH / 2, fill: '#d1d5db', fontSize: '12', textAnchor: 'middle',
            transform: 'rotate(-90, 14, ' + (pad.top + plotH / 2) + ')'
          }, 'Energy (Hartree)'),

          // Exact curve
          React.createElement('path', { d: makePath(EXACT_ENERGIES), fill: 'none', stroke: '#22c55e', strokeWidth: 2.5 }),

          // Noisy curve
          React.createElement('path', { d: makePath(noisyEnergies), fill: 'none', stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '6,3' }),

          // Noisy data points
          NOISE_DISTANCES.map(function(d, i) {
            return React.createElement('circle', { key: 'np-' + i, cx: toX(d), cy: toY(noisyEnergies[i]), r: 3, fill: '#ef4444', opacity: 0.7 });
          }),

          // Mitigated curve
          React.createElement('path', { d: makePath(mitigatedEnergies), fill: 'none', stroke: '#3b82f6', strokeWidth: 2 }),

          // Mitigated data points
          NOISE_DISTANCES.map(function(d, i) {
            return React.createElement('circle', { key: 'mp-' + i, cx: toX(d), cy: toY(mitigatedEnergies[i]), r: 3, fill: '#3b82f6', opacity: 0.7 });
          }),

          // Legend
          React.createElement('rect', { x: pad.left + 10, y: pad.top + 8, width: 16, height: 3, fill: '#22c55e' }),
          React.createElement('text', { x: pad.left + 30, y: pad.top + 14, fill: '#22c55e', fontSize: '10' }, 'Exact (FCI)'),

          React.createElement('line', { x1: pad.left + 120, y1: pad.top + 10, x2: pad.left + 136, y2: pad.top + 10, stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '4,2' }),
          React.createElement('text', { x: pad.left + 140, y: pad.top + 14, fill: '#ef4444', fontSize: '10' }, 'Noisy QPU'),

          React.createElement('rect', { x: pad.left + 230, y: pad.top + 8, width: 16, height: 3, fill: '#3b82f6' }),
          React.createElement('text', { x: pad.left + 250, y: pad.top + 14, fill: '#3b82f6', fontSize: '10' }, 'Error Mitigated')
        )
      ),

      // Controls
      React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Gate Error Rate: ' + (noiseRate * 100).toFixed(1) + '%'
          ),
          React.createElement('input', {
            type: 'range', min: '0.001', max: '0.05', step: '0.001', value: noiseRate,
            onChange: function(e) { setNoiseRate(Number(e.target.value)); },
            className: 'w-full'
          }),
          React.createElement('p', { className: 'text-xs text-gray-400 mt-1' }, 'Higher noise pushes energies further from exact')
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Measurement Shots: ' + shots.toLocaleString()
          ),
          React.createElement('input', {
            type: 'range', min: '1000', max: '10000', step: '500', value: shots,
            onChange: function(e) { setShots(Number(e.target.value)); },
            className: 'w-full'
          }),
          React.createElement('p', { className: 'text-xs text-gray-400 mt-1' }, 'More shots reduce statistical scatter and improve mitigation')
        )
      ),

      // Error metrics
      React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-3 text-sm' },
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Noisy RMS Error'),
          React.createElement('div', { className: 'font-mono font-bold text-red-500' }, (noisyRMS * 1000).toFixed(1) + ' mHa')
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Mitigated RMS Error'),
          React.createElement('div', { className: 'font-mono font-bold text-blue-500' }, (mitigatedRMS * 1000).toFixed(1) + ' mHa')
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Error Reduction'),
          React.createElement('div', { className: 'font-mono font-bold text-green-600' },
            noisyRMS > 0 ? ((1 - mitigatedRMS / noisyRMS) * 100).toFixed(0) + '%' : '—'
          )
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Chemical Accuracy'),
          React.createElement('div', { className: 'font-mono font-bold ' + (mitigatedRMS < 0.0016 ? 'text-green-600' : 'text-yellow-600') },
            mitigatedRMS < 0.0016 ? 'Achieved (< 1.6 mHa)' : 'Not yet (' + (mitigatedRMS * 1000).toFixed(1) + ' mHa)'
          )
        )
      )
    )
  );
}
