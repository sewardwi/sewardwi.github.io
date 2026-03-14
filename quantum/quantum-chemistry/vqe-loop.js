var { useState, useEffect, useRef, useCallback } = React;

// Pre-baked VQE convergence data (STO-3G basis)
var VQE_DATA = {
  H2: {
    label: 'H₂',
    qubits: 2,
    exactEnergy: -1.1372,
    hfEnergy: -1.1175,
    gates: ['Ry(θ₁)', 'CNOT', 'Ry(θ₂)'],
    steps: [
      { energy: -1.0500, theta: [0.10, 0.05] },
      { energy: -1.0780, theta: [0.18, 0.09] },
      { energy: -1.0950, theta: [0.25, 0.14] },
      { energy: -1.1050, theta: [0.31, 0.18] },
      { energy: -1.1120, theta: [0.36, 0.21] },
      { energy: -1.1170, theta: [0.40, 0.23] },
      { energy: -1.1210, theta: [0.43, 0.25] },
      { energy: -1.1240, theta: [0.46, 0.26] },
      { energy: -1.1265, theta: [0.48, 0.27] },
      { energy: -1.1285, theta: [0.50, 0.28] },
      { energy: -1.1300, theta: [0.51, 0.28] },
      { energy: -1.1315, theta: [0.52, 0.29] },
      { energy: -1.1325, theta: [0.53, 0.29] },
      { energy: -1.1335, theta: [0.54, 0.29] },
      { energy: -1.1342, theta: [0.54, 0.29] },
      { energy: -1.1350, theta: [0.55, 0.30] },
      { energy: -1.1355, theta: [0.55, 0.30] },
      { energy: -1.1360, theta: [0.56, 0.30] },
      { energy: -1.1365, theta: [0.56, 0.30] },
      { energy: -1.1370, theta: [0.56, 0.30] },
    ]
  },
  LiH: {
    label: 'LiH',
    qubits: 4,
    exactEnergy: -7.8825,
    hfEnergy: -7.8607,
    gates: ['Ry(θ₁)', 'CNOT', 'Ry(θ₂)', 'CNOT', 'Ry(θ₃)', 'CNOT', 'Ry(θ₄)'],
    steps: [
      { energy: -7.7200, theta: [0.05, 0.02, 0.08, 0.01] },
      { energy: -7.7600, theta: [0.10, 0.05, 0.14, 0.03] },
      { energy: -7.7900, theta: [0.16, 0.08, 0.19, 0.05] },
      { energy: -7.8100, theta: [0.21, 0.11, 0.23, 0.07] },
      { energy: -7.8250, theta: [0.25, 0.14, 0.27, 0.09] },
      { energy: -7.8370, theta: [0.29, 0.16, 0.30, 0.10] },
      { energy: -7.8460, theta: [0.32, 0.18, 0.32, 0.11] },
      { energy: -7.8530, theta: [0.35, 0.19, 0.34, 0.12] },
      { energy: -7.8580, theta: [0.37, 0.20, 0.35, 0.13] },
      { energy: -7.8620, theta: [0.39, 0.21, 0.36, 0.13] },
      { energy: -7.8650, theta: [0.40, 0.22, 0.37, 0.14] },
      { energy: -7.8680, theta: [0.41, 0.22, 0.37, 0.14] },
      { energy: -7.8700, theta: [0.42, 0.23, 0.38, 0.14] },
      { energy: -7.8720, theta: [0.43, 0.23, 0.38, 0.15] },
      { energy: -7.8740, theta: [0.43, 0.24, 0.39, 0.15] },
      { energy: -7.8755, theta: [0.44, 0.24, 0.39, 0.15] },
      { energy: -7.8770, theta: [0.44, 0.24, 0.39, 0.15] },
      { energy: -7.8785, theta: [0.44, 0.24, 0.40, 0.15] },
      { energy: -7.8800, theta: [0.45, 0.25, 0.40, 0.15] },
      { energy: -7.8815, theta: [0.45, 0.25, 0.40, 0.15] },
    ]
  }
};

