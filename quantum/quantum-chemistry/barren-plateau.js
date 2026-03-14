var { useState: useStateBP, useEffect: useEffectBP, useRef: useRefBP, useCallback: useCallbackBP } = React;

// Generate a synthetic gradient landscape
// For fewer qubits: clear gradient toward minimum; for more qubits: nearly flat
function generateGradientField(nQubits, gridSize) {
  var grid = [];
  // Variance of gradients decays exponentially with qubit count
  var gradientScale = Math.exp(-0.35 * nQubits);
  var noiseBase = 0.002;

  for (var r = 0; r < gridSize; r++) {
    var row = [];
    for (var c = 0; c < gridSize; c++) {
      var t1 = (c / (gridSize - 1)) * Math.PI;
      var t2 = (r / (gridSize - 1)) * Math.PI;

      // Base gradient: distance from minimum at (π/3, π/4)
      var d1 = t1 - Math.PI / 3;
      var d2 = t2 - Math.PI / 4;
      var dist = Math.sqrt(d1 * d1 + d2 * d2);
      var baseGrad = dist * 0.5;

      // Add structured variation
      var variation = 0.15 * Math.sin(t1 * 3) * Math.cos(t2 * 2) + 0.1 * Math.cos(t1 * 5 + t2 * 3);

      // Scale by qubit count (barren plateau effect)
      var grad = (baseGrad + Math.abs(variation)) * gradientScale;

      // Add small noise floor
      var noise = noiseBase * (0.5 + 0.5 * Math.sin(r * 7.3 + c * 11.1));
      grad = Math.max(grad, noise);

      row.push(grad);
    }
    grid.push(row);
  }
  return grid;
}

// Pre-compute optimizer paths
function generateOptimizerPath(nQubits, gridSize) {
  var steps = 25;
  var path = [];
  // Start at (0.7, 0.8) normalized
  var x = 0.7 * gridSize;
  var y = 0.8 * gridSize;
  // Target at (π/3 / π, π/4 / π) normalized = (0.333, 0.25)
  var tx = 0.333 * gridSize;
  var ty = 0.25 * gridSize;

  var stepScale = Math.exp(-0.3 * nQubits);
  var lr = 2.0 * stepScale;

  for (var i = 0; i < steps; i++) {
    path.push({ x: Math.round(x), y: Math.round(y) });
    var dx = tx - x;
    var dy = ty - y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) break;
    // Move toward target, but slower for more qubits
    x += dx / dist * lr + (Math.sin(i * 2.1) * 0.3);
    y += dy / dist * lr + (Math.cos(i * 3.7) * 0.3);
    x = Math.max(0, Math.min(gridSize - 1, x));
    y = Math.max(0, Math.min(gridSize - 1, y));
  }
  return path;
}

var GRID_SIZE = 25;
var QUBIT_COUNTS = [4, 8, 12, 16];

// Pre-compute all grids and paths
var BP_GRIDS = {};
var BP_PATHS = {};
QUBIT_COUNTS.forEach(function(n) {
  BP_GRIDS[n] = generateGradientField(n, GRID_SIZE);
  BP_PATHS[n] = generateOptimizerPath(n, GRID_SIZE);
});

