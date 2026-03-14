var { useState: useStateVEL, useEffect: useEffectVEL, useRef: useRefVEL, useCallback: useCallbackVEL } = React;

// Generate a 2-parameter energy surface for VQE
// E(θ₁, θ₂) = a + b*cos(θ₁) + c*cos(θ₂) + d*cos(θ₁)*cos(θ₂) + noise
var LANDSCAPE_CONFIG = {
  H2: {
    label: 'H₂',
    gridSize: 35,
    exactEnergy: -1.1372,
    // Surface parameters
    a: -0.85, b: -0.15, c: -0.12, d: -0.05,
    // Optimizer path (pre-computed gradient descent steps)
    optimizerStart: { t1: 2.5, t2: 2.2 },
    optimizerSteps: 30,
    learningRate: 0.12,
  },
  LiH: {
    label: 'LiH',
    gridSize: 35,
    exactEnergy: -7.8825,
    a: -7.60, b: -0.18, c: -0.10, d: -0.08,
    optimizerStart: { t1: 2.8, t2: 1.9 },
    optimizerSteps: 35,
    learningRate: 0.10,
  }
};

function computeSurface(config) {
  var n = config.gridSize;
  var theta1 = [];
  var theta2 = [];
  var energy = [];

  for (var i = 0; i < n; i++) {
    theta1.push((i / (n - 1)) * Math.PI);
  }
  for (var j = 0; j < n; j++) {
    theta2.push((j / (n - 1)) * Math.PI);
  }

  for (var j = 0; j < n; j++) {
    var row = [];
    for (var i = 0; i < n; i++) {
      var t1 = theta1[i];
      var t2 = theta2[j];
      var e = config.a + config.b * Math.cos(t1) + config.c * Math.cos(t2) +
              config.d * Math.cos(t1) * Math.cos(t2) +
              0.02 * Math.sin(3 * t1) * Math.sin(2 * t2) +
              0.015 * Math.cos(5 * t1 + t2);
      row.push(e);
    }
    energy.push(row);
  }

  return { theta1: theta1, theta2: theta2, energy: energy };
}

function computeOptimizerPath(config, surface) {
  var path = [];
  var t1 = config.optimizerStart.t1;
  var t2 = config.optimizerStart.t2;
  var lr = config.learningRate;
  var dt = 0.001;

  var getEnergy = function(a, b) {
    return config.a + config.b * Math.cos(a) + config.c * Math.cos(b) +
           config.d * Math.cos(a) * Math.cos(b) +
           0.02 * Math.sin(3 * a) * Math.sin(2 * b) +
           0.015 * Math.cos(5 * a + b);
  };

  for (var i = 0; i < config.optimizerSteps; i++) {
    var e = getEnergy(t1, t2);
    path.push({ t1: t1, t2: t2, energy: e });

    // Numerical gradient
    var dE_dt1 = (getEnergy(t1 + dt, t2) - getEnergy(t1 - dt, t2)) / (2 * dt);
    var dE_dt2 = (getEnergy(t1, t2 + dt) - getEnergy(t1, t2 - dt)) / (2 * dt);

    t1 -= lr * dE_dt1;
    t2 -= lr * dE_dt2;

    // Clamp to [0, π]
    t1 = Math.max(0, Math.min(Math.PI, t1));
    t2 = Math.max(0, Math.min(Math.PI, t2));
  }

  return path;
}

// Pre-compute surfaces and paths
var SURFACES = {};
var OPT_PATHS = {};
Object.keys(LANDSCAPE_CONFIG).forEach(function(key) {
  var config = LANDSCAPE_CONFIG[key];
  SURFACES[key] = computeSurface(config);
  OPT_PATHS[key] = computeOptimizerPath(config, SURFACES[key]);
});

