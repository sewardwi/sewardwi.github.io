var { useState: useStateHM } = React;

var MOLECULES = {
  H2: {
    label: 'H₂',
    atoms: [
      { symbol: 'H', x: 80, y: 80 },
      { symbol: 'H', x: 140, y: 80 },
    ],
    bond: { x1: 95, y1: 80, x2: 125, y2: 80 },
    orbitals: [
      { label: 'σ₁s', energy: -0.58, occupied: true, electrons: 2, activeDefault: true },
      { label: 'σ*₁s', energy: 0.67, occupied: false, electrons: 0, activeDefault: true },
    ],
    qubits: 2,
    pauliTerms: { jw: 5, bk: 5 },
    jwTerms: [
      { pauli: 'I⊗I', coeff: -0.8126, qubits: [] },
      { pauli: 'Z⊗I', coeff: 0.1713, qubits: [0] },
      { pauli: 'I⊗Z', coeff: 0.1713, qubits: [1] },
      { pauli: 'Z⊗Z', coeff: 0.1686, qubits: [0, 1] },
      { pauli: 'X⊗X', coeff: 0.0454, qubits: [0, 1] },
    ],
    bkTerms: [
      { pauli: 'I⊗I', coeff: -0.8126, qubits: [] },
      { pauli: 'Z⊗I', coeff: 0.1713, qubits: [0] },
      { pauli: 'Z⊗Z', coeff: 0.1713, qubits: [0, 1] },
      { pauli: 'I⊗Z', coeff: 0.1686, qubits: [1] },
      { pauli: 'X⊗X', coeff: 0.0454, qubits: [0, 1] },
    ],
  },
  LiH: {
    label: 'LiH',
    atoms: [
      { symbol: 'Li', x: 70, y: 80 },
      { symbol: 'H', x: 150, y: 80 },
    ],
    bond: { x1: 90, y1: 80, x2: 140, y2: 80 },
    orbitals: [
      { label: '1σ', energy: -2.45, occupied: true, electrons: 2, activeDefault: false },
      { label: '2σ', energy: -0.30, occupied: true, electrons: 2, activeDefault: true },
      { label: '3σ', energy: 0.08, occupied: false, electrons: 0, activeDefault: true },
      { label: '1π', energy: 0.16, occupied: false, electrons: 0, activeDefault: true },
    ],
    qubits: 4,
    pauliTerms: { jw: 164, bk: 164 },
    jwTerms: [
      { pauli: 'I⊗I⊗I⊗I', coeff: -7.498, qubits: [] },
      { pauli: 'Z⊗I⊗I⊗I', coeff: 0.182, qubits: [0] },
      { pauli: 'I⊗Z⊗I⊗I', coeff: 0.182, qubits: [1] },
      { pauli: 'Z⊗Z⊗I⊗I', coeff: 0.121, qubits: [0, 1] },
      { pauli: 'I⊗I⊗Z⊗Z', coeff: 0.174, qubits: [2, 3] },
      { pauli: 'X⊗I⊗X⊗I', coeff: 0.045, qubits: [0, 2] },
      { pauli: 'Y⊗I⊗Y⊗I', coeff: 0.045, qubits: [0, 2] },
      { pauli: 'Z⊗I⊗Z⊗I', coeff: 0.035, qubits: [0, 2] },
      { pauli: '...', coeff: null, qubits: [] },
    ],
    bkTerms: [
      { pauli: 'I⊗I⊗I⊗I', coeff: -7.498, qubits: [] },
      { pauli: 'Z⊗I⊗I⊗I', coeff: 0.182, qubits: [0] },
      { pauli: 'Z⊗Z⊗I⊗I', coeff: 0.182, qubits: [0, 1] },
      { pauli: 'I⊗Z⊗I⊗I', coeff: 0.121, qubits: [1] },
      { pauli: 'I⊗I⊗Z⊗Z', coeff: 0.174, qubits: [2, 3] },
      { pauli: 'X⊗Z⊗X⊗I', coeff: 0.045, qubits: [0, 1, 2] },
      { pauli: 'Y⊗Z⊗Y⊗I', coeff: 0.045, qubits: [0, 1, 2] },
      { pauli: 'Z⊗I⊗Z⊗Z', coeff: 0.035, qubits: [0, 2, 3] },
      { pauli: '...', coeff: null, qubits: [] },
    ],
  },
  BeH2: {
    label: 'BeH₂',
    atoms: [
      { symbol: 'H', x: 50, y: 80 },
      { symbol: 'Be', x: 110, y: 80 },
      { symbol: 'H', x: 170, y: 80 },
    ],
    bond: { x1: 65, y1: 80, x2: 155, y2: 80 },
    orbitals: [
      { label: '1σg', energy: -4.73, occupied: true, electrons: 2, activeDefault: false },
      { label: '2σg', energy: -0.69, occupied: true, electrons: 2, activeDefault: true },
      { label: '1σu', energy: -0.47, occupied: true, electrons: 2, activeDefault: true },
      { label: '3σg', energy: 0.15, occupied: false, electrons: 0, activeDefault: true },
      { label: '2σu', energy: 0.28, occupied: false, electrons: 0, activeDefault: true },
      { label: '1πu', energy: 0.55, occupied: false, electrons: 0, activeDefault: false },
    ],
    qubits: 6,
    pauliTerms: { jw: 666, bk: 666 },
    jwTerms: [
      { pauli: 'I⊗I⊗I⊗I⊗I⊗I', coeff: -15.53, qubits: [] },
      { pauli: 'Z⊗I⊗I⊗I⊗I⊗I', coeff: 0.245, qubits: [0] },
      { pauli: 'Z⊗Z⊗I⊗I⊗I⊗I', coeff: 0.131, qubits: [0, 1] },
      { pauli: 'X⊗Z⊗X⊗I⊗I⊗I', coeff: 0.048, qubits: [0, 1, 2] },
      { pauli: 'I⊗I⊗Z⊗Z⊗I⊗I', coeff: 0.098, qubits: [2, 3] },
      { pauli: '...', coeff: null, qubits: [] },
    ],
    bkTerms: [
      { pauli: 'I⊗I⊗I⊗I⊗I⊗I', coeff: -15.53, qubits: [] },
      { pauli: 'Z⊗I⊗I⊗I⊗I⊗I', coeff: 0.245, qubits: [0] },
      { pauli: 'I⊗Z⊗I⊗I⊗I⊗I', coeff: 0.131, qubits: [1] },
      { pauli: 'X⊗I⊗X⊗Z⊗I⊗I', coeff: 0.048, qubits: [0, 2, 3] },
      { pauli: 'I⊗I⊗Z⊗Z⊗I⊗I', coeff: 0.098, qubits: [2, 3] },
      { pauli: '...', coeff: null, qubits: [] },
    ],
  },
};

