var { useState: useStateNS } = React;

// Noise schedule computations
function linearSchedule(T) {
  var betaStart = 0.0001, betaEnd = 0.02;
  var betas = [], alphas = [], alphaBars = [];
  var alphaBarProd = 1;
  for (var t = 0; t < T; t++) {
    var beta = betaStart + (betaEnd - betaStart) * (t / (T - 1));
    betas.push(beta);
    var alpha = 1 - beta;
    alphas.push(alpha);
    alphaBarProd *= alpha;
    alphaBars.push(alphaBarProd);
  }
  return { betas: betas, alphas: alphas, alphaBars: alphaBars };
}

function cosineSchedule(T) {
  var s = 0.008;
  var betas = [], alphas = [], alphaBars = [];
  for (var t = 0; t < T; t++) {
    var fT = Math.cos(((t / T) + s) / (1 + s) * Math.PI / 2);
    var fT1 = Math.cos((((t + 1) / T) + s) / (1 + s) * Math.PI / 2);
    var alphaBar = (fT * fT) / (Math.cos(s / (1 + s) * Math.PI / 2) * Math.cos(s / (1 + s) * Math.PI / 2));
    var alphaBarNext = (fT1 * fT1) / (Math.cos(s / (1 + s) * Math.PI / 2) * Math.cos(s / (1 + s) * Math.PI / 2));
    var beta = Math.min(1 - alphaBarNext / alphaBar, 0.999);
    betas.push(beta);
    alphas.push(1 - beta);
    alphaBars.push(Math.max(alphaBar, 0.001));
  }
  return { betas: betas, alphas: alphas, alphaBars: alphaBars };
}

function sigmoidSchedule(T) {
  var betaStart = 0.0001, betaEnd = 0.02;
  var betas = [], alphas = [], alphaBars = [];
  var alphaBarProd = 1;
  for (var t = 0; t < T; t++) {
    var x = -6 + 12 * (t / (T - 1)); // sigmoid input from -6 to 6
    var sigmoid = 1 / (1 + Math.exp(-x));
    var beta = betaStart + (betaEnd - betaStart) * sigmoid;
    betas.push(beta);
    var alpha = 1 - beta;
    alphas.push(alpha);
    alphaBarProd *= alpha;
    alphaBars.push(alphaBarProd);
  }
  return { betas: betas, alphas: alphas, alphaBars: alphaBars };
}

var SCHEDULES = {
  linear: { label: 'Linear', color: '#ef4444', compute: linearSchedule },
  cosine: { label: 'Cosine', color: '#3b82f6', compute: cosineSchedule },
  sigmoid: { label: 'Sigmoid', color: '#22c55e', compute: sigmoidSchedule },
};

var T = 200;
var scheduleData = {};
Object.keys(SCHEDULES).forEach(function(key) {
  scheduleData[key] = SCHEDULES[key].compute(T);
});