function VQEEnergyLandscape() {
  var [molecule, setMolecule] = useStateVEL('H2');
  var [animStep, setAnimStep] = useStateVEL(0);
  var [playing, setPlaying] = useStateVEL(false);
  var [showExactPlane, setShowExactPlane] = useStateVEL(true);
  var plotRef = useRefVEL(null);
  var timerRef = useRefVEL(null);

  var config = LANDSCAPE_CONFIG[molecule];
  var surface = SURFACES[molecule];
  var optPath = OPT_PATHS[molecule];
  var maxStep = optPath.length - 1;

  var reset = useCallbackVEL(function() {
    setPlaying(false);
    setAnimStep(0);
  }, []);

  useEffectVEL(function() {
    reset();
  }, [molecule, reset]);

  useEffectVEL(function() {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(function() {
      setAnimStep(function(s) {
        if (s >= maxStep) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 200);
    return function() { clearInterval(timerRef.current); };
  }, [playing, maxStep]);

  // Render Plotly chart
  useEffectVEL(function() {
    if (!plotRef.current || typeof Plotly === 'undefined') return;

    var traces = [];

    // Energy surface
    traces.push({
      type: 'surface',
      x: surface.theta1,
      y: surface.theta2,
      z: surface.energy,
      colorscale: [
        [0, 'rgb(30, 60, 120)'],
        [0.3, 'rgb(50, 100, 180)'],
        [0.5, 'rgb(80, 140, 200)'],
        [0.7, 'rgb(150, 180, 220)'],
        [1, 'rgb(220, 220, 240)']
      ],
      opacity: 0.85,
      showscale: true,
      colorbar: { title: 'E (Ha)', titleside: 'right', len: 0.6, thickness: 15 },
      contours: {
        z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: false } }
      },
      hovertemplate: 'θ₁: %{x:.2f}<br>θ₂: %{y:.2f}<br>E: %{z:.4f} Ha<extra></extra>'
    });

    // Exact ground state plane
    if (showExactPlane) {
      var planeZ = [];
      for (var j = 0; j < surface.theta2.length; j++) {
        var row = [];
        for (var i = 0; i < surface.theta1.length; i++) {
          row.push(config.exactEnergy);
        }
        planeZ.push(row);
      }
      traces.push({
        type: 'surface',
        x: surface.theta1,
        y: surface.theta2,
        z: planeZ,
        opacity: 0.3,
        colorscale: [[0, 'rgb(34, 197, 94)'], [1, 'rgb(34, 197, 94)']],
        showscale: false,
        hovertemplate: 'Exact: ' + config.exactEnergy.toFixed(4) + ' Ha<extra>Ground State</extra>'
      });
    }

    // Optimizer trajectory
    var pathSlice = optPath.slice(0, animStep + 1);
    traces.push({
      type: 'scatter3d',
      mode: 'lines+markers',
      x: pathSlice.map(function(p) { return p.t1; }),
      y: pathSlice.map(function(p) { return p.t2; }),
      z: pathSlice.map(function(p) { return p.energy + 0.005; }),
      line: { color: '#ef4444', width: 4 },
      marker: {
        size: pathSlice.map(function(_, i) { return i === pathSlice.length - 1 ? 8 : 3; }),
        color: pathSlice.map(function(_, i) { return i === pathSlice.length - 1 ? '#ef4444' : '#fca5a5'; }),
      },
      name: 'Optimizer',
      hovertemplate: 'θ₁: %{x:.2f}<br>θ₂: %{y:.2f}<br>E: %{z:.4f} Ha<extra>Step %{pointNumber}</extra>'
    });

    var layout = {
      scene: {
        xaxis: { title: 'θ₁', range: [0, Math.PI], color: '#9ca3af' },
        yaxis: { title: 'θ₂', range: [0, Math.PI], color: '#9ca3af' },
        zaxis: { title: 'Energy (Ha)', color: '#9ca3af' },
        bgcolor: '#111827',
        camera: { eye: { x: 1.5, y: 1.5, z: 0.8 } }
      },
      paper_bgcolor: '#111827',
      plot_bgcolor: '#111827',
      font: { color: '#d1d5db', size: 11 },
      margin: { l: 10, r: 10, t: 30, b: 10 },
      showlegend: false,
      width: 600,
      height: 420,
    };

    Plotly.react(plotRef.current, traces, layout, { responsive: true, displayModeBar: false });
  }, [molecule, animStep, showExactPlane, surface, optPath, config]);

  // Cleanup
  useEffectVEL(function() {
    return function() {
      if (plotRef.current && typeof Plotly !== 'undefined') {
        Plotly.purge(plotRef.current);
      }
    };
  }, []);

  var currentPoint = optPath[animStep];

  // Circuit ansatz SVG
  var circW = 200, circH = 90;
  var nParams = molecule === 'H2' ? 2 : 4;

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'VQE Energy Landscape'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'The VQE optimizer navigates a parameterized energy surface to find the molecular ground state. ',
        'The 3D surface shows energy as a function of two variational parameters (θ₁, θ₂). ',
        'The red trajectory traces the optimizer\'s gradient descent path toward the minimum. ',
        'The green plane marks the exact ground state energy.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Molecule:',
          React.createElement('select', {
            value: molecule,
            onChange: function(e) { setMolecule(e.target.value); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 'H2' }, 'H₂'),
            React.createElement('option', { value: 'LiH' }, 'LiH')
          )
        ),
        React.createElement('button', {
          onClick: function() { reset(); setPlaying(true); },
          className: 'px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium'
        }, 'Run Optimizer'),
        playing ? React.createElement('button', {
          onClick: function() { setPlaying(false); },
          className: 'px-4 py-2 bg-yellow-600 text-white rounded text-sm font-medium'
        }, 'Pause') : null,
        React.createElement('button', {
          onClick: reset,
          className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium'
        }, 'Reset'),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showExactPlane, onChange: function() { setShowExactPlane(!showExactPlane); } }),
          'Show exact energy plane'
        )
      ),

      // Main content: 3D plot + sidebar
      React.createElement('div', { className: 'flex flex-col md:flex-row gap-4' },

        // 3D Plot
        React.createElement('div', { className: 'bg-gray-900 rounded-lg p-2 flex-1' },
          React.createElement('div', { ref: plotRef, style: { width: '100%', maxWidth: '600px' } })
        ),

        // Sidebar
        React.createElement('div', { className: 'w-full md:w-56 space-y-3' },

          // Circuit ansatz
          React.createElement('div', { className: 'bg-gray-900 rounded-lg p-3' },
            React.createElement('div', { className: 'text-xs text-gray-400 mb-2' }, 'Circuit Ansatz'),
            React.createElement('svg', { width: circW, height: circH, viewBox: '0 0 ' + circW + ' ' + circH, className: 'w-full' },
              React.createElement('rect', { x: 0, y: 0, width: circW, height: circH, fill: '#111827', rx: 4 }),
              // Two qubit wires
              React.createElement('text', { x: 5, y: 30, fill: '#9ca3af', fontSize: '9' }, '|0⟩'),
              React.createElement('line', { x1: 25, y1: 27, x2: circW - 10, y2: 27, stroke: '#4b5563', strokeWidth: 1 }),
              React.createElement('text', { x: 5, y: 60, fill: '#9ca3af', fontSize: '9' }, '|0⟩'),
              React.createElement('line', { x1: 25, y1: 57, x2: circW - 10, y2: 57, stroke: '#4b5563', strokeWidth: 1 }),
              // Ry gates with current values
              React.createElement('rect', { x: 40, y: 17, width: 40, height: 20, rx: 3, fill: '#1e1b4b', stroke: '#6366f1', strokeWidth: 1 }),
              React.createElement('text', { x: 60, y: 30, fill: '#c7d2fe', fontSize: '8', textAnchor: 'middle' }, 'Ry(' + currentPoint.t1.toFixed(2) + ')'),
              React.createElement('rect', { x: 40, y: 47, width: 40, height: 20, rx: 3, fill: '#1e1b4b', stroke: '#6366f1', strokeWidth: 1 }),
              React.createElement('text', { x: 60, y: 60, fill: '#c7d2fe', fontSize: '8', textAnchor: 'middle' }, 'Ry(' + currentPoint.t2.toFixed(2) + ')'),
              // CNOT
              React.createElement('line', { x1: 105, y1: 27, x2: 105, y2: 57, stroke: '#6366f1', strokeWidth: 1 }),
              React.createElement('circle', { cx: 105, cy: 27, r: 3, fill: '#6366f1' }),
              React.createElement('circle', { cx: 105, cy: 57, r: 6, fill: 'none', stroke: '#6366f1', strokeWidth: 1.5 }),
              React.createElement('line', { x1: 99, y1: 57, x2: 111, y2: 57, stroke: '#6366f1', strokeWidth: 1 }),
              React.createElement('line', { x1: 105, y1: 51, x2: 105, y2: 63, stroke: '#6366f1', strokeWidth: 1 }),
              // Measurement
              React.createElement('rect', { x: 135, y: 19, width: 14, height: 14, rx: 2, fill: 'none', stroke: '#60a5fa', strokeWidth: 1 }),
              React.createElement('text', { x: 142, y: 30, fill: '#60a5fa', fontSize: '8', textAnchor: 'middle' }, 'M'),
              React.createElement('rect', { x: 135, y: 49, width: 14, height: 14, rx: 2, fill: 'none', stroke: '#60a5fa', strokeWidth: 1 }),
              React.createElement('text', { x: 142, y: 60, fill: '#60a5fa', fontSize: '8', textAnchor: 'middle' }, 'M')
            )
          ),

          // Current state info
          React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
            React.createElement('div', { className: 'text-gray-500' }, 'Optimizer Step'),
            React.createElement('div', { className: 'font-mono font-bold text-gray-700' }, animStep + ' / ' + maxStep)
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
            React.createElement('div', { className: 'text-gray-500' }, 'Current Energy'),
            React.createElement('div', { className: 'font-mono font-bold text-indigo-600' }, currentPoint.energy.toFixed(4) + ' Ha')
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
            React.createElement('div', { className: 'text-gray-500' }, 'Exact Energy'),
            React.createElement('div', { className: 'font-mono font-bold text-green-600' }, config.exactEnergy.toFixed(4) + ' Ha')
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
            React.createElement('div', { className: 'text-gray-500' }, 'Error'),
            React.createElement('div', { className: 'font-mono font-bold text-red-500' },
              (Math.abs(currentPoint.energy - config.exactEnergy) * 1000).toFixed(2) + ' mHa'
            )
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-2 text-xs' },
            React.createElement('div', { className: 'text-gray-500' }, 'Parameters'),
            React.createElement('div', { className: 'font-mono text-gray-700' },
              'θ₁ = ' + currentPoint.t1.toFixed(3)
            ),
            React.createElement('div', { className: 'font-mono text-gray-700' },
              'θ₂ = ' + currentPoint.t2.toFixed(3)
            )
          )
        )
      )
    )
  );
}
