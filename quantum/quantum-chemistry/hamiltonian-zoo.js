var { useState: useStateHZ } = React;

var HAMILTONIANS = [
  {
    name: 'Hubbard',
    formula: 'H = -t ∑⟨i,j⟩ c†ᵢσcⱼσ + U ∑ᵢ nᵢ↑nᵢ↓',
    description: 'Models strongly correlated electrons on a lattice. Captures the competition between kinetic energy (hopping t) and on-site Coulomb repulsion U. Key to understanding high-Tc superconductivity.',
    latticeType: '2d-square',
    latticeRows: 3, latticeCols: 3,
    system: 'Cuprate superconductors, Mott insulators',
    qubits: 18, gateDepth: '~10⁴', platform: 'Ultracold atoms, Superconducting',
    params: { t: '1.0', U: '4.0' },
    color: '#818cf8',
  },
  {
    name: 'Heisenberg',
    formula: 'H = J ∑⟨i,j⟩ Sᵢ·Sⱼ = J ∑ (XᵢXⱼ + YᵢYⱼ + ZᵢZⱼ)',
    description: 'Describes interacting quantum spins on a lattice. The XXX model has equal couplings in all directions. Fundamental to quantum magnetism and spin liquids.',
    latticeType: '1d-chain',
    latticeRows: 1, latticeCols: 8,
    system: 'Magnetic insulators, spin chains',
    qubits: 8, gateDepth: '~10²', platform: 'Trapped ions, NV centers',
    params: { J: '1.0' },
    color: '#60a5fa',
  },
  {
    name: 'Transverse-Field Ising',
    formula: 'H = -J ∑⟨i,j⟩ ZᵢZⱼ - h ∑ᵢ Xᵢ',
    description: 'Simplest model exhibiting a quantum phase transition. At h/J ≈ 1, the system transitions between ferromagnetic (ordered) and paramagnetic (disordered) phases.',
    latticeType: '1d-chain',
    latticeRows: 1, latticeCols: 8,
    system: 'Quantum magnets, LiHoF₄',
    qubits: 8, gateDepth: '~10¹', platform: 'All platforms (benchmark model)',
    params: { J: '1.0', h: '1.0' },
    color: '#34d399',
  },
  {
    name: 't-J',
    formula: 'H = -t ∑⟨i,j⟩ P(c†ᵢσcⱼσ)P + J ∑⟨i,j⟩ (Sᵢ·Sⱼ - nᵢnⱼ/4)',
    description: 'Derived from the Hubbard model in the strong-coupling limit (U >> t). Prohibits double occupancy via projection P. Believed to describe the essential physics of doped cuprate superconductors.',
    latticeType: '2d-square',
    latticeRows: 3, latticeCols: 3,
    system: 'Doped Mott insulators, cuprates',
    qubits: 18, gateDepth: '~10⁴', platform: 'Superconducting qubits',
    params: { t: '1.0', 'J/t': '0.3' },
    color: '#f59e0b',
  },
  {
    name: 'Anderson Impurity',
    formula: 'H = ∑ₖ εₖc†ₖcₖ + εd d†d + U d†↑d↑d†↓d↓ + ∑ₖ V(c†ₖd + h.c.)',
    description: 'A single impurity site coupled to a bath of free electrons. Foundation of dynamical mean-field theory (DMFT). The Kondo effect emerges at low temperatures when the impurity spin is screened by conduction electrons.',
    latticeType: 'impurity',
    latticeRows: 1, latticeCols: 5,
    system: 'Kondo effect, quantum dots, DMFT',
    qubits: 12, gateDepth: '~10³', platform: 'Superconducting, Photonic',
    params: { U: '4.0', V: '0.5', εd: '-2.0' },
    color: '#ef4444',
  },
];