function NoiseSchedule() {
  var [showLinear, setShowLinear] = useStateNS(true);
  var [showCosine, setShowCosine] = useStateNS(true);
  var [showSigmoid, setShowSigmoid] = useStateNS(true);
  var [chartMode, setChartMode] = useStateNS('alphaBar');
  var [hoverStep, setHoverStep] = useStateNS(-1);

  var visible = { linear: showLinear, cosine: showCosine, sigmoid: showSigmoid };

  // Chart dimensions
  var W = 700, H = 280;
  var pad = { left: 55, right: 20, top: 20, bottom: 40 };
  var plotW = W - pad.left - pad.right;
  var plotH = H - pad.top - pad.bottom;

  var getData = function(key) {
    if (chartMode === 'alphaBar') return scheduleData[key].alphaBars;
    if (chartMode === 'beta') return scheduleData[key].betas;
    if (chartMode === 'snr') {
      return scheduleData[key].alphaBars.map(function(ab) {
        var snr = ab / (1 - ab + 1e-8);
        return Math.log10(snr + 1e-8);
      });
    }
    return scheduleData[key].alphaBars;
  };

  // Y range
  var yMin = 0, yMax = 1;
  if (chartMode === 'beta') { yMin = 0; yMax = 0.025; }
  if (chartMode === 'snr') { yMin = -3; yMax = 5; }

  var toX = function(t) { return pad.left + (t / (T - 1)) * plotW; };
  var toY = function(v) { return pad.top + (1 - (v - yMin) / (yMax - yMin)) * plotH; };

  var makePath = function(data) {
    return data.map(function(v, i) {
      var clampedV = Math.max(yMin, Math.min(yMax, v));
      return (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ',' + toY(clampedV).toFixed(1);
    }).join(' ');
  };

  var yLabel = chartMode === 'alphaBar' ? 'ᾱₜ (signal preserved)' :
               chartMode === 'beta' ? 'βₜ (noise added per step)' :
               'log₁₀(SNR)';

  // Hover info
  var hoverInfo = null;
  if (hoverStep >= 0 && hoverStep < T) {
    hoverInfo = {};
    Object.keys(SCHEDULES).forEach(function(key) {
      var data = getData(key);
      hoverInfo[key] = data[hoverStep];
    });
  }

  return (
    React.createElement('div', { className: 'mb-8' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Noise Schedules'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'The noise schedule determines how quickly signal is destroyed during the forward process. ',
        React.createElement('strong', null, 'Linear'),
        ' schedules (DDPM) destroy signal too quickly in early steps. ',
        React.createElement('strong', null, 'Cosine'),
        ' schedules (Improved DDPM) preserve signal longer, giving the model more useful training signal. ',
        React.createElement('strong', null, 'Sigmoid'),
        ' schedules offer a middle ground with a smooth transition.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-2' },
          'Chart:',
          React.createElement('select', {
            value: chartMode,
            onChange: function(e) { setChartMode(e.target.value); },
            className: 'bg-gray-100 border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { value: 'alphaBar' }, 'Signal (ᾱₜ)'),
            React.createElement('option', { value: 'beta' }, 'Noise Rate (βₜ)'),
            React.createElement('option', { value: 'snr' }, 'SNR (log scale)')
          )
        ),
        React.createElement('label', { className: 'text-sm flex items-center gap-1', style: { color: SCHEDULES.linear.color } },
          React.createElement('input', { type: 'checkbox', checked: showLinear, onChange: function() { setShowLinear(!showLinear); } }),
          'Linear'
        ),
        React.createElement('label', { className: 'text-sm flex items-center gap-1', style: { color: SCHEDULES.cosine.color } },
          React.createElement('input', { type: 'checkbox', checked: showCosine, onChange: function() { setShowCosine(!showCosine); } }),
          'Cosine'
        ),
        React.createElement('label', { className: 'text-sm flex items-center gap-1', style: { color: SCHEDULES.sigmoid.color } },
          React.createElement('input', { type: 'checkbox', checked: showSigmoid, onChange: function() { setShowSigmoid(!showSigmoid); } }),
          'Sigmoid'
        )
      ),

      // Chart
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        React.createElement('svg', {
          width: W, height: H, viewBox: '0 0 ' + W + ' ' + H,
          className: 'w-full max-w-[700px]',
          onMouseMove: function(e) {
            var rect = e.currentTarget.getBoundingClientRect();
            var mx = (e.clientX - rect.left) / rect.width * W;
            var t = Math.round((mx - pad.left) / plotW * (T - 1));
            setHoverStep(Math.max(0, Math.min(T - 1, t)));
          },
          onMouseLeave: function() { setHoverStep(-1); }
        },

          React.createElement('rect', { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: '#111827', rx: 4 }),

          // Grid lines
          [0, 0.25, 0.5, 0.75, 1].map(function(f) {
            var v = yMin + f * (yMax - yMin);
            var y = toY(v);
            return React.createElement('g', { key: 'gy-' + f },
              React.createElement('line', { x1: pad.left, y1: y, x2: pad.left + plotW, y2: y, stroke: '#1f2937', strokeWidth: 0.5 }),
              React.createElement('text', { x: pad.left - 5, y: y + 3, fill: '#9ca3af', fontSize: '9', textAnchor: 'end' },
                chartMode === 'beta' ? v.toFixed(3) : chartMode === 'snr' ? v.toFixed(0) : v.toFixed(2)
              )
            );
          }),

          // X-axis ticks
          [0, 50, 100, 150, 200].map(function(t) {
            if (t >= T) return null;
            return React.createElement('text', {
              key: 'xt-' + t,
              x: toX(t), y: H - pad.bottom + 18,
              fill: '#9ca3af', fontSize: '9', textAnchor: 'middle'
            }, t);
          }),

          // Axis labels
          React.createElement('text', { x: pad.left + plotW / 2, y: H - 5, fill: '#d1d5db', fontSize: '11', textAnchor: 'middle' }, 'Timestep t'),
          React.createElement('text', {
            x: 12, y: pad.top + plotH / 2, fill: '#d1d5db', fontSize: '11', textAnchor: 'middle',
            transform: 'rotate(-90, 12, ' + (pad.top + plotH / 2) + ')'
          }, yLabel),

          // Curves
          Object.keys(SCHEDULES).map(function(key) {
            if (!visible[key]) return null;
            return React.createElement('path', {
              key: 'curve-' + key,
              d: makePath(getData(key)),
              fill: 'none',
              stroke: SCHEDULES[key].color,
              strokeWidth: 2.5,
              opacity: 0.9
            });
          }),

          // Hover line
          hoverStep >= 0 ? React.createElement('line', {
            x1: toX(hoverStep), y1: pad.top, x2: toX(hoverStep), y2: pad.top + plotH,
            stroke: '#e5e7eb', strokeWidth: 1, strokeDasharray: '4,2'
          }) : null,

          // Hover dots
          hoverStep >= 0 ? Object.keys(SCHEDULES).map(function(key) {
            if (!visible[key]) return null;
            var data = getData(key);
            var v = Math.max(yMin, Math.min(yMax, data[hoverStep]));
            return React.createElement('circle', {
              key: 'dot-' + key,
              cx: toX(hoverStep), cy: toY(v), r: 5,
              fill: SCHEDULES[key].color
            });
          }) : null,

          // Legend
          Object.keys(SCHEDULES).map(function(key, i) {
            if (!visible[key]) return null;
            var lx = pad.left + 10 + i * 100;
            return React.createElement('g', { key: 'leg-' + key },
              React.createElement('rect', { x: lx, y: pad.top + 8, width: 14, height: 3, fill: SCHEDULES[key].color }),
              React.createElement('text', { x: lx + 18, y: pad.top + 14, fill: SCHEDULES[key].color, fontSize: '10' }, SCHEDULES[key].label)
            );
          })
        )
      ),

      // Hover info + comparison cards
      React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-3' },
        Object.keys(SCHEDULES).map(function(key) {
          if (!visible[key]) return null;
          var sched = scheduleData[key];
          var midAlpha = sched.alphaBars[Math.floor(T / 2)];
          var signal50 = 0;
          for (var t = 0; t < T; t++) {
            if (sched.alphaBars[t] < 0.5) { signal50 = t; break; }
          }
          return React.createElement('div', {
            key: 'card-' + key,
            className: 'rounded-lg p-3 border-l-4',
            style: { borderColor: SCHEDULES[key].color, backgroundColor: '#f9fafb' }
          },
            React.createElement('h4', { className: 'font-bold text-sm mb-2' }, SCHEDULES[key].label + ' Schedule'),
            React.createElement('div', { className: 'space-y-1 text-xs text-gray-600' },
              React.createElement('div', null, 'Signal at t=' + Math.floor(T/2) + ': ',
                React.createElement('span', { className: 'font-mono font-bold text-gray-800' }, (midAlpha * 100).toFixed(1) + '%')
              ),
              React.createElement('div', null, '50% signal lost at: ',
                React.createElement('span', { className: 'font-mono font-bold text-gray-800' }, 't=' + signal50)
              ),
              React.createElement('div', null, 'Final ᾱ_T: ',
                React.createElement('span', { className: 'font-mono font-bold text-gray-800' },
                  (sched.alphaBars[T - 1] * 100).toFixed(3) + '%'
                )
              ),
              hoverStep >= 0 ? React.createElement('div', { className: 'mt-2 pt-2 border-t border-gray-200' },
                'At t=' + hoverStep + ': ',
                React.createElement('span', { className: 'font-mono font-bold', style: { color: SCHEDULES[key].color } },
                  chartMode === 'alphaBar' ? (sched.alphaBars[hoverStep] * 100).toFixed(2) + '%' :
                  chartMode === 'beta' ? sched.betas[hoverStep].toFixed(5) :
                  (Math.log10(sched.alphaBars[hoverStep] / (1 - sched.alphaBars[hoverStep] + 1e-8))).toFixed(2)
                )
              ) : null
            )
          );
        })
      )
    )
  );
}
