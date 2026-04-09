// Measurement Engine — hook aliases
var { useState: useStateENG } = React;

// Pre-computed curves from paper Figure 4 (qualitative reproduction)
// Time axis: 0..1 (normalized to T), 50 points
var N_PTS = 51;
var T_AXIS = Array.from({ length: N_PTS }, function(_, i) { return i / (N_PTS - 1); });

// Internal energy <H>_t under measurement (without feedback):
// Measurement pumps energy into the system: <H>_t increases from 0 to W_pump
// W_pump = -<H>_0 * T / tau (from paper)
var W_PUMP_MAX = 1.0; // normalized
var ENERGY_PUMP = T_AXIS.map(function(t) { return -W_PUMP_MAX * t; });

// Work output curves for the engine (feedback Hamiltonian with chi = -1)
// Ideal: W(t) = W_pump * t   (all pumped energy extracted)
// With delay 0.1T: extraction delayed, reduced
// With eta=0.7: only 70% efficiency
// With both: worst case, initially negative
function makeWorkCurve(eta, delay) {
  return T_AXIS.map(function(t) {
    var t_eff = Math.max(0, t - delay); // delayed feedback
    var raw = eta * W_PUMP_MAX * t_eff * (1 - 0.15 * Math.exp(-t_eff * 8));
    // The "both" case has transient negative output early
    if (eta < 0.6 && delay > 0.15) {
      raw = raw - 0.12 * Math.exp(-t_eff * 15) * (1 - t_eff);
    }
    return raw;
  });
}

function makeEnergyUnderFeedback(eta, delay) {
  // <H>_t with feedback: system is pinned closer to initial state
  // Ideal: <H>_t constant (all pumped energy extracted immediately)
  // With imperfections: <H>_t drifts slightly
  return T_AXIS.map(function(t) {
    var t_eff = Math.max(0, t - delay);
    var leakage = (1 - eta) * (-W_PUMP_MAX * t_eff * 0.6);
    var delay_drift = delay > 0 ? (-W_PUMP_MAX * Math.min(t, delay) * 0.5) : 0;
    return leakage + delay_drift;
  });
}

var ENGINE_SCENARIOS = [
  {
    label: 'Ideal (\u03b7=1, no delay)',
    eta: 1.0, delay: 0.0,
    color: '#3b82f6',
    work: makeWorkCurve(1.0, 0.0),
    energy: makeEnergyUnderFeedback(1.0, 0.0),
    desc: 'Perfect measurement efficiency and immediate feedback. All measurement-pumped energy is extracted as work.'
  },
  {
    label: '\u03b7=1, delay=0.1T',
    eta: 1.0, delay: 0.1,
    color: '#22c55e',
    work: makeWorkCurve(1.0, 0.1),
    energy: makeEnergyUnderFeedback(1.0, 0.1),
    desc: 'Feedback delayed by 10% of total time. Energy accumulates briefly before extraction begins.'
  },
  {
    label: '\u03b7=0.7, no delay',
    eta: 0.7, delay: 0.0,
    color: '#f59e0b',
    work: makeWorkCurve(0.7, 0.0),
    energy: makeEnergyUnderFeedback(0.7, 0.0),
    desc: '70% measurement efficiency. Imperfect readout means the feedback Hamiltonian cannot fully counteract decoherence.'
  },
  {
    label: '\u03b7=0.5, delay=0.2T',
    eta: 0.5, delay: 0.2,
    color: '#ef4444',
    work: makeWorkCurve(0.5, 0.2),
    energy: makeEnergyUnderFeedback(0.5, 0.2),
    desc: 'Both imperfections combined. Engine initially loses energy, eventually recovers positive output.'
  },
];

