var { useState, useEffect, useRef, useCallback } = React;

// Generate a target distribution: a spiral of points
function generateSpiral(nPoints) {
  var points = [];
  for (var i = 0; i < nPoints; i++) {
    var t = (i / nPoints) * 4 * Math.PI;
    var r = 0.05 + (i / nPoints) * 0.38;
    var x = 0.5 + r * Math.cos(t);
    var y = 0.5 + r * Math.sin(t);
    points.push({ x: x, y: y });
  }
  return points;
}

// Generate a smiley face distribution
function generateSmiley(nPoints) {
  var points = [];
  var perPart = Math.floor(nPoints / 4);

  // Face outline
  for (var i = 0; i < perPart; i++) {
    var angle = (i / perPart) * 2 * Math.PI;
    points.push({ x: 0.5 + 0.35 * Math.cos(angle), y: 0.5 + 0.35 * Math.sin(angle) });
  }
  // Left eye
  for (var i = 0; i < Math.floor(perPart / 2); i++) {
    var angle = (i / (perPart / 2)) * 2 * Math.PI;
    points.push({ x: 0.37 + 0.06 * Math.cos(angle), y: 0.38 + 0.06 * Math.sin(angle) });
  }
  // Right eye
  for (var i = 0; i < Math.floor(perPart / 2); i++) {
    var angle = (i / (perPart / 2)) * 2 * Math.PI;
    points.push({ x: 0.63 + 0.06 * Math.cos(angle), y: 0.38 + 0.06 * Math.sin(angle) });
  }
  // Smile (arc)
  for (var i = 0; i < perPart; i++) {
    var angle = (i / perPart) * Math.PI;
    points.push({ x: 0.5 + 0.2 * Math.cos(angle), y: 0.6 + 0.1 * Math.sin(angle) });
  }

  while (points.length < nPoints) {
    var angle = Math.random() * 2 * Math.PI;
    points.push({ x: 0.5 + 0.35 * Math.cos(angle), y: 0.5 + 0.35 * Math.sin(angle) });
  }
  return points.slice(0, nPoints);
}