var STAGES = [
  { id: 'circuit', label: 'Quantum\nCircuit', color: '#818cf8', icon: '⟨ψ(θ)⟩' },
  { id: 'measure', label: 'Measure\n⟨H⟩', color: '#60a5fa', icon: '📏' },
  { id: 'expect', label: 'Energy\nEstimate', color: '#34d399', icon: 'E(θ)' },
  { id: 'optimize', label: 'Classical\nOptimizer', color: '#fbbf24', icon: '∇E' },
];

function VQELoop() {
  var [molecule, setMolecule] = useState('H2');
  var [iteration, setIteration] = useState(0);
  var [activeStage, setActiveStage] = useState(0);
  var [playing, setPlaying] = useState(false);
  var [speed, setSpeed] = useState(1);
  var timerRef = useRef(null);

  var data = VQE_DATA[molecule];
  var maxIter = data.steps.length - 1;
  var currentStep = data.steps[iteration];

  var reset = useCallback(function() {
    setPlaying(false);
    setIteration(0);
    setActiveStage(0);
  }, []);

  useEffect(function() {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    var interval = 600 / speed;
    timerRef.current = setInterval(function() {
      setActiveStage(function(s) {
        if (s >= 3) {
          setIteration(function(it) {
            if (it >= maxIter) {
              setPlaying(false);
              return it;
            }
            return it + 1;
          });
          return 0;
        }
        return s + 1;
      });
    }, interval);
    return function() { clearInterval(timerRef.current); };
  }, [playing, speed, maxIter]);

  useEffect(function() {
    reset();
  }, [molecule, reset]);

  // ---- Layout ----
  // Loop diagram (left side)
  var loopW = 340, loopH = 280;
  var boxW = 120, boxH = 60;
  var loopCX = loopW / 2, loopCY = 130;
  var loopR = 100;

  var positions = [
    { x: loopCX - loopR, y: loopCY - loopR + 10 },
    { x: loopCX + loopR, y: loopCY - loopR + 10 },
    { x: loopCX + loopR, y: loopCY + loopR - 50 },
    { x: loopCX - loopR, y: loopCY + loopR - 50 },
  ];

  var arrows = [];
  for (var i = 0; i < 4; i++) {
    var from = positions[i];
    var to = positions[(i + 1) % 4];
    var fx = from.x + boxW / 2, fy = from.y + boxH / 2;
    var tx = to.x + boxW / 2, ty = to.y + boxH / 2;
    var dx = tx - fx, dy = ty - fy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var nx = dx / dist, ny = dy / dist;
    arrows.push({
      sx: fx + nx * (boxW / 2 + 5), sy: fy + ny * (boxH / 2 + 5),
      ex: tx - nx * (boxW / 2 + 5), ey: ty - ny * (boxH / 2 + 5),
      active: activeStage === i, key: i
    });
  }

  // Circuit diagram (right-top panel)
  var circW = 340, circH = 120;
  var nQubits = data.qubits;
  var wireY0 = 30, wireSpacing = 25;
  var gateW = 36, gateH = 20;

  // Build gate positions for circuit
  var gatePositions = [];
  var gx = 50;
  data.gates.forEach(function(gate, gi) {
    if (gate === 'CNOT') {
      gatePositions.push({ type: 'cnot', x: gx, qubit: gi % nQubits, target: (gi % nQubits + 1) % nQubits });
      gx += 30;
    } else {
      var thetaIdx = gatePositions.filter(function(g) { return g.type === 'ry'; }).length;
      var val = currentStep.theta[thetaIdx] || 0;
      gatePositions.push({ type: 'ry', x: gx, qubit: gi % nQubits, label: gate, value: val });
      gx += gateW + 8;
    }
  });

  // Convergence chart (right-bottom panel)
  var chartW = 340, chartH = 140;
  var chartPad = { left: 50, right: 15, top: 15, bottom: 30 };
  var plotW = chartW - chartPad.left - chartPad.right;
  var plotH = chartH - chartPad.top - chartPad.bottom;

  var allEnergies = data.steps.map(function(s) { return s.energy; });
  var eMin = Math.min(data.exactEnergy, Math.min.apply(null, allEnergies)) - 0.01;
  var eMax = Math.max(data.hfEnergy, Math.max.apply(null, allEnergies)) + 0.01;
  var toChartX = function(idx) { return chartPad.left + (idx / maxIter) * plotW; };
  var toChartY = function(e) { return chartPad.top + (1 - (e - eMin) / (eMax - eMin)) * plotH; };

  var convergencePath = data.steps.slice(0, iteration + 1).map(function(s, idx) {
    return (idx === 0 ? 'M' : 'L') + toChartX(idx).toFixed(1) + ',' + toChartY(s.energy).toFixed(1);
  }).join(' ');

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Quantum-Classical Hybrid VQE Loop'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'The VQE algorithm uses a hybrid feedback loop: a quantum computer prepares a parameterized trial state and measures the Hamiltonian expectation value, ',
        'then a classical optimizer updates the circuit parameters to minimize the energy. Watch the circuit evolve and energy converge.'
      ),

      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'flex flex-col md:flex-row gap-4' },

          // LEFT: Loop diagram
          React.createElement('svg', { width: loopW, height: loopH, viewBox: '0 0 ' + loopW + ' ' + loopH, className: 'flex-shrink-0' },
            React.createElement('defs', null,
              React.createElement('filter', { id: 'glow' },
                React.createElement('feGaussianBlur', { stdDeviation: '3', result: 'blur' }),
                React.createElement('feMerge', null,
                  React.createElement('feMergeNode', { in: 'blur' }),
                  React.createElement('feMergeNode', { in: 'SourceGraphic' })
                )
              ),
              React.createElement('marker', { id: 'arrowGray', markerWidth: '8', markerHeight: '6', refX: '8', refY: '3', orient: 'auto' },
                React.createElement('polygon', { points: '0,0 8,3 0,6', fill: '#6b7280' })
              ),
              React.createElement('marker', { id: 'arrowActive', markerWidth: '8', markerHeight: '6', refX: '8', refY: '3', orient: 'auto' },
                React.createElement('polygon', { points: '0,0 8,3 0,6', fill: '#fbbf24' })
              )
            ),

            // Arrows
            arrows.map(function(a) {
              return React.createElement('line', {
                key: 'arrow-' + a.key,
                x1: a.sx, y1: a.sy, x2: a.ex, y2: a.ey,
                stroke: a.active ? '#fbbf24' : '#4b5563',
                strokeWidth: a.active ? 3 : 2,
                markerEnd: a.active ? 'url(#arrowActive)' : 'url(#arrowGray)',
                filter: a.active ? 'url(#glow)' : undefined
              });
            }),

            // Stage boxes
            STAGES.map(function(stage, idx) {
              var pos = positions[idx];
              var isActive = activeStage === idx;
              var lines = stage.label.split('\n');
              return React.createElement('g', { key: stage.id },
                React.createElement('rect', {
                  x: pos.x, y: pos.y, width: boxW, height: boxH, rx: 10,
                  fill: isActive ? stage.color + '33' : '#1f2937',
                  stroke: isActive ? stage.color : '#4b5563',
                  strokeWidth: isActive ? 3 : 1.5,
                  filter: isActive ? 'url(#glow)' : undefined
                }),
                lines.map(function(line, li) {
                  return React.createElement('text', {
                    key: li,
                    x: pos.x + boxW / 2, y: pos.y + boxH / 2 + (li - (lines.length - 1) / 2) * 15,
                    fill: isActive ? stage.color : '#d1d5db',
                    fontSize: '11', fontWeight: isActive ? 'bold' : 'normal',
                    textAnchor: 'middle', dominantBaseline: 'central'
                  }, line);
                })
              );
            }),

            // Center label
            React.createElement('text', { x: loopCX, y: loopCY + 5, fill: '#9ca3af', fontSize: '13', fontWeight: 'bold', textAnchor: 'middle' }, 'VQE'),
            React.createElement('text', { x: loopCX, y: loopCY + 20, fill: '#6b7280', fontSize: '10', textAnchor: 'middle' }, 'Iter ' + iteration + '/' + maxIter),

            // Quantum / Classical labels
            React.createElement('text', { x: loopCX, y: 10, fill: '#818cf8', fontSize: '9', textAnchor: 'middle', opacity: 0.7 }, '— Quantum Side —'),
            React.createElement('text', { x: loopCX, y: loopH - 5, fill: '#fbbf24', fontSize: '9', textAnchor: 'middle', opacity: 0.7 }, '— Classical Side —')
          ),

          // RIGHT: Circuit + Convergence stacked
          React.createElement('div', { className: 'flex-1 flex flex-col gap-3' },

            // Circuit diagram
            React.createElement('div', null,
              React.createElement('div', { className: 'text-xs text-gray-400 mb-1' }, 'Ansatz Circuit (iteration ' + iteration + ')'),
              React.createElement('svg', { width: circW, height: circH, viewBox: '0 0 ' + circW + ' ' + circH, className: 'w-full' },
                React.createElement('rect', { x: 0, y: 0, width: circW, height: circH, fill: '#111827', rx: 6 }),

                // Qubit wires
                Array.from({ length: nQubits }).map(function(_, qi) {
                  var y = wireY0 + qi * wireSpacing;
                  return React.createElement('g', { key: 'wire-' + qi },
                    React.createElement('text', { x: 8, y: y + 4, fill: '#9ca3af', fontSize: '10' }, '|0⟩'),
                    React.createElement('line', { x1: 30, y1: y, x2: circW - 20, y2: y, stroke: '#4b5563', strokeWidth: 1 }),
                    // Measurement symbol at end
                    React.createElement('rect', { x: circW - 40, y: y - 8, width: 16, height: 16, rx: 2, fill: 'none', stroke: '#60a5fa', strokeWidth: 1 }),
                    React.createElement('text', { x: circW - 32, y: y + 4, fill: '#60a5fa', fontSize: '9', textAnchor: 'middle' }, 'M')
                  );
                }),

                // Gates
                gatePositions.map(function(gate, gi) {
                  var y = wireY0 + gate.qubit * wireSpacing;
                  if (gate.type === 'ry') {
                    var isHighlight = activeStage === 0;
                    return React.createElement('g', { key: 'gate-' + gi },
                      React.createElement('rect', {
                        x: gate.x - gateW / 2, y: y - gateH / 2, width: gateW, height: gateH, rx: 3,
                        fill: isHighlight ? '#818cf833' : '#1e1b4b',
                        stroke: isHighlight ? '#818cf8' : '#6366f1', strokeWidth: 1
                      }),
                      React.createElement('text', {
                        x: gate.x, y: y + 1, fill: '#c7d2fe', fontSize: '8', textAnchor: 'middle', dominantBaseline: 'central'
                      }, 'Ry(' + gate.value.toFixed(2) + ')')
                    );
                  } else {
                    // CNOT
                    var cy1 = wireY0 + gate.qubit * wireSpacing;
                    var cy2 = wireY0 + gate.target * wireSpacing;
                    return React.createElement('g', { key: 'gate-' + gi },
                      React.createElement('line', { x1: gate.x, y1: cy1, x2: gate.x, y2: cy2, stroke: '#6366f1', strokeWidth: 1 }),
                      React.createElement('circle', { cx: gate.x, cy: cy1, r: 3, fill: '#6366f1' }),
                      React.createElement('circle', { cx: gate.x, cy: cy2, r: 7, fill: 'none', stroke: '#6366f1', strokeWidth: 1.5 }),
                      React.createElement('line', { x1: gate.x, y1: cy2 - 7, x2: gate.x, y2: cy2 + 7, stroke: '#6366f1', strokeWidth: 1 }),
                      React.createElement('line', { x1: gate.x - 7, y1: cy2, x2: gate.x + 7, y2: cy2, stroke: '#6366f1', strokeWidth: 1 })
                    );
                  }
                })
              )
            ),

            // Convergence chart
            React.createElement('div', null,
              React.createElement('div', { className: 'text-xs text-gray-400 mb-1' }, 'Energy Convergence'),
              React.createElement('svg', { width: chartW, height: chartH, viewBox: '0 0 ' + chartW + ' ' + chartH, className: 'w-full' },
                React.createElement('rect', { x: chartPad.left, y: chartPad.top, width: plotW, height: plotH, fill: '#111827', rx: 4 }),

                // Y grid
                [0, 0.25, 0.5, 0.75, 1].map(function(f) {
                  var e = eMin + f * (eMax - eMin);
                  var y = toChartY(e);
                  return React.createElement('g', { key: 'yg-' + f },
                    React.createElement('line', { x1: chartPad.left, y1: y, x2: chartPad.left + plotW, y2: y, stroke: '#374151', strokeWidth: 0.5 }),
                    React.createElement('text', { x: chartPad.left - 4, y: y + 3, fill: '#9ca3af', fontSize: '9', textAnchor: 'end' }, e.toFixed(3))
                  );
                }),

                // Exact energy
                React.createElement('line', {
                  x1: chartPad.left, y1: toChartY(data.exactEnergy),
                  x2: chartPad.left + plotW, y2: toChartY(data.exactEnergy),
                  stroke: '#22c55e', strokeWidth: 1.5, strokeDasharray: '6,3'
                }),
                React.createElement('text', { x: chartPad.left + plotW + 2, y: toChartY(data.exactEnergy) + 3, fill: '#22c55e', fontSize: '8' }, 'Exact'),

                // HF energy
                React.createElement('line', {
                  x1: chartPad.left, y1: toChartY(data.hfEnergy),
                  x2: chartPad.left + plotW, y2: toChartY(data.hfEnergy),
                  stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4,4'
                }),
                React.createElement('text', { x: chartPad.left + plotW + 2, y: toChartY(data.hfEnergy) + 3, fill: '#f59e0b', fontSize: '8' }, 'HF'),

                // Convergence path
                iteration > 0 ? React.createElement('path', { d: convergencePath, fill: 'none', stroke: '#818cf8', strokeWidth: 2 }) : null,
                React.createElement('circle', { cx: toChartX(iteration), cy: toChartY(currentStep.energy), r: 4, fill: '#818cf8' }),

                // X-axis
                React.createElement('text', { x: chartPad.left + plotW / 2, y: chartH - 5, fill: '#9ca3af', fontSize: '9', textAnchor: 'middle' }, 'Iteration')
              )
            )
          )
        )
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('button', {
          onClick: function() { setPlaying(!playing); },
          className: 'px-4 py-2 rounded text-sm font-medium ' + (playing ? 'bg-yellow-600 text-white' : 'bg-indigo-600 text-white')
        }, playing ? 'Pause' : 'Play'),
        React.createElement('button', { onClick: reset, className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium' }, 'Reset'),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Speed:',
          React.createElement('select', { value: speed, onChange: function(e) { setSpeed(Number(e.target.value)); }, className: 'bg-gray-100 border rounded px-2 py-1 text-sm' },
            React.createElement('option', { value: 0.5 }, '0.5×'),
            React.createElement('option', { value: 1 }, '1×'),
            React.createElement('option', { value: 2 }, '2×'),
            React.createElement('option', { value: 4 }, '4×')
          )
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Molecule:',
          React.createElement('select', { value: molecule, onChange: function(e) { setMolecule(e.target.value); }, className: 'bg-gray-100 border rounded px-2 py-1 text-sm' },
            React.createElement('option', { value: 'H2' }, 'H₂'),
            React.createElement('option', { value: 'LiH' }, 'LiH')
          )
        )
      ),

      // Info panel
      React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-3 text-sm' },
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Current Energy'),
          React.createElement('div', { className: 'font-mono font-bold text-indigo-600' }, currentStep.energy.toFixed(4) + ' Ha')
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Exact Ground State'),
          React.createElement('div', { className: 'font-mono font-bold text-green-600' }, data.exactEnergy.toFixed(4) + ' Ha')
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Error'),
          React.createElement('div', { className: 'font-mono font-bold text-red-500' },
            (Math.abs(currentStep.energy - data.exactEnergy) * 1000).toFixed(2) + ' mHa'
          )
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Parameters (θ)'),
          React.createElement('div', { className: 'font-mono text-xs text-gray-700' },
            '[' + currentStep.theta.map(function(t) { return t.toFixed(2); }).join(', ') + ']'
          )
        )
      )
    )
  );
}
