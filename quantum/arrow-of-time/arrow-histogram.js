// Arrow of Time Histogram — hook aliases for shared global scope
var { useState: useStateAH, useEffect: useEffectAH, useRef: useRefAH, useCallback: useCallbackAH } = React;

// Box-Muller transform
function randnAH() {
  var u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// Phi (normal CDF approximation)
function normCDF(x) {
  var t = 1 / (1 + 0.3275911 * Math.abs(x));
  var poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  var val = 1 - poly * Math.exp(-x * x / 2);
  return x >= 0 ? val : 1 - val;
}

// For T = tau, mean of ln R_chi ≈ (3 + chi) / 2
// Variance from fluctuation-dissipation: sigma ~ 1.8 (matched to paper Fig 2 histograms)
var SIGMA_LN_R = 1.8;
var KNOWN_MEANS = { '-4': -0.516, '-3': -0.022, '0': 1.524, '1': 2.046 };

function getMean(chi) {
  // Interpolate using paper formula
  return (3 + chi) / 2;
}

function ArrowHistogram() {
  var [chi, setChi] = useStateAH(0);
  var [sampleCount, setSampleCount] = useStateAH(0);
  var [samples, setSamples] = useStateAH([]);
  var [running, setRunning] = useStateAH(false);
  var timerRef = useRefAH(null);
  var BATCH = 500; // samples per tick
  var MAX_SAMPLES = 100000;

  var mean = getMean(chi);
  var forwardFrac = normCDF(mean / SIGMA_LN_R) * 100;
  var backwardFrac = (100 - forwardFrac);

  var resetSamples = useCallbackAH(function() {
    setSamples([]);
    setSampleCount(0);
    setRunning(false);
    clearInterval(timerRef.current);
  }, []);

  useEffectAH(function() { resetSamples(); }, [chi, resetSamples]);

  useEffectAH(function() {
    if (!running) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(function() {
      setSamples(function(prev) {
        if (prev.length >= MAX_SAMPLES) { setRunning(false); return prev; }
        var batch = [];
        for (var i = 0; i < BATCH; i++) {
          batch.push(mean + SIGMA_LN_R * randnAH());
        }
        return prev.concat(batch);
      });
      setSampleCount(function(n) { return Math.min(n + BATCH, MAX_SAMPLES); });
    }, 50);
    return function() { clearInterval(timerRef.current); };
  }, [running, mean]);

  // Build histogram bins over [-6, 7], 65 bins
  var BIN_MIN = -6, BIN_MAX = 7, N_BINS = 65;
  var binW = (BIN_MAX - BIN_MIN) / N_BINS;
  var bins = new Array(N_BINS).fill(0);
  samples.forEach(function(s) {
    var idx = Math.floor((s - BIN_MIN) / binW);
    if (idx >= 0 && idx < N_BINS) bins[idx]++;
  });
  var maxBin = Math.max.apply(null, bins) || 1;

  // SVG chart dimensions
  var W = 680, H = 280;
  var pad = { left: 50, right: 20, top: 20, bottom: 40 };
  var plotW = W - pad.left - pad.right;
  var plotH = H - pad.top - pad.bottom;

  var toX = function(v) { return pad.left + ((v - BIN_MIN) / (BIN_MAX - BIN_MIN)) * plotW; };
  var barPxW = plotW / N_BINS;

  // Gaussian overlay
  var gaussPath = [];
  for (var i = 0; i <= 200; i++) {
    var v = BIN_MIN + (i / 200) * (BIN_MAX - BIN_MIN);
    var density = Math.exp(-0.5 * ((v - mean) / SIGMA_LN_R) ** 2) / (SIGMA_LN_R * Math.sqrt(2 * Math.PI));
    var pxH = (density * samples.length * binW / maxBin) * plotH;
    var x = toX(v);
    var y = pad.top + plotH - pxH;
    gaussPath.push((i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1));
  }

  var chiLabel = chi.toFixed(1);
  var arrowDir = mean > 0.1 ? 'forward' : mean < -0.1 ? 'backward' : 'symmetric';
  var arrowColor = arrowDir === 'forward' ? '#22c55e' : arrowDir === 'backward' ? '#ef4444' : '#fbbf24';

  return (
    React.createElement('div', { className: 'mb-10' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Reshaping the Arrow of Time'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'By applying a feedback Hamiltonian H\u1d32\u02e3 = \u03a7 \u00b7 H\u2098\u2091\u2090\u209b, the paper shows that the "arrow of time" quantifier \u2113\u03c9\u211e\u2093 can be tuned at will. ',
        'Each trajectory produces a value of ln \u211e\u2093; its sign tells you whether time flowed forward (positive) or backward (negative). ',
        'Accumulate trajectories to build the histogram and see how \u03a7 reshapes the distribution.'
      ),

      // Chi slider + status
      React.createElement('div', { className: 'flex flex-wrap items-center gap-6 mb-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            React.createElement('span', { className: 'font-mono font-bold text-indigo-700' }, '\u03a7 = ' + chiLabel),
            '  (feedback parameter)'
          ),
          React.createElement('input', {
            type: 'range', min: '-4', max: '1', step: '0.1', value: chi,
            onChange: function(e) { setChi(Number(e.target.value)); },
            className: 'w-72'
          }),
          React.createElement('div', { className: 'flex justify-between text-xs text-gray-400 w-72 mt-0.5' },
            React.createElement('span', null, '\u03a7 = \u22124 (backward)'),
            React.createElement('span', null, '\u22123 (sym)'),
            React.createElement('span', null, '\u03a7 = 1 (forward)')
          )
        ),
        React.createElement('div', { className: 'text-center' },
          React.createElement('div', { className: 'text-xs text-gray-500 mb-1' }, 'Arrow Direction'),
          React.createElement('div', {
            className: 'px-4 py-2 rounded-lg font-bold text-white text-sm',
            style: { backgroundColor: arrowColor }
          },
            arrowDir === 'forward' ? '\u25b6 Time Flows Forward' :
            arrowDir === 'backward' ? '\u25c4 Time Runs Backward' :
            '\u29d6 Time-Symmetric'
          )
        )
      ),

      // Histogram
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'flex items-center gap-4 mb-2' },
          React.createElement('button', {
            onClick: function() { setRunning(!running); },
            className: 'px-3 py-1.5 rounded text-sm font-medium ' + (running ? 'bg-yellow-600 text-white' : 'bg-indigo-600 text-white')
          }, running ? 'Pause' : (sampleCount === 0 ? 'Sample Trajectories' : 'Resume')),
          React.createElement('button', {
            onClick: resetSamples,
            className: 'px-3 py-1.5 bg-gray-700 text-white rounded text-sm font-medium'
          }, 'Reset'),
          React.createElement('span', { className: 'text-xs text-gray-400' },
            sampleCount.toLocaleString() + ' trajectories')
        ),
        React.createElement('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, className: 'w-full max-w-[680px]' },
          React.createElement('rect', { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: '#0f172a', rx: 4 }),

          // Zero line
          React.createElement('line', {
            x1: toX(0), y1: pad.top, x2: toX(0), y2: pad.top + plotH,
            stroke: '#4b5563', strokeWidth: 1.5, strokeDasharray: '4,3'
          }),
          React.createElement('text', { x: toX(0) + 3, y: pad.top + 12, fill: '#6b7280', fontSize: '9' }, '\u2190 backward | forward \u2192'),

          // Mean line
          mean !== 0 ? React.createElement('line', {
            x1: toX(mean), y1: pad.top, x2: toX(mean), y2: pad.top + plotH,
            stroke: arrowColor, strokeWidth: 2, strokeDasharray: '6,3'
          }) : null,
          React.createElement('text', {
            x: toX(mean) + 4, y: pad.top + 24,
            fill: arrowColor, fontSize: '9'
          }, 'mean=' + mean.toFixed(2)),

          // Histogram bars
          bins.map(function(count, i) {
            if (count === 0) return null;
            var x = pad.left + i * barPxW;
            var binCenter = BIN_MIN + (i + 0.5) * binW;
            var h = (count / maxBin) * plotH;
            var y = pad.top + plotH - h;
            var color = binCenter > 0 ? '#22c55e' : '#ef4444';
            return React.createElement('rect', {
              key: 'b-' + i, x: x, y: y, width: barPxW, height: h,
              fill: color, opacity: 0.7
            });
          }),

          // Gaussian overlay
          sampleCount > 0 ? React.createElement('path', {
            d: gaussPath.join(' '), fill: 'none',
            stroke: '#f8fafc', strokeWidth: 2, opacity: 0.9
          }) : null,

          // X-axis ticks
          [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map(function(v) {
            return React.createElement('g', { key: 'xt-' + v },
              React.createElement('line', { x1: toX(v), y1: pad.top + plotH, x2: toX(v), y2: pad.top + plotH + 4, stroke: '#6b7280' }),
              React.createElement('text', { x: toX(v), y: H - pad.bottom + 14, fill: '#9ca3af', fontSize: '10', textAnchor: 'middle' }, v)
            );
          }),

          // X-axis label
          React.createElement('text', {
            x: pad.left + plotW / 2, y: H - 5,
            fill: '#d1d5db', fontSize: '11', textAnchor: 'middle'
          }, 'ln \u211e\u2093   (arrow of time quantifier)')
        )
      ),

      // Info panel
      React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-3 text-sm' },
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, '\u03a7 parameter'),
          React.createElement('div', { className: 'font-mono font-bold text-indigo-700' }, chiLabel)
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Mean \u27e8ln \u211e\u2093\u27e9'),
          React.createElement('div', { className: 'font-mono font-bold', style: { color: arrowColor } }, mean.toFixed(3))
        ),
        React.createElement('div', { className: 'bg-green-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Forward arrow (ln\u211e > 0)'),
          React.createElement('div', { className: 'font-mono font-bold text-green-600' }, forwardFrac.toFixed(1) + '%')
        ),
        React.createElement('div', { className: 'bg-red-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Backward arrow (ln\u211e < 0)'),
          React.createElement('div', { className: 'font-mono font-bold text-red-600' }, backwardFrac.toFixed(1) + '%')
        )
      ),

      // Key insight callout
      React.createElement('div', { className: 'mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800' },
        React.createElement('span', { className: 'font-semibold' }, 'Key result: '),
        '\u27e8ln \u211e\u2093\u27e9 \u2248 (T/2\u03c4)(3 + \u03a7). ',
        'At \u03a7 = \u22123 the arrow vanishes — forward and backward trajectories are indistinguishable. ',
        'At \u03a7 = \u22124 the arrow inverts: backward-in-time dynamics become more likely than forward ones.'
      )
    )
  );
}