// Box-Muller for Gaussian random
function gaussRandom() {
  var u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

var DISTRIBUTIONS = {
  spiral: { label: 'Spiral', gen: generateSpiral },
  smiley: { label: 'Smiley Face', gen: generateSmiley },
};

var N_POINTS = 300;
var TOTAL_STEPS = 50;

function ForwardReverse() {
  var [shape, setShape] = useState('spiral');
  var [step, setStep] = useState(0);
  var [direction, setDirection] = useState('forward');
  var [playing, setPlaying] = useState(false);
  var [speed, setSpeed] = useState(1);
  var timerRef = useRef(null);
  var cleanPointsRef = useRef(null);
  var noiseTableRef = useRef(null);

  // Generate clean data
  var initData = useCallback(function() {
    var pts = DISTRIBUTIONS[shape].gen(N_POINTS);
    cleanPointsRef.current = pts;

    // Pre-generate noise for each point at each step (deterministic playback)
    var table = [];
    for (var s = 0; s <= TOTAL_STEPS; s++) {
      var noises = [];
      for (var i = 0; i < N_POINTS; i++) {
        noises.push({ dx: gaussRandom(), dy: gaussRandom() });
      }
      table.push(noises);
    }
    noiseTableRef.current = table;
  }, [shape]);

  useEffect(function() {
    initData();
    setStep(0);
    setPlaying(false);
  }, [shape, initData]);

  // Initialize on mount
  useEffect(function() { initData(); }, [initData]);

  var reset = useCallback(function() {
    setPlaying(false);
    setStep(direction === 'forward' ? 0 : TOTAL_STEPS);
  }, [direction]);

  useEffect(function() {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    var interval = 80 / speed;
    timerRef.current = setInterval(function() {
      setStep(function(s) {
        if (direction === 'forward') {
          if (s >= TOTAL_STEPS) { setPlaying(false); return s; }
          return s + 1;
        } else {
          if (s <= 0) { setPlaying(false); return s; }
          return s - 1;
        }
      });
    }, interval);
    return function() { clearInterval(timerRef.current); };
  }, [playing, speed, direction]);

  // Compute noised points at current step using cumulative noise
  var currentPoints = [];
  if (cleanPointsRef.current && noiseTableRef.current) {
    var clean = cleanPointsRef.current;
    var t = step / TOTAL_STEPS; // 0 = clean, 1 = pure noise
    // Cosine noise schedule: alpha_bar goes from 1 to ~0
    var alphaBar = Math.cos(t * Math.PI / 2) * Math.cos(t * Math.PI / 2);
    var sqrtAlpha = Math.sqrt(alphaBar);
    var sqrtOneMinusAlpha = Math.sqrt(1 - alphaBar);

    for (var i = 0; i < N_POINTS; i++) {
      // Accumulate noise from pre-generated table
      var totalNx = 0, totalNy = 0;
      for (var s = 1; s <= step; s++) {
        totalNx += noiseTableRef.current[s][i].dx;
        totalNy += noiseTableRef.current[s][i].dy;
      }
      // Normalize accumulated noise
      var normFactor = step > 0 ? 1 / Math.sqrt(step) : 0;
      var nx = totalNx * normFactor;
      var ny = totalNy * normFactor;

      currentPoints.push({
        x: sqrtAlpha * clean[i].x + sqrtOneMinusAlpha * nx * 0.25,
        y: sqrtAlpha * clean[i].y + sqrtOneMinusAlpha * ny * 0.25,
      });
    }
  }

  // Canvas dimensions
  var W = 500, H = 500;
  var pad = 20;

  var toCanvasX = function(v) { return pad + v * (W - 2 * pad); };
  var toCanvasY = function(v) { return pad + v * (H - 2 * pad); };

  // Color based on noise level
  var t = step / TOTAL_STEPS;
  var r = Math.round(100 + 155 * t);
  var g = Math.round(100 + 155 * (1 - t));
  var b = Math.round(180);
  var pointColor = 'rgb(' + r + ',' + g + ',' + b + ')';

  // Signal-to-noise ratio for display
  var alphaBar = Math.cos(t * Math.PI / 2) * Math.cos(t * Math.PI / 2);
  var snr = alphaBar > 0.001 ? (10 * Math.log10(alphaBar / (1 - alphaBar + 0.001))).toFixed(1) : '-∞';

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Forward & Reverse Diffusion'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Diffusion models work by learning to reverse a gradual noising process. The ',
        React.createElement('strong', null, 'forward process'),
        ' adds Gaussian noise over many steps until the data becomes pure noise. The ',
        React.createElement('strong', null, 'reverse process'),
        ' (denoising) learns to undo each step, recovering structure from noise. ',
        'Watch a 2D point distribution get destroyed and then reconstructed.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('button', {
          onClick: function() {
            if (!playing) {
              if (direction === 'forward' && step >= TOTAL_STEPS) setStep(0);
              if (direction === 'reverse' && step <= 0) setStep(TOTAL_STEPS);
            }
            setPlaying(!playing);
          },
          className: 'px-4 py-2 rounded text-sm font-medium ' + (playing ? 'bg-yellow-600 text-white' : 'bg-indigo-600 text-white')
        }, playing ? 'Pause' : 'Play'),
        React.createElement('button', { onClick: reset, className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium' }, 'Reset'),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Direction:',
          React.createElement('select', {
            value: direction,
            onChange: function(e) {
              setDirection(e.target.value);
              setPlaying(false);
              setStep(e.target.value === 'forward' ? 0 : TOTAL_STEPS);
            },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 'forward' }, 'Forward (add noise)'),
            React.createElement('option', { value: 'reverse' }, 'Reverse (denoise)')
          )
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Shape:',
          React.createElement('select', {
            value: shape,
            onChange: function(e) { setShape(e.target.value); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            Object.keys(DISTRIBUTIONS).map(function(k) {
              return React.createElement('option', { key: k, value: k }, DISTRIBUTIONS[k].label);
            })
          )
        ),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Speed:',
          React.createElement('select', {
            value: speed,
            onChange: function(e) { setSpeed(Number(e.target.value)); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 0.5 }, '0.5×'),
            React.createElement('option', { value: 1 }, '1×'),
            React.createElement('option', { value: 2 }, '2×'),
            React.createElement('option', { value: 4 }, '4×')
          )
        )
      ),

      // Step slider
      React.createElement('div', { className: 'mb-4' },
        React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
          'Timestep: ' + step + ' / ' + TOTAL_STEPS
        ),
        React.createElement('input', {
          type: 'range', min: '0', max: TOTAL_STEPS, step: '1', value: step,
          onChange: function(e) { setStep(Number(e.target.value)); setPlaying(false); },
          className: 'w-full max-w-lg'
        })
      ),

      // Main visualization
      React.createElement('div', { className: 'flex flex-col md:flex-row gap-4' },

        // Point cloud
        React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4' },
          React.createElement('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, className: 'w-full max-w-[500px]' },
            React.createElement('rect', { x: 0, y: 0, width: W, height: H, fill: '#0f172a', rx: 8 }),

            // Grid lines
            [0.25, 0.5, 0.75].map(function(v) {
              return React.createElement('g', { key: 'grid-' + v },
                React.createElement('line', { x1: toCanvasX(v), y1: pad, x2: toCanvasX(v), y2: H - pad, stroke: '#1e293b', strokeWidth: 0.5 }),
                React.createElement('line', { x1: pad, y1: toCanvasY(v), x2: W - pad, y2: toCanvasY(v), stroke: '#1e293b', strokeWidth: 0.5 })
              );
            }),

            // Points
            currentPoints.map(function(pt, i) {
              var cx = toCanvasX(pt.x);
              var cy = toCanvasY(pt.y);
              // Clamp to visible area
              cx = Math.max(pad, Math.min(W - pad, cx));
              cy = Math.max(pad, Math.min(H - pad, cy));
              return React.createElement('circle', {
                key: 'pt-' + i,
                cx: cx, cy: cy, r: 2.5,
                fill: pointColor, opacity: 0.8
              });
            }),

            // Step label
            React.createElement('text', { x: W / 2, y: H - 5, fill: '#64748b', fontSize: '11', textAnchor: 'middle' },
              direction === 'forward' ? 'x₀ → xₜ (adding noise)' : 'xₜ → x₀ (denoising)'
            ),

            // Arrow showing direction
            React.createElement('text', {
              x: W / 2, y: 16, fill: '#94a3b8', fontSize: '12', fontWeight: 'bold', textAnchor: 'middle'
            }, 't = ' + step + (step === 0 ? ' (clean data)' : step === TOTAL_STEPS ? ' (pure noise)' : ''))
          )
        ),

        // Info sidebar
        React.createElement('div', { className: 'w-full md:w-48 space-y-3' },
          React.createElement('div', { className: 'bg-gray-100 rounded p-3 text-xs' },
            React.createElement('div', { className: 'text-gray-500 font-medium mb-1' }, 'Process'),
            React.createElement('div', { className: 'font-bold ' + (direction === 'forward' ? 'text-red-500' : 'text-green-500') },
              direction === 'forward' ? 'Forward (noising)' : 'Reverse (denoising)'
            )
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-3 text-xs' },
            React.createElement('div', { className: 'text-gray-500 font-medium mb-1' }, 'Signal Preserved (ᾱₜ)'),
            React.createElement('div', null,
              React.createElement('div', { className: 'bg-gray-200 rounded-full h-3 overflow-hidden' },
                React.createElement('div', {
                  className: 'h-full rounded-full transition-all',
                  style: { width: (alphaBar * 100) + '%', backgroundColor: pointColor }
                })
              ),
              React.createElement('div', { className: 'font-mono mt-1 text-gray-700' }, (alphaBar * 100).toFixed(1) + '%')
            )
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-3 text-xs' },
            React.createElement('div', { className: 'text-gray-500 font-medium mb-1' }, 'Noise Level (1 - ᾱₜ)'),
            React.createElement('div', { className: 'font-mono text-gray-700' }, ((1 - alphaBar) * 100).toFixed(1) + '%')
          ),
          React.createElement('div', { className: 'bg-gray-100 rounded p-3 text-xs' },
            React.createElement('div', { className: 'text-gray-500 font-medium mb-1' }, 'SNR'),
            React.createElement('div', { className: 'font-mono text-gray-700' }, snr + ' dB')
          ),
          React.createElement('div', { className: 'bg-gray-800 rounded p-3 text-xs text-gray-300' },
            React.createElement('div', { className: 'text-gray-400 font-medium mb-1' }, 'The Math'),
            React.createElement('div', { className: 'font-mono text-[10px] space-y-1' },
              React.createElement('div', null, 'q(xₜ|x₀) = N(√ᾱₜ x₀, (1-ᾱₜ)I)'),
              React.createElement('div', { className: 'text-gray-500 mt-1' }, 'Forward: gradually corrupt'),
              React.createElement('div', null, 'p_θ(xₜ₋₁|xₜ) = N(μ_θ, σₜ²I)'),
              React.createElement('div', { className: 'text-gray-500 mt-1' }, 'Reverse: neural net denoises')
            )
          )
        )
      )
    )
  );
}
