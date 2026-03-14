var { useState: useStateHDec, useEffect: useEffectHDec, useRef: useRefHDec } = React;

// Pauli matrices (real parts only for visualization)
var PAULI_I = [[1,0],[0,1]];
var PAULI_X = [[0,1],[1,0]];
var PAULI_Y = [[0,0],[0,0]]; // imaginary — show as 0 for heatmap
var PAULI_Z = [[1,0],[0,-1]];
var PAULI_MAP = { I: PAULI_I, X: PAULI_X, Y: PAULI_Y, Z: PAULI_Z };

// Tensor product of two 2x2 matrices
function tensorProduct(a, b) {
  var n = a.length, m = b.length;
  var result = [];
  for (var i = 0; i < n; i++) {
    for (var k = 0; k < m; k++) {
      var row = [];
      for (var j = 0; j < n; j++) {
        for (var l = 0; l < m; l++) {
          row.push(a[i][j] * b[k][l]);
        }
      }
      result.push(row);
    }
  }
  return result;
}

// Molecule Hamiltonian decomposition data
var DECOMP_DATA = {
  H2: {
    label: 'H₂',
    size: 4,
    terms: [
      { label: 'I⊗I', ops: ['I','I'], coeff: -0.8126, group: 0 },
      { label: 'Z⊗I', ops: ['Z','I'], coeff: 0.1713, group: 0 },
      { label: 'I⊗Z', ops: ['I','Z'], coeff: 0.1713, group: 0 },
      { label: 'Z⊗Z', ops: ['Z','Z'], coeff: 0.1686, group: 0 },
      { label: 'X⊗X', ops: ['X','X'], coeff: 0.0454, group: 1 },
    ],
    groups: [
      { label: 'QWC Group 1', color: '#818cf8', indices: [0,1,2,3], desc: 'All diagonal — simultaneously measurable in Z-basis' },
      { label: 'QWC Group 2', color: '#f59e0b', indices: [4], desc: 'Off-diagonal — requires X-basis measurement' },
    ]
  },
  LiH: {
    label: 'LiH',
    size: 16,
    terms: [
      { label: 'IIII', ops: ['I','I','I','I'], coeff: -7.498, group: 0 },
      { label: 'ZIII', ops: ['Z','I','I','I'], coeff: 0.182, group: 0 },
      { label: 'IZII', ops: ['I','Z','I','I'], coeff: 0.182, group: 0 },
      { label: 'ZZII', ops: ['Z','Z','I','I'], coeff: 0.121, group: 0 },
      { label: 'IIZZ', ops: ['I','I','Z','Z'], coeff: 0.174, group: 0 },
      { label: 'ZIIZ', ops: ['Z','I','I','Z'], coeff: 0.035, group: 0 },
      { label: 'XIXI', ops: ['X','I','X','I'], coeff: 0.045, group: 1 },
      { label: 'YIYI', ops: ['Y','I','Y','I'], coeff: 0.045, group: 2 },
    ],
    groups: [
      { label: 'QWC Group 1', color: '#818cf8', indices: [0,1,2,3,4,5], desc: 'Z/I terms — diagonal, co-measurable' },
      { label: 'QWC Group 2', color: '#f59e0b', indices: [6], desc: 'X-type terms' },
      { label: 'QWC Group 3', color: '#ef4444', indices: [7], desc: 'Y-type terms' },
    ]
  }
};