function HamiltonianZoo() {
  var [selectedHam, setSelectedHam] = useStateHZ(null);
  var [highlightedSite, setHighlightedSite] = useStateHZ(-1);

  var renderLattice = function(ham, w, h) {
    var sites = [];
    var bonds = [];
    var padX = 25, padY = 20;
    var availW = w - padX * 2;
    var availH = h - padY * 2;

    if (ham.latticeType === 'impurity') {
      // Central impurity + bath sites in arc
      var cx = w / 2, cy = h / 2;
      sites.push({ x: cx, y: cy, isImpurity: true, idx: 0 });
      var nBath = ham.latticeCols - 1;
      for (var b = 0; b < nBath; b++) {
        var angle = -Math.PI / 2 + (b / (nBath - 1)) * Math.PI;
        var bx = cx + 50 * Math.cos(angle);
        var by = cy + 40 * Math.sin(angle);
        sites.push({ x: bx, y: by, isImpurity: false, idx: b + 1 });
        bonds.push({ from: 0, to: b + 1 });
      }
    } else if (ham.latticeRows === 1) {
      // 1D chain
      var spacing = availW / (ham.latticeCols - 1);
      for (var c = 0; c < ham.latticeCols; c++) {
        sites.push({ x: padX + c * spacing, y: h / 2, idx: c });
        if (c > 0) bonds.push({ from: c - 1, to: c });
      }
    } else {
      // 2D square
      var sx = availW / (ham.latticeCols - 1);
      var sy = availH / (ham.latticeRows - 1);
      for (var r = 0; r < ham.latticeRows; r++) {
        for (var c = 0; c < ham.latticeCols; c++) {
          var idx = r * ham.latticeCols + c;
          sites.push({ x: padX + c * sx, y: padY + r * sy, idx: idx });
          if (c > 0) bonds.push({ from: idx - 1, to: idx });
          if (r > 0) bonds.push({ from: idx - ham.latticeCols, to: idx });
        }
      }
    }

    var isNeighbor = function(siteIdx) {
      if (highlightedSite < 0) return false;
      return bonds.some(function(b) {
        return (b.from === highlightedSite && b.to === siteIdx) ||
               (b.to === highlightedSite && b.from === siteIdx);
      });
    };

    return React.createElement('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h },
      // Bonds
      bonds.map(function(b, i) {
        var s1 = sites[b.from], s2 = sites[b.to];
        var isHL = highlightedSite === b.from || highlightedSite === b.to;
        return React.createElement('line', {
          key: 'bond-' + i,
          x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y,
          stroke: isHL ? ham.color : '#4b5563',
          strokeWidth: isHL ? 2.5 : 1.5
        });
      }),
      // Sites
      sites.map(function(s) {
        var isHL = highlightedSite === s.idx;
        var isNB = isNeighbor(s.idx);
        return React.createElement('circle', {
          key: 'site-' + s.idx,
          cx: s.x, cy: s.y,
          r: s.isImpurity ? 10 : 7,
          fill: isHL ? ham.color : (isNB ? ham.color + '88' : '#374151'),
          stroke: isHL || isNB ? ham.color : '#6b7280',
          strokeWidth: isHL ? 2.5 : 1.5,
          style: { cursor: 'pointer' },
          onMouseEnter: function() { setHighlightedSite(s.idx); },
          onMouseLeave: function() { setHighlightedSite(-1); }
        });
      })
    );
  };

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Condensed Matter Hamiltonian Zoo'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Famous condensed matter Hamiltonians that quantum computers aim to simulate. Each models different physical phenomena. ',
        'Click a lattice site to highlight the Hamiltonian terms involving it and its neighbors.'
      ),

      React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
        HAMILTONIANS.map(function(ham) {
          var isExpanded = selectedHam === ham.name;
          return React.createElement('div', {
            key: ham.name,
            className: 'bg-gray-900 rounded-lg p-4 cursor-pointer transition-all ' +
              (isExpanded ? 'ring-2' : 'hover:ring-1') + ' ring-opacity-50',
            style: { borderColor: ham.color, '--tw-ring-color': ham.color },
            onClick: function() { setSelectedHam(isExpanded ? null : ham.name); setHighlightedSite(-1); }
          },
            // Header
            React.createElement('div', { className: 'flex items-center gap-2 mb-2' },
              React.createElement('div', { className: 'w-3 h-3 rounded-full', style: { backgroundColor: ham.color } }),
              React.createElement('h3', { className: 'text-lg font-bold text-white' }, ham.name)
            ),

            // Formula
            React.createElement('div', { className: 'font-mono text-xs text-gray-300 bg-gray-800 rounded p-2 mb-3 overflow-x-auto' }, ham.formula),

            // Lattice diagram
            React.createElement('div', { className: 'mb-3' },
              renderLattice(ham, 180, ham.latticeRows > 1 ? 100 : 60)
            ),

            // Description
            React.createElement('p', { className: 'text-xs text-gray-400 mb-3' }, ham.description),

            // Expanded info
            isExpanded ? React.createElement('div', { className: 'border-t border-gray-700 pt-3 mt-2 space-y-2' },
              React.createElement('div', { className: 'text-xs' },
                React.createElement('span', { className: 'text-gray-500' }, 'Physical system: '),
                React.createElement('span', { className: 'text-gray-300' }, ham.system)
              ),
              React.createElement('div', { className: 'text-xs' },
                React.createElement('span', { className: 'text-gray-500' }, 'Quantum resources: '),
                React.createElement('span', { className: 'text-gray-300' }, ham.qubits + ' qubits, depth ' + ham.gateDepth)
              ),
              React.createElement('div', { className: 'text-xs' },
                React.createElement('span', { className: 'text-gray-500' }, 'Platform: '),
                React.createElement('span', { className: 'text-gray-300' }, ham.platform)
              ),
              React.createElement('div', { className: 'text-xs' },
                React.createElement('span', { className: 'text-gray-500' }, 'Parameters: '),
                React.createElement('span', { className: 'font-mono text-gray-300' },
                  Object.keys(ham.params).map(function(k) { return k + '=' + ham.params[k]; }).join(', ')
                )
              )
            ) : null,

            // Quick stats footer
            React.createElement('div', { className: 'flex gap-3 text-xs text-gray-500 mt-2' },
              React.createElement('span', null, ham.qubits + 'q'),
              React.createElement('span', null, ham.gateDepth + ' depth'),
              !isExpanded ? React.createElement('span', { className: 'text-indigo-400' }, 'Click for details') : null
            )
          );
        })
      )
    )
  );
}