var COMPLEXITY_DATA = [
  { label: 'H₂', qubits: 2, terms: 5, key: 'H2' },
  { label: 'LiH', qubits: 4, terms: 164, key: 'LiH' },
  { label: 'BeH₂', qubits: 6, terms: 666, key: 'BeH2' },
];

function HamiltonianMapping() {
  var [selectedMol, setSelectedMol] = useStateHM('H2');
  var [hoveredTerm, setHoveredTerm] = useStateHM(-1);
  var [step, setStep] = useStateHM(3);
  var [mapping, setMapping] = useStateHM('jw');
  var [activeOrbitals, setActiveOrbitals] = useStateHM(null);

  var mol = MOLECULES[selectedMol];

  // Initialize active orbitals when molecule changes
  var orbActive = activeOrbitals || mol.orbitals.map(function(o) { return o.activeDefault; });
  var activeCount = orbActive.filter(function(a) { return a; }).length;

  var terms = mapping === 'jw' ? mol.jwTerms : mol.bkTerms;
  var totalTerms = mol.pauliTerms[mapping];

  var toggleOrbital = function(idx) {
    var newActive = orbActive.slice();
    newActive[idx] = !newActive[idx];
    setActiveOrbitals(newActive);
    setHoveredTerm(-1);
  };

  var handleMolChange = function(val) {
    setSelectedMol(val);
    setActiveOrbitals(null);
    setHoveredTerm(-1);
  };

  // Complexity bar chart
  var barW = 280, barH = 140;
  var barPad = { left: 50, right: 15, top: 15, bottom: 30 };
  var barPlotW = barW - barPad.left - barPad.right;
  var barPlotH = barH - barPad.top - barPad.bottom;
  var maxTerms = 700;

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Molecular Orbital → Qubit Mapping'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Electrons in molecular orbitals are mapped to qubits via Jordan-Wigner or Bravyi-Kitaev transformations. ',
        'Jordan-Wigner maps occupation directly but produces long Pauli strings. Bravyi-Kitaev uses a more complex encoding for shorter strings. ',
        'Click orbitals to select the active space — non-active orbitals are frozen, reducing qubit count.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Molecule:',
          React.createElement('select', {
            value: selectedMol,
            onChange: function(e) { handleMolChange(e.target.value); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 'H2' }, 'H₂ (2 qubits)'),
            React.createElement('option', { value: 'LiH' }, 'LiH (4 qubits)'),
            React.createElement('option', { value: 'BeH2' }, 'BeH₂ (6 qubits)')
          )
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Transform:',
          React.createElement('select', {
            value: mapping,
            onChange: function(e) { setMapping(e.target.value); setHoveredTerm(-1); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 'jw' }, 'Jordan-Wigner'),
            React.createElement('option', { value: 'bk' }, 'Bravyi-Kitaev')
          )
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Reveal:',
          React.createElement('select', {
            value: step,
            onChange: function(e) { setStep(Number(e.target.value)); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 0 }, 'Molecule only'),
            React.createElement('option', { value: 1 }, '+ Orbitals'),
            React.createElement('option', { value: 2 }, '+ Qubits'),
            React.createElement('option', { value: 3 }, 'Full mapping')
          )
        )
      ),

      // Three-column layout
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },

          // LEFT: Molecule + MO diagram
          React.createElement('div', null,
            React.createElement('h3', { className: 'text-sm text-gray-400 mb-2 text-center' }, 'Molecule'),
            React.createElement('svg', { width: 220, height: 160, viewBox: '0 0 220 160', className: 'w-full' },
              mol.atoms.map(function(atom, i) {
                return React.createElement('g', { key: 'atom-' + i },
                  React.createElement('circle', { cx: atom.x, cy: atom.y, r: atom.symbol === 'H' ? 18 : 24, fill: '#374151', stroke: '#818cf8', strokeWidth: 2 }),
                  React.createElement('text', { x: atom.x, y: atom.y + 5, fill: '#e5e7eb', fontSize: '14', fontWeight: 'bold', textAnchor: 'middle' }, atom.symbol)
                );
              }),
              React.createElement('line', { x1: mol.bond.x1, y1: mol.bond.y1, x2: mol.bond.x2, y2: mol.bond.y2, stroke: '#6b7280', strokeWidth: 3 }),
              React.createElement('text', { x: 110, y: 140, fill: '#d1d5db', fontSize: '16', fontWeight: 'bold', textAnchor: 'middle' }, mol.label)
            ),

            // MO energy levels with active space selection
            step >= 1 ? React.createElement('div', null,
              React.createElement('h4', { className: 'text-xs text-gray-500 mb-1 text-center' }, 'Molecular Orbitals (click to toggle active space)'),
              React.createElement('svg', { width: 220, height: 30 + mol.orbitals.length * 30, viewBox: '0 0 220 ' + (30 + mol.orbitals.length * 30), className: 'w-full' },
                React.createElement('line', { x1: 30, y1: 10, x2: 30, y2: 10 + mol.orbitals.length * 30, stroke: '#4b5563', strokeWidth: 1 }),
                React.createElement('text', { x: 12, y: 20, fill: '#6b7280', fontSize: '8', textAnchor: 'middle' }, 'E'),

                mol.orbitals.map(function(orb, i) {
                  var y = 15 + i * 30;
                  var isActive = orbActive[i];
                  return React.createElement('g', { key: 'orb-' + i, onClick: function() { toggleOrbital(i); }, style: { cursor: 'pointer' } },
                    // Active space background highlight
                    isActive ? React.createElement('rect', {
                      x: 45, y: y - 12, width: 100, height: 24, rx: 4,
                      fill: '#818cf8', opacity: 0.1
                    }) : null,
                    // Orbital line
                    React.createElement('line', {
                      x1: 50, y1: y, x2: 130, y2: y,
                      stroke: isActive ? (orb.occupied ? '#818cf8' : '#6366f1') : '#374151',
                      strokeWidth: 2,
                      strokeDasharray: isActive ? undefined : '4,3'
                    }),
                    // Label
                    React.createElement('text', { x: 145, y: y + 4, fill: isActive ? '#d1d5db' : '#4b5563', fontSize: '11' }, orb.label),
                    // Frozen label
                    !isActive ? React.createElement('text', { x: 190, y: y + 4, fill: '#6b7280', fontSize: '8' }, 'frozen') : null,
                    // Electron arrows
                    orb.electrons >= 1 ? React.createElement('text', {
                      x: 75, y: y - 3, fill: isActive ? '#fbbf24' : '#4b5563', fontSize: '14', textAnchor: 'middle'
                    }, '↑') : null,
                    orb.electrons >= 2 ? React.createElement('text', {
                      x: 95, y: y - 3, fill: isActive ? '#fbbf24' : '#4b5563', fontSize: '14', textAnchor: 'middle'
                    }, '↓') : null
                  );
                })
              ),
              React.createElement('div', { className: 'text-xs text-center mt-1' },
                React.createElement('span', { className: 'text-indigo-400' }, 'Active: ' + activeCount + ' orbitals → ' + activeCount + ' qubits'),
                activeCount < mol.qubits ? React.createElement('span', { className: 'text-gray-500 ml-2' },
                  '(saved ' + (mol.qubits - activeCount) + ' qubits)'
                ) : null
              )
            ) : null
          ),

          // CENTER: Transform arrow
          React.createElement('div', { className: 'flex flex-col items-center justify-center' },
            step >= 2 ? React.createElement('div', { className: 'text-center' },
              React.createElement('div', { className: 'text-4xl text-gray-500 mb-2' }, '⟶'),
              React.createElement('div', { className: 'bg-gray-800 rounded p-3 text-xs font-mono text-gray-300 max-w-[180px]' },
                React.createElement('div', { className: 'text-indigo-400 font-bold mb-1' },
                  mapping === 'jw' ? 'Jordan-Wigner' : 'Bravyi-Kitaev'
                ),
                mapping === 'jw' ? React.createElement('div', null,
                  React.createElement('div', null, 'a†ᵢ → (∏ Zⱼ) σ⁺ᵢ'),
                  React.createElement('div', { className: 'mt-1 text-gray-500' }, 'aᵢ → (∏ Zⱼ) σ⁻ᵢ'),
                  React.createElement('div', { className: 'mt-2 text-gray-500 text-[10px]' }, 'Direct mapping: qubit i = orbital i occupation. Long Z-strings for non-local operators.')
                ) : React.createElement('div', null,
                  React.createElement('div', null, 'a†ᵢ → Uᵢ σ⁺ᵢ Pᵢ'),
                  React.createElement('div', { className: 'mt-1 text-gray-500' }, 'aᵢ → Uᵢ σ⁻ᵢ Pᵢ'),
                  React.createElement('div', { className: 'mt-2 text-gray-500 text-[10px]' }, 'Binary tree encoding: shorter Pauli strings (O(log n) vs O(n)), but more complex qubit-orbital relationship.')
                )
              )
            ) : React.createElement('div', { className: 'text-gray-600 text-sm' }, 'Increase reveal →')
          ),

          // RIGHT: Qubit register + Pauli terms
          step >= 2 ? React.createElement('div', null,
            React.createElement('h3', { className: 'text-sm text-gray-400 mb-2 text-center' }, 'Qubit Register (' + mapping.toUpperCase() + ')'),
            React.createElement('svg', { width: 220, height: 20 + mol.qubits * 28, viewBox: '0 0 220 ' + (20 + mol.qubits * 28), className: 'w-full' },
              Array.from({ length: mol.qubits }).map(function(_, i) {
                var y = 15 + i * 28;
                var isHighlighted = hoveredTerm >= 0 && terms[hoveredTerm] && terms[hoveredTerm].qubits.indexOf(i) >= 0;
                var isFrozen = !orbActive[i];
                return React.createElement('g', { key: 'q-' + i },
                  React.createElement('text', {
                    x: 10, y: y + 4,
                    fill: isFrozen ? '#374151' : (isHighlighted ? '#818cf8' : '#9ca3af'),
                    fontSize: '11', fontWeight: isHighlighted ? 'bold' : 'normal'
                  }, 'q' + i),
                  React.createElement('line', {
                    x1: 30, y1: y, x2: 200, y2: y,
                    stroke: isFrozen ? '#1f2937' : (isHighlighted ? '#818cf8' : '#4b5563'),
                    strokeWidth: isHighlighted ? 2.5 : 1,
                    strokeDasharray: isFrozen ? '3,3' : undefined
                  }),
                  React.createElement('circle', { cx: 30, cy: y, r: 3, fill: isFrozen ? '#1f2937' : (isHighlighted ? '#818cf8' : '#6b7280') })
                );
              })
            ),

            step >= 3 ? React.createElement('div', null,
              React.createElement('h4', { className: 'text-xs text-gray-500 mb-1 mt-2' },
                'Hamiltonian (' + totalTerms + ' Pauli terms, ' + mapping.toUpperCase() + ')'
              ),
              React.createElement('div', { className: 'space-y-1 max-h-[160px] overflow-y-auto' },
                terms.map(function(term, i) {
                  if (term.pauli === '...') {
                    return React.createElement('div', { key: 'ellipsis', className: 'text-gray-500 text-xs font-mono px-2' },
                      '... (' + (totalTerms - terms.length + 1) + ' more terms)'
                    );
                  }
                  return React.createElement('div', {
                    key: 'term-' + i,
                    className: 'text-xs font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ' +
                      (hoveredTerm === i ? 'bg-indigo-900/50 text-indigo-300' : 'text-gray-400 hover:bg-gray-800'),
                    onMouseEnter: function() { setHoveredTerm(i); },
                    onMouseLeave: function() { setHoveredTerm(-1); },
                  },
                    React.createElement('span', { className: 'text-gray-500' }, term.coeff.toFixed(3) + ' '),
                    term.pauli
                  );
                })
              )
            ) : null
          ) : React.createElement('div', { className: 'flex items-center justify-center text-gray-600 text-sm' }, 'Increase reveal to see qubits')
        )
      ),

      // Mapping comparison info
      React.createElement('div', { className: 'grid grid-cols-2 gap-3 text-sm mb-4' },
        React.createElement('div', { className: 'bg-gray-100 rounded p-2 ' + (mapping === 'jw' ? 'ring-2 ring-indigo-400' : '') },
          React.createElement('div', { className: 'text-gray-500 text-xs font-bold' }, 'Jordan-Wigner'),
          React.createElement('div', { className: 'text-xs text-gray-600 mt-1' }, 'Pauli weight: O(n)'),
          React.createElement('div', { className: 'text-xs text-gray-600' }, 'Simple: qubit i = orbital i')
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2 ' + (mapping === 'bk' ? 'ring-2 ring-indigo-400' : '') },
          React.createElement('div', { className: 'text-gray-500 text-xs font-bold' }, 'Bravyi-Kitaev'),
          React.createElement('div', { className: 'text-xs text-gray-600 mt-1' }, 'Pauli weight: O(log n)'),
          React.createElement('div', { className: 'text-xs text-gray-600' }, 'Complex: binary tree encoding')
        )
      ),

      // Complexity bar chart
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4' },
        React.createElement('h3', { className: 'text-sm text-gray-400 mb-2' }, 'Scaling: Pauli Terms vs Molecule Size'),
        React.createElement('svg', { width: barW, height: barH, viewBox: '0 0 ' + barW + ' ' + barH, className: 'w-full max-w-[280px]' },
          React.createElement('rect', { x: barPad.left, y: barPad.top, width: barPlotW, height: barPlotH, fill: '#111827', rx: 4 }),

          COMPLEXITY_DATA.map(function(d, i) {
            var barWidth = (barPlotW / COMPLEXITY_DATA.length) * 0.6;
            var gap = (barPlotW / COMPLEXITY_DATA.length);
            var x = barPad.left + gap * i + (gap - barWidth) / 2;
            var barHeight = (d.terms / maxTerms) * barPlotH;
            var y = barPad.top + barPlotH - barHeight;
            var isSelected = d.key === selectedMol;
            return React.createElement('g', { key: d.key },
              React.createElement('rect', {
                x: x, y: y, width: barWidth, height: barHeight,
                fill: isSelected ? '#818cf8' : '#4b5563', rx: 3
              }),
              React.createElement('text', {
                x: x + barWidth / 2, y: y - 5,
                fill: isSelected ? '#818cf8' : '#9ca3af', fontSize: '10', textAnchor: 'middle', fontWeight: 'bold'
              }, d.terms),
              React.createElement('text', {
                x: x + barWidth / 2, y: barPad.top + barPlotH + 14,
                fill: '#d1d5db', fontSize: '10', textAnchor: 'middle'
              }, d.label),
              React.createElement('text', {
                x: x + barWidth / 2, y: barPad.top + barPlotH + 26,
                fill: '#6b7280', fontSize: '9', textAnchor: 'middle'
              }, d.qubits + 'q')
            );
          })
        )
      )
    )
  );
}