function HamiltonianDecomposition() {
  var [molecule, setMolecule] = useStateHDec('H2');
  var [activeTermIdx, setActiveTermIdx] = useStateHDec(-1);
  var [animStep, setAnimStep] = useStateHDec(-1);
  var [animPlaying, setAnimPlaying] = useStateHDec(false);
  var timerRef = useRefHDec(null);

  var data = DECOMP_DATA[molecule];

  useEffectHDec(function() {
    setActiveTermIdx(-1);
    setAnimStep(-1);
    setAnimPlaying(false);
  }, [molecule]);

  useEffectHDec(function() {
    if (!animPlaying) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(function() {
      setAnimStep(function(s) {
        if (s >= data.terms.length - 1) {
          setAnimPlaying(false);
          return s;
        }
        var next = s + 1;
        setActiveTermIdx(next);
        return next;
      });
    }, 800);
    return function() { clearInterval(timerRef.current); };
  }, [animPlaying, data.terms.length]);

  var startAnim = function() {
    setAnimStep(-1);
    setActiveTermIdx(-1);
    setAnimPlaying(true);
  };

  // Build the full Hamiltonian matrix
  var computeTermMatrix = function(term) {
    var mat = PAULI_MAP[term.ops[0]];
    for (var i = 1; i < term.ops.length; i++) {
      mat = tensorProduct(mat, PAULI_MAP[term.ops[i]]);
    }
    return mat.map(function(row) {
      return row.map(function(v) { return v * term.coeff; });
    });
  };

  var fullMatrix = [];
  var size = data.size;
  for (var r = 0; r < size; r++) {
    fullMatrix.push(new Array(size).fill(0));
  }
  data.terms.forEach(function(term) {
    var m = computeTermMatrix(term);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        fullMatrix[r][c] += m[r][c];
      }
    }
  });

  // Active term matrix (if hovering/animating)
  var activeMatrix = null;
  if (activeTermIdx >= 0 && activeTermIdx < data.terms.length) {
    activeMatrix = computeTermMatrix(data.terms[activeTermIdx]);
  }

  // Matrix heatmap renderer
  var cellSize = molecule === 'H2' ? 28 : 14;
  var matW = size * cellSize;
  var maxVal = 0;
  fullMatrix.forEach(function(row) {
    row.forEach(function(v) { maxVal = Math.max(maxVal, Math.abs(v)); });
  });
  if (maxVal === 0) maxVal = 1;

  var valToColor = function(v, max) {
    var norm = v / max;
    if (norm > 0) {
      var g = Math.round(100 + 155 * norm);
      return 'rgb(30, ' + g + ', 80)';
    } else if (norm < 0) {
      var rd = Math.round(100 + 155 * Math.abs(norm));
      return 'rgb(' + rd + ', 30, 60)';
    }
    return '#1f2937';
  };

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Hamiltonian Decomposition'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'A molecular Hamiltonian is decomposed into a sum of Pauli strings (tensor products of I, X, Y, Z) for measurement on a quantum computer. ',
        'Terms that commute (qubitwise commuting / QWC) can be measured simultaneously, reducing total measurement circuits needed.'
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
            React.createElement('option', { value: 'H2' }, 'H₂ (4×4, 5 terms)'),
            React.createElement('option', { value: 'LiH' }, 'LiH (16×16, 8 shown)')
          )
        ),
        React.createElement('button', {
          onClick: startAnim,
          className: 'px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium'
        }, 'Animate Decomposition'),
        React.createElement('button', {
          onClick: function() { setActiveTermIdx(-1); setAnimStep(-1); setAnimPlaying(false); },
          className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium'
        }, 'Show Full H')
      ),

      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'flex flex-col md:flex-row gap-6 items-start' },

          // LEFT: Matrix heatmap
          React.createElement('div', null,
            React.createElement('div', { className: 'text-xs text-gray-400 mb-2' },
              activeTermIdx >= 0 ? ('Term: ' + data.terms[activeTermIdx].coeff.toFixed(4) + ' × ' + data.terms[activeTermIdx].label) : 'Full Hamiltonian Matrix'
            ),
            React.createElement('svg', {
              width: matW + 20, height: matW + 20,
              viewBox: '0 0 ' + (matW + 20) + ' ' + (matW + 20),
              className: 'max-w-full'
            },
              // Matrix cells
              (activeMatrix || fullMatrix).map(function(row, r) {
                var maxRef = activeMatrix ? Math.max.apply(null, data.terms.map(function(t) { return Math.abs(t.coeff); })) : maxVal;
                return row.map(function(val, c) {
                  return React.createElement('rect', {
                    key: r + '-' + c,
                    x: 10 + c * cellSize, y: 10 + r * cellSize,
                    width: cellSize - 1, height: cellSize - 1,
                    fill: valToColor(val, maxRef),
                    rx: 2
                  });
                });
              }),
              // Value labels for small matrices
              molecule === 'H2' ? (activeMatrix || fullMatrix).map(function(row, r) {
                return row.map(function(val, c) {
                  if (Math.abs(val) < 0.001) return null;
                  return React.createElement('text', {
                    key: 'v-' + r + '-' + c,
                    x: 10 + c * cellSize + cellSize / 2, y: 10 + r * cellSize + cellSize / 2 + 3,
                    fill: '#e5e7eb', fontSize: '8', textAnchor: 'middle'
                  }, val.toFixed(2));
                });
              }) : null
            ),
            // Color legend
            React.createElement('div', { className: 'flex items-center gap-3 mt-2 text-xs text-gray-500' },
              React.createElement('span', { style: { color: 'rgb(185, 30, 60)' } }, '■ Negative'),
              React.createElement('span', { style: { color: '#374151' } }, '■ Zero'),
              React.createElement('span', { style: { color: 'rgb(30, 200, 80)' } }, '■ Positive')
            )
          ),

          // RIGHT: Term list + commuting groups
          React.createElement('div', { className: 'flex-1' },
            React.createElement('div', { className: 'text-xs text-gray-400 mb-2' }, 'Pauli Term Decomposition'),
            React.createElement('div', { className: 'space-y-1 mb-4' },
              data.terms.map(function(term, i) {
                var group = data.groups[term.group];
                var isActive = activeTermIdx === i;
                var isRevealed = animStep >= i || animStep === -1;
                return React.createElement('div', {
                  key: 'term-' + i,
                  className: 'flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-all ' +
                    (isActive ? 'bg-gray-800 ring-1 ring-indigo-400' : 'hover:bg-gray-800') +
                    (isRevealed ? '' : ' opacity-20'),
                  onMouseEnter: function() { if (!animPlaying) setActiveTermIdx(i); },
                  onMouseLeave: function() { if (!animPlaying) setActiveTermIdx(-1); },
                },
                  React.createElement('div', {
                    className: 'w-3 h-3 rounded-sm flex-shrink-0',
                    style: { backgroundColor: group.color }
                  }),
                  React.createElement('span', { className: 'font-mono text-xs text-gray-300 w-16' }, term.label),
                  React.createElement('span', { className: 'font-mono text-xs text-gray-500' }, term.coeff.toFixed(4)),
                  isActive ? React.createElement('span', { className: 'text-xs text-indigo-400 ml-2' }, '←') : null
                );
              })
            ),

            // Commuting groups
            React.createElement('div', { className: 'text-xs text-gray-400 mb-2 mt-4' }, 'Commuting Groups (QWC)'),
            data.groups.map(function(group, gi) {
              return React.createElement('div', {
                key: 'group-' + gi,
                className: 'flex items-start gap-2 mb-2'
              },
                React.createElement('div', {
                  className: 'w-3 h-3 rounded-sm flex-shrink-0 mt-0.5',
                  style: { backgroundColor: group.color }
                }),
                React.createElement('div', null,
                  React.createElement('div', { className: 'text-xs text-gray-300 font-medium' },
                    group.label + ' (' + group.indices.length + ' terms)'
                  ),
                  React.createElement('div', { className: 'text-xs text-gray-500' }, group.desc)
                )
              );
            }),

            React.createElement('div', { className: 'bg-gray-800 rounded p-2 mt-3' },
              React.createElement('div', { className: 'text-xs text-gray-400' },
                'Total measurement circuits needed: ',
                React.createElement('span', { className: 'text-indigo-400 font-bold' }, data.groups.length),
                ' (vs. ', data.terms.length, ' without grouping)'
              )
            )
          )
        )
      )
    )
  );
}
