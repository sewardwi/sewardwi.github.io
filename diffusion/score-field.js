var { useState: useStateSF, useEffect: useEffectSF, useRef: useRefSF, useCallback: useCallbackSF } = React;

// Mixture of Gaussians as target distribution
var MODES = [
  { mx: 0.3, my: 0.3, sx: 0.06, sy: 0.06, w: 0.35 },
  { mx: 0.7, my: 0.35, sx: 0.07, sy: 0.05, w: 0.35 },
  { mx: 0.5, my: 0.72, sx: 0.08, sy: 0.06, w: 0.30 },
];

// Compute log density of mixture of Gaussians
function logDensity(x, y) {
  var total = 0;
  MODES.forEach(function(m) {
    var dx = (x - m.mx) / m.sx;
    var dy = (y - m.my) / m.sy;
    total += m.w * Math.exp(-0.5 * (dx * dx + dy * dy));
  });
  return Math.log(total + 1e-10);
}

// Score function: gradient of log density (numerically)
function scoreAt(x, y) {
  var eps = 0.002;
  var dldx = (logDensity(x + eps, y) - logDensity(x - eps, y)) / (2 * eps);
  var dldy = (logDensity(x, y + eps) - logDensity(x, y - eps)) / (2 * eps);
  return { dx: dldx, dy: dldy };
}

// Density (unnormalized) for background heatmap
function density(x, y) {
  var total = 0;
  MODES.forEach(function(m) {
    var dx = (x - m.mx) / m.sx;
    var dy = (y - m.my) / m.sy;
    total += m.w * Math.exp(-0.5 * (dx * dx + dy * dy));
  });
  return total;
}