function MeasurementEngine() {
  var [selected, setSelected] = useStateENG(null); // null = show all
  var [showEnergy, setShowEnergy] = useStateENG(true);
  var [showWork, setShowWork] = useStateENG(true);

  var scenarios = selected !== null ? [ENGINE_SCENARIOS[selected]] : ENGINE_SCENARIOS;

  // SVG chart layout
  var W = 680, H = 300;
  var pad = { left: 55, right: 20, top: 20, bottom: 45 };
  var plotW = W - pad.left - pad.right;
  var plotH = H - pad.top - pad.bottom;

  var allWork = ENGINE_SCENARIOS.flatMap(function(s) { return s.work; });
  var allEnergy = ENGINE_SCENARIOS.flatMap(function(s) { return s.energy; });
  var yMin = Math.min(-0.05, Math.min.apply(null, allWork.concat(allEnergy)));
  var yMax = Math.max(1.1, Math.max.apply(null, allWork.concat(allEnergy)));

  var toX = function(t) { return pad.left + t * plotW; };
  var toY = function(v) { return pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH; };

  var makePath = function(data) {
    return T_AXIS.map(function(t, i) {
      return (i === 0 ? 'M' : 'L') + toX(t).toFixed(1) + ',' + toY(data[i]).toFixed(1);
    }).join(' ');
  };

  var pumpPath = makePath(ENERGY_PUMP);

  return (
    React.createElement('div', { className: 'mb-10' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Continuous Measurement Engine'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Continuous measurement pumps energy into the quantum system. A feedback Hamiltonian with \u03a7 = \u22121 can extract this as useful work, ',
        'acting as a Maxwell\u2019s Demon-type quantum engine. The paper shows this works under experimentally realistic conditions: ',
        'finite measurement efficiency \u03b7 and feedback delay \u03c4_delay.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showEnergy, onChange: function() { setShowEnergy(!showEnergy); } }),
          'Internal energy \u27e8H\u27e9\u209c'
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showWork, onChange: function() { setShowWork(!showWork); } }),
          'Work output W\u209c'
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Scenario:',
          React.createElement('select', {
            value: selected === null ? 'all' : selected,
            onChange: function(e) { setSelected(e.target.value === 'all' ? null : Number(e.target.value)); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 'all' }, 'All scenarios'),
            ENGINE_SCENARIOS.map(function(s, i) {
              return React.createElement('option', { key: i, value: i }, s.label);
            })
          )
        )
      ),

      // Chart
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, className: 'w-full max-w-[680px]' },
          React.createElement('rect', { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: '#0f172a', rx: 4 }),

          // Grid lines
          [0, 0.25, 0.5, 0.75, 1.0].map(function(t) {
            return React.createElement('g', { key: 'gx-' + t },
              React.createElement('line', { x1: toX(t), y1: pad.top, x2: toX(t), y2: pad.top + plotH, stroke: '#1e293b' }),
              React.createElement('text', { x: toX(t), y: H - pad.bottom + 18, fill: '#9ca3af', fontSize: '10', textAnchor: 'middle' }, t.toFixed(2) + 'T')
            );
          }),

          // Y axis
          [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0].filter(function(v) { return v >= yMin && v <= yMax; }).map(function(v) {
            return React.createElement('g', { key: 'gy-' + v },
              React.createElement('line', { x1: pad.left, y1: toY(v), x2: pad.left + plotW, y2: toY(v), stroke: '#1e293b' }),
              React.createElement('text', { x: pad.left - 5, y: toY(v) + 3, fill: '#9ca3af', fontSize: '9', textAnchor: 'end' }, v.toFixed(1))
            );
          }),

          // Zero line
          React.createElement('line', { x1: pad.left, y1: toY(0), x2: pad.left + plotW, y2: toY(0), stroke: '#4b5563', strokeDasharray: '4,3' }),

          // "No feedback" measurement pump curve (gray reference)
          React.createElement('path', { d: pumpPath, fill: 'none', stroke: '#374151', strokeWidth: 1.5, strokeDasharray: '6,4' }),
          React.createElement('text', { x: pad.left + plotW - 5, y: toY(ENERGY_PUMP[N_PTS - 1]) - 6, fill: '#4b5563', fontSize: '9', textAnchor: 'end' }, 'no feedback'),

          // Scenario curves
          scenarios.map(function(sc, i) {
            return React.createElement('g', { key: 'sc-' + i },
              // Energy curve (solid)
              showEnergy ? React.createElement('path', { d: makePath(sc.energy), fill: 'none', stroke: sc.color, strokeWidth: 2, opacity: 0.7 }) : null,
              // Work curve (dashed)
              showWork ? React.createElement('path', { d: makePath(sc.work), fill: 'none', stroke: sc.color, strokeWidth: 2.5, strokeDasharray: selected !== null ? undefined : '8,3' }) : null
            );
          }),

          // Axis labels
          React.createElement('text', { x: pad.left + plotW / 2, y: H - 5, fill: '#d1d5db', fontSize: '11', textAnchor: 'middle' }, 'Time t'),
          React.createElement('text', {
            x: 12, y: pad.top + plotH / 2, fill: '#d1d5db', fontSize: '11', textAnchor: 'middle',
            transform: 'rotate(-90,12,' + (pad.top + plotH / 2) + ')'
          }, 'Energy (normalized)')
        )
      ),

      // Legend
      React.createElement('div', { className: 'flex flex-wrap gap-4 mb-4 text-sm' },
        ENGINE_SCENARIOS.map(function(sc, i) {
          var isSelected = selected === i || selected === null;
          return React.createElement('div', {
            key: i,
            className: 'flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded transition-colors ' +
              (selected === i ? 'bg-gray-100' : 'hover:bg-gray-50'),
            onClick: function() { setSelected(selected === i ? null : i); }
          },
            React.createElement('div', { className: 'w-5 h-1 rounded', style: { backgroundColor: sc.color, opacity: isSelected ? 1 : 0.3 } }),
            React.createElement('span', { className: isSelected ? 'text-gray-700' : 'text-gray-400' }, sc.label)
          );
        })
      ),

      // Selected scenario description
      selected !== null ? React.createElement('div', { className: 'bg-gray-100 rounded-lg p-3 text-sm text-gray-700 mb-4' },
        React.createElement('span', { className: 'font-semibold', style: { color: ENGINE_SCENARIOS[selected].color } },
          ENGINE_SCENARIOS[selected].label + ': '
        ),
        ENGINE_SCENARIOS[selected].desc
      ) : null,

      // Line style legend
      showEnergy && showWork ? React.createElement('div', { className: 'flex gap-6 text-xs text-gray-500 mb-4' },
        React.createElement('span', null, '\u2014\u2014\u2014  \u27e8H\u27e9\u209c (internal energy with feedback)'),
        React.createElement('span', null, '- - -  W\u209c (work output)')
      ) : null,

      // Key physics callout
      React.createElement('div', { className: 'bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800' },
        React.createElement('span', { className: 'font-semibold' }, 'Engine mechanism: '),
        'Measurement pumps energy into \u27e8H\u27e9 at rate d\u27e8H\u27e9/dt = (r\u209c/\u03c4) cov(A, H). ',
        'The feedback Hamiltonian with \u03a7 = \u22121 extracts work W\u209c = \u2212\u27e8H\u27e9\u2080/(2\u03c4) \u00b7 T. ',
        'Crucially, this works under realistic conditions: the engine remains functional even at \u03b7 = 0.5 and \u03c4_delay = 0.2T.'
      )
    )
  );
}