function BarrenPlateau() {
  var [nQubits, setNQubits] = useStateBP(4);
  var [showPath, setShowPath] = useStateBP(true);
  var [animStep, setAnimStep] = useStateBP(0);
  var [playing, setPlaying] = useStateBP(false);
  var timerRef = useRefBP(null);

  var grid = BP_GRIDS[nQubits];
  var path = BP_PATHS[nQubits];

  var reset = useCallbackBP(function() {
    setPlaying(false);
    setAnimStep(0);
  }, []);

  useEffectBP(function() {
    reset();
  }, [nQubits, reset]);

  useEffectBP(function() {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(function() {
      setAnimStep(function(s) {
        if (s >= path.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 300);
    return function() { clearInterval(timerRef.current); };
  }, [playing, path.length]);

  // Find max gradient for normalization
  var maxGrad = 0;
  BP_GRIDS[4].forEach(function(row) {
    row.forEach(function(v) { maxGrad = Math.max(maxGrad, v); });
  });

  // Heatmap dimensions
  var cellSize = 16;
  var heatW = GRID_SIZE * cellSize;
  var heatH = GRID_SIZE * cellSize;
  var svgW = heatW + 60;
  var svgH = heatH + 50;

  var gradToColor = function(v) {
    var norm = Math.min(v / maxGrad, 1);
    // Green (high gradient) to dark red (low/zero gradient)
    var r = Math.round(40 + 180 * (1 - norm));
    var g = Math.round(40 + 200 * norm);
    var b = Math.round(30 + 20 * norm);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  };

  // Variance for display
  var totalVar = 0;
  var count = 0;
  var mean = 0;
  grid.forEach(function(row) { row.forEach(function(v) { mean += v; count++; }); });
  mean /= count;
  grid.forEach(function(row) { row.forEach(function(v) { totalVar += (v - mean) * (v - mean); }); });
  totalVar /= count;

  // Compute gradient stats per qubit count for the bar chart
  var variances = QUBIT_COUNTS.map(function(n) {
    var g = BP_GRIDS[n];
    var m = 0, cnt = 0;
    g.forEach(function(row) { row.forEach(function(v) { m += v; cnt++; }); });
    m /= cnt;
    var variance = 0;
    g.forEach(function(row) { row.forEach(function(v) { variance += (v - m) * (v - m); }); });
    return variance / cnt;
  });
  var maxVar = Math.max.apply(null, variances);

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Barren Plateaus & Trainability'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'As qubits increase, the cost function gradient vanishes exponentially — the "barren plateau" problem. ',
        'The heatmap shows gradient magnitude across parameter space. With few qubits, there\'s a clear path to the minimum. ',
        'With many qubits, the landscape flattens and optimizers get stuck. This is one of the biggest open problems in variational quantum algorithms.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Qubits: ' + nQubits,
          React.createElement('input', {
            type: 'range', min: '4', max: '16', step: '4', value: nQubits,
            onChange: function(e) { setNQubits(Number(e.target.value)); },
            className: 'w-32'
          })
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showPath, onChange: function() { setShowPath(!showPath); } }),
          'Show optimizer path'
        ),
        React.createElement('button', {
          onClick: function() { reset(); setPlaying(true); },
          className: 'px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium'
        }, 'Run Optimizer'),
        React.createElement('button', {
          onClick: reset,
          className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium'
        }, 'Reset')
      ),

      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'flex flex-col md:flex-row gap-6' },

          // Heatmap
          React.createElement('div', null,
            React.createElement('div', { className: 'text-xs text-gray-400 mb-2' }, 'Gradient Magnitude (θ₁ vs θ₂)'),
            React.createElement('svg', { width: svgW, height: svgH, viewBox: '0 0 ' + svgW + ' ' + svgH, className: 'max-w-full' },

              // Heatmap cells
              grid.map(function(row, r) {
                return row.map(function(val, c) {
                  return React.createElement('rect', {
                    key: r + '-' + c,
                    x: 40 + c * cellSize, y: 10 + r * cellSize,
                    width: cellSize, height: cellSize,
                    fill: gradToColor(val)
                  });
                });
              }),

              // Minimum marker
              React.createElement('circle', {
                cx: 40 + 0.333 * GRID_SIZE * cellSize, cy: 10 + 0.25 * GRID_SIZE * cellSize,
                r: 6, fill: 'none', stroke: '#fbbf24', strokeWidth: 2
              }),
              React.createElement('text', {
                x: 40 + 0.333 * GRID_SIZE * cellSize + 10, y: 10 + 0.25 * GRID_SIZE * cellSize + 4,
                fill: '#fbbf24', fontSize: '9'
              }, 'min'),

              // Optimizer path
              showPath ? path.slice(0, animStep + 1).map(function(pt, i) {
                var px = 40 + pt.x * cellSize + cellSize / 2;
                var py = 10 + pt.y * cellSize + cellSize / 2;
                var isLast = i === animStep;
                return React.createElement('g', { key: 'path-' + i },
                  i > 0 ? React.createElement('line', {
                    x1: 40 + path[i-1].x * cellSize + cellSize / 2,
                    y1: 10 + path[i-1].y * cellSize + cellSize / 2,
                    x2: px, y2: py,
                    stroke: '#e5e7eb', strokeWidth: 1.5, opacity: 0.6
                  }) : null,
                  React.createElement('circle', {
                    cx: px, cy: py, r: isLast ? 5 : 2.5,
                    fill: isLast ? '#ef4444' : '#e5e7eb', opacity: isLast ? 1 : 0.6
                  })
                );
              }) : null,

              // Axis labels
              React.createElement('text', {
                x: 40 + heatW / 2, y: svgH - 5,
                fill: '#9ca3af', fontSize: '10', textAnchor: 'middle'
              }, 'θ₁'),
              React.createElement('text', {
                x: 10, y: 10 + heatH / 2,
                fill: '#9ca3af', fontSize: '10', textAnchor: 'middle',
                transform: 'rotate(-90, 10, ' + (10 + heatH / 2) + ')'
              }, 'θ₂')
            ),

            // Color scale
            React.createElement('div', { className: 'flex items-center gap-2 mt-2 text-xs text-gray-500' },
              React.createElement('span', null, '|∇E| :'),
              React.createElement('div', {
                style: { width: '100px', height: '12px', background: 'linear-gradient(to right, rgb(220,40,30), rgb(120,120,30), rgb(40,240,50))', borderRadius: '2px' }
              }),
              React.createElement('span', null, 'Low → High')
            )
          ),

          // Right: Variance chart + info
          React.createElement('div', { className: 'flex-1' },
            React.createElement('div', { className: 'text-xs text-gray-400 mb-2' }, 'Gradient Variance vs Qubit Count'),
            React.createElement('svg', { width: 250, height: 160, viewBox: '0 0 250 160', className: 'w-full max-w-[250px]' },
              React.createElement('rect', { x: 40, y: 10, width: 190, height: 110, fill: '#111827', rx: 4 }),

              QUBIT_COUNTS.map(function(n, i) {
                var barWidth = 30;
                var gap = 190 / QUBIT_COUNTS.length;
                var x = 40 + gap * i + (gap - barWidth) / 2;
                var barHeight = maxVar > 0 ? (variances[i] / maxVar) * 100 : 0;
                var y = 120 - barHeight;
                var isSelected = n === nQubits;
                return React.createElement('g', { key: 'bar-' + n },
                  React.createElement('rect', {
                    x: x, y: y, width: barWidth, height: barHeight,
                    fill: isSelected ? '#818cf8' : '#4b5563', rx: 3
                  }),
                  React.createElement('text', {
                    x: x + barWidth / 2, y: y - 5,
                    fill: '#9ca3af', fontSize: '8', textAnchor: 'middle'
                  }, variances[i].toExponential(1)),
                  React.createElement('text', {
                    x: x + barWidth / 2, y: 140,
                    fill: '#d1d5db', fontSize: '10', textAnchor: 'middle'
                  }, n + 'q')
                );
              })
            ),

            // Info cards
            React.createElement('div', { className: 'space-y-2 mt-4' },
              React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
                React.createElement('div', { className: 'text-gray-500' }, 'Gradient Variance'),
                React.createElement('div', { className: 'font-mono font-bold ' + (nQubits <= 8 ? 'text-green-600' : 'text-red-500') },
                  totalVar.toExponential(3)
                )
              ),
              React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
                React.createElement('div', { className: 'text-gray-500' }, 'Optimizer Progress'),
                React.createElement('div', { className: 'font-mono font-bold text-gray-700' },
                  'Step ' + animStep + '/' + (path.length - 1) +
                  (animStep >= path.length - 1 && nQubits > 8 ? ' (stuck!)' : '')
                )
              ),
              React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
                React.createElement('div', { className: 'text-gray-500' }, 'Trainability'),
                React.createElement('div', { className: 'font-mono font-bold ' + (nQubits <= 4 ? 'text-green-600' : nQubits <= 8 ? 'text-yellow-600' : 'text-red-600') },
                  nQubits <= 4 ? 'Good — clear gradient signal' :
                  nQubits <= 8 ? 'Degraded — convergence slows' :
                  'Barren plateau — exponentially flat'
                )
              )
            )
          )
        )
      )
    )
  );
}