function gaussRandSF() {
  var u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

var GRID_RES = 18; // vector field grid resolution
var N_PARTICLES = 60;
var TOTAL_DENOISE_STEPS = 80;

function ScoreField() {
  var [showVectors, setShowVectors] = useStateSF(true);
  var [showDensity, setShowDensity] = useStateSF(true);
  var [showParticles, setShowParticles] = useStateSF(true);
  var [animStep, setAnimStep] = useStateSF(0);
  var [playing, setPlaying] = useStateSF(false);
  var [stepSize, setStepSize] = useStateSF(0.003);
  var timerRef = useRefSF(null);
  var particlesRef = useRefSF(null);

  // Initialize particles from noise
  var initParticles = useCallbackSF(function() {
    var particles = [];
    for (var i = 0; i < N_PARTICLES; i++) {
      particles.push({
        x: 0.1 + Math.random() * 0.8,
        y: 0.1 + Math.random() * 0.8,
        trail: []
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffectSF(function() { initParticles(); }, [initParticles]);

  var reset = useCallbackSF(function() {
    setPlaying(false);
    setAnimStep(0);
    initParticles();
  }, [initParticles]);

  useEffectSF(function() {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(function() {
      setAnimStep(function(s) {
        if (s >= TOTAL_DENOISE_STEPS) { setPlaying(false); return s; }

        // Move particles along score field (Langevin dynamics)
        if (particlesRef.current) {
          particlesRef.current = particlesRef.current.map(function(p) {
            var score = scoreAt(p.x, p.y);
            var noiseScale = Math.max(0.001, 0.01 * (1 - s / TOTAL_DENOISE_STEPS));
            var newX = p.x + stepSize * score.dx + noiseScale * gaussRandSF();
            var newY = p.y + stepSize * score.dy + noiseScale * gaussRandSF();
            // Clamp
            newX = Math.max(0.02, Math.min(0.98, newX));
            newY = Math.max(0.02, Math.min(0.98, newY));
            var trail = p.trail.concat([{ x: p.x, y: p.y }]);
            if (trail.length > 20) trail = trail.slice(trail.length - 20);
            return { x: newX, y: newY, trail: trail };
          });
        }

        return s + 1;
      });
    }, 50);
    return function() { clearInterval(timerRef.current); };
  }, [playing, stepSize]);

  var W = 500, H = 500;
  var pad = 20;

  var toX = function(v) { return pad + v * (W - 2 * pad); };
  var toY = function(v) { return pad + v * (H - 2 * pad); };

  // Pre-compute density heatmap
  var heatmapCells = [];
  if (showDensity) {
    var heatRes = 30;
    var cellW = (W - 2 * pad) / heatRes;
    var cellH = (H - 2 * pad) / heatRes;
    var maxD = 0;
    var densities = [];
    for (var r = 0; r < heatRes; r++) {
      var row = [];
      for (var c = 0; c < heatRes; c++) {
        var fx = (c + 0.5) / heatRes;
        var fy = (r + 0.5) / heatRes;
        var d = density(fx, fy);
        maxD = Math.max(maxD, d);
        row.push(d);
      }
      densities.push(row);
    }
    for (var r = 0; r < heatRes; r++) {
      for (var c = 0; c < heatRes; c++) {
        var norm = densities[r][c] / maxD;
        var blue = Math.round(40 + 160 * norm);
        var green = Math.round(20 + 60 * norm);
        heatmapCells.push(React.createElement('rect', {
          key: 'h-' + r + '-' + c,
          x: pad + c * cellW, y: pad + r * cellH,
          width: cellW + 0.5, height: cellH + 0.5,
          fill: 'rgb(' + Math.round(10 + 20 * norm) + ',' + green + ',' + blue + ')',
          opacity: 0.7
        }));
      }
    }
  }

  // Vector field arrows
  var vectors = [];
  if (showVectors) {
    var arrowScale = 0.8;
    for (var r = 0; r <= GRID_RES; r++) {
      for (var c = 0; c <= GRID_RES; c++) {
        var fx = (c + 0.5) / (GRID_RES + 1);
        var fy = (r + 0.5) / (GRID_RES + 1);
        var s = scoreAt(fx, fy);
        var mag = Math.sqrt(s.dx * s.dx + s.dy * s.dy);
        var maxMag = 15;
        var clampedMag = Math.min(mag, maxMag);
        var arrowLen = (clampedMag / maxMag) * 12 * arrowScale;

        if (arrowLen < 0.5) continue;

        var nx = s.dx / (mag + 0.001);
        var ny = s.dy / (mag + 0.001);
        var x1 = toX(fx);
        var y1 = toY(fy);
        var x2 = x1 + nx * arrowLen;
        var y2 = y1 + ny * arrowLen;

        var intensity = Math.min(clampedMag / maxMag, 1);
        var aR = Math.round(80 + 175 * intensity);
        var aG = Math.round(80 + 100 * (1 - intensity));
        var aB = Math.round(120);

        vectors.push(React.createElement('line', {
          key: 'v-' + r + '-' + c,
          x1: x1, y1: y1, x2: x2, y2: y2,
          stroke: 'rgb(' + aR + ',' + aG + ',' + aB + ')',
          strokeWidth: 1.2,
          markerEnd: 'url(#scoreArrow)',
          opacity: 0.7
        }));
      }
    }
  }

  // Particles + trails
  var particleElements = [];
  if (showParticles && particlesRef.current) {
    particlesRef.current.forEach(function(p, i) {
      // Trail
      if (p.trail.length > 1) {
        var pathD = p.trail.map(function(pt, j) {
          return (j === 0 ? 'M' : 'L') + toX(pt.x).toFixed(1) + ',' + toY(pt.y).toFixed(1);
        }).join(' ') + ' L' + toX(p.x).toFixed(1) + ',' + toY(p.y).toFixed(1);
        particleElements.push(React.createElement('path', {
          key: 'trail-' + i,
          d: pathD, fill: 'none',
          stroke: '#fbbf24', strokeWidth: 1, opacity: 0.3
        }));
      }
      // Particle
      particleElements.push(React.createElement('circle', {
        key: 'part-' + i,
        cx: toX(p.x), cy: toY(p.y), r: 3.5,
        fill: '#fbbf24', opacity: 0.9
      }));
    });
  }

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Score Function & Langevin Dynamics'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'The ',
        React.createElement('strong', null, 'score function'),
        ' s(x) = ∇ₓ log p(x) points toward higher-density regions of the data distribution. ',
        'By following the score with added noise (',
        React.createElement('strong', null, 'Langevin dynamics'),
        '), random particles converge to the data distribution — this is the core idea behind score-based diffusion models.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('button', {
          onClick: function() { if (!playing && animStep >= TOTAL_DENOISE_STEPS) reset(); setPlaying(!playing); },
          className: 'px-4 py-2 rounded text-sm font-medium ' + (playing ? 'bg-yellow-600 text-white' : 'bg-indigo-600 text-white')
        }, playing ? 'Pause' : 'Play'),
        React.createElement('button', { onClick: reset, className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium' }, 'Reset'),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Step size:',
          React.createElement('select', {
            value: stepSize,
            onChange: function(e) { setStepSize(Number(e.target.value)); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 0.001 }, 'Small (0.001)'),
            React.createElement('option', { value: 0.003 }, 'Medium (0.003)'),
            React.createElement('option', { value: 0.008 }, 'Large (0.008)')
          )
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showVectors, onChange: function() { setShowVectors(!showVectors); } }),
          'Score vectors'
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showDensity, onChange: function() { setShowDensity(!showDensity); } }),
          'Density'
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showParticles, onChange: function() { setShowParticles(!showParticles); } }),
          'Particles'
        )
      ),

      React.createElement('div', { className: 'flex flex-col md:flex-row gap-4' },
        // Main viz
        React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4' },
          React.createElement('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, className: 'w-full max-w-[500px]' },
            React.createElement('defs', null,
              React.createElement('marker', { id: 'scoreArrow', markerWidth: '4', markerHeight: '4', refX: '4', refY: '2', orient: 'auto' },
                React.createElement('polygon', { points: '0,0 4,2 0,4', fill: '#94a3b8' })
              )
            ),
            React.createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0f172a', rx: 8 }),

            // Density heatmap
            heatmapCells,

            // Vector field
            vectors,

            // Mode centers (target distribution peaks)
            MODES.map(function(m, i) {
              return React.createElement('circle', {
                key: 'mode-' + i,
                cx: toX(m.mx), cy: toY(m.my), r: 5,
                fill: 'none', stroke: '#22c55e', strokeWidth: 1.5, strokeDasharray: '3,2'
              });
            }),

            // Particles
            particleElements,

            // Labels
            React.createElement('text', { x: W / 2, y: 14, fill: '#94a3b8', fontSize: '11', textAnchor: 'middle' },
              'Step ' + animStep + ' / ' + TOTAL_DENOISE_STEPS
            )
          )
        ),

        // Info sidebar
        React.createElement('div', { className: 'w-full md:w-52 space-y-3' },
          React.createElement('div', { className: 'bg-gray-800 rounded p-3 text-xs text-gray-300' },
            React.createElement('div', { className: 'text-gray-400 font-medium mb-2' }, 'How It Works'),
            React.createElement('div', { className: 'space-y-2' },
              React.createElement('div', null,
                React.createElement('span', { className: 'text-indigo-400 font-bold' }, '1. '),
                'Target: mixture of 3 Gaussians (green circles)'
              ),
              React.createElement('div', null,
                React.createElement('span', { className: 'text-indigo-400 font-bold' }, '2. '),
                'Arrows show ∇log p(x) — the score function pointing toward high-density regions'
              ),
              React.createElement('div', null,
                React.createElement('span', { className: 'text-indigo-400 font-bold' }, '3. '),
                'Yellow particles start randomly and follow the score field'
              ),
              React.createElement('div', null,
                React.createElement('span', { className: 'text-indigo-400 font-bold' }, '4. '),
                'With noise, they sample from p(x) via Langevin dynamics'
              )
            )
          ),
          React.createElement('div', { className: 'bg-gray-800 rounded p-3 text-xs text-gray-300' },
            React.createElement('div', { className: 'text-gray-400 font-medium mb-1' }, 'Langevin Update'),
            React.createElement('div', { className: 'font-mono text-[10px]' },
              'xₜ₊₁ = xₜ + ε∇log p(xₜ) + √(2ε) z',
              React.createElement('div', { className: 'text-gray-500 mt-1' }, 'where z ~ N(0, I)')
            )
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-3 text-xs' },
            React.createElement('div', { className: 'text-gray-500 font-medium mb-1' }, 'Convergence'),
            React.createElement('div', { className: 'font-mono text-gray-700' },
              animStep === 0 ? 'Not started' :
              animStep < 20 ? 'Particles moving toward modes...' :
              animStep < 50 ? 'Clustering around high-density regions' :
              'Approximately sampling from p(x)'
            )
          )
        )
      )
    )
  );
}
