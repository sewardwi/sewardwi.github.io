// Trajectory Viewer — qubit z_t under continuous measurement, forward vs. backward
var { useState: useStateTV, useEffect: useEffectTV, useRef: useRefTV, useCallback: useCallbackTV } = React;

function randnTV() {
  var u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

// Simulate qubit z_t = Tr(rho * sigma_z) under continuous sigma_z measurement
// H = omega * sigma_y / 2  =>  precession in x-z plane
// Uses a simplified 1D model capturing the key qualitative features:
// "Rabi oscillations superimposed with stochastic diffusion"
function simulateQubitTraj(nSteps, omega, tau, seed) {
  // seed shifts initial phase for variety
  var dt = 1 / nSteps;
  var z = 0.0 + 0.05 * (seed % 7 - 3);  // small variation in start
  var x = 0.7;
  var y = 0.0;
  var traj = [];

  for (var i = 0; i < nSteps; i++) {
    var dW = Math.sqrt(dt / tau) * randnTV();

    // Precession: H = omega * sigma_y / 2  =>  dz/dt = omega * x, dx/dt = -omega * z
    var dz_prec = omega * x * dt;
    var dx_prec = -omega * z * dt;

    // Measurement back-action (Ito form for continuous sigma_z monitoring)
    var dz_meas = 2 * (1 - z * z) * dW;
    var dx_meas = -2 * x * z * dW;

    // Measurement-induced dephasing (Lindblad term)
    var dz_deph = 0;
    var dx_deph = -x * dt / (2 * tau);
    var dy_deph = -y * dt / (2 * tau);

    z = z + dz_prec + dz_meas + dz_deph;
    x = x + dx_prec + dx_meas + dx_deph;
    y = y + dy_deph;

    // Renormalize to Bloch sphere
    var norm = Math.sqrt(z * z + x * x + y * y);
    if (norm > 1.001) { z /= norm; x /= norm; y /= norm; }

    z = Math.max(-1, Math.min(1, z));
    traj.push(z);
  }
  return traj;
}

var N_STEPS = 400;
var OMEGA = 3 * Math.PI;  // omega*tau = 3pi -> ~1.5 Rabi oscillations visible
var TAU_TRAJ = 0.12;       // measurement strength

function TrajectoryViewer() {
  var [trajSeed, setTrajSeed] = useStateTV(42);
  var [fwdTraj, setFwdTraj] = useStateTV(null);
  var [showReversed, setShowReversed] = useStateTV(true);
  var [animFrame, setAnimFrame] = useStateTV(0);
  var [playing, setPlaying] = useStateTV(false);
  var rafRef = useRefTV(null);
  var lastTimeRef = useRefTV(null);
  var fwdCanvasRef = useRefTV(null);
  var bwdCanvasRef = useRefTV(null);

  // Generate trajectory
  var generateTraj = useCallbackTV(function(seed) {
    var traj = simulateQubitTraj(N_STEPS, OMEGA, TAU_TRAJ, seed);
    setFwdTraj(traj);
    setAnimFrame(0);
    setPlaying(false);
  }, []);

  useEffectTV(function() {
    generateTraj(trajSeed);
  }, [trajSeed, generateTraj]);

  // Animation loop
  useEffectTV(function() {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    var SPEED = 2; // frames per 16ms tick
    function tick(time) {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      var dt = time - lastTimeRef.current;
      if (dt > 16) {
        lastTimeRef.current = time;
        setAnimFrame(function(f) {
          if (f >= N_STEPS - 1) { setPlaying(false); return f; }
          return Math.min(f + SPEED, N_STEPS - 1);
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return function() { cancelAnimationFrame(rafRef.current); };
  }, [playing]);

  // Draw canvas
  var drawCanvas = useCallbackTV(function(canvas, traj, reversed, frame) {
    if (!canvas || !traj) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var padL = 10, padR = 10, padT = 10, padB = 10;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Zero line
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH / 2);
    ctx.lineTo(W - padR, padT + plotH / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    var toX = function(i) { return padL + (i / (N_STEPS - 1)) * plotW; };
    var toY = function(z) { return padT + (1 - (z + 1) / 2) * plotH; };

    var displayTraj = reversed ? traj.slice().reverse() : traj;
    var color = reversed ? '#f97316' : '#818cf8'; // orange for backward, indigo for forward
    var count = Math.min(frame + 1, N_STEPS);

    // Gradient fill under curve
    var grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, (reversed ? 'rgba(249,115,22,0.15)' : 'rgba(129,140,248,0.15)'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(toX(0), padT + plotH / 2);
    for (var i = 0; i < count; i++) {
      ctx.lineTo(toX(i), toY(displayTraj[i]));
    }
    ctx.lineTo(toX(count - 1), padT + plotH / 2);
    ctx.closePath();
    ctx.fill();

    // Main line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      if (i === 0) ctx.moveTo(toX(i), toY(displayTraj[i]));
      else ctx.lineTo(toX(i), toY(displayTraj[i]));
    }
    ctx.stroke();

    // Current point dot
    if (count > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(count - 1), toY(displayTraj[count - 1]), 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, []);

  useEffectTV(function() {
    drawCanvas(fwdCanvasRef.current, fwdTraj, false, animFrame);
    if (showReversed) drawCanvas(bwdCanvasRef.current, fwdTraj, true, animFrame);
  }, [fwdTraj, animFrame, showReversed, drawCanvas]);

  return (
    React.createElement('div', { className: 'mb-10' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Quantum Trajectory Replication & Time Reversal'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Each trajectory shows z\u209c = \u27e8\u03c3\u1d63\u27e9\u209c for a qubit with H = \u03c9\u03c3\u1d67/2 under continuous \u03c3\u1d63 measurement. ',
        'The Rabi oscillations (from the Hamiltonian) are modulated by measurement-induced stochastic noise. ',
        'The time-reversed trajectory runs the same record backward in time — under normal conditions the two look different, ',
        'but when \u03a7 = \u22123, they become statistically identical.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-4 mb-4' },
        React.createElement('button', {
          onClick: function() { setAnimFrame(0); setPlaying(true); },
          className: 'px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium'
        }, 'Play'),
        React.createElement('button', {
          onClick: function() { setPlaying(false); },
          className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium'
        }, 'Pause'),
        React.createElement('button', {
          onClick: function() { setTrajSeed(function(s) { return s + 1; }); },
          className: 'px-4 py-2 bg-gray-700 text-white rounded text-sm font-medium'
        }, 'New Trajectory'),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', {
            type: 'checkbox', checked: showReversed,
            onChange: function() { setShowReversed(function(s) { return !s; }); }
          }),
          'Show time-reversed'
        )
      ),

      // Canvases
      React.createElement('div', { className: 'bg-gray-900 rounded-lg p-4 mb-4' },
        // Forward
        React.createElement('div', { className: 'mb-3' },
          React.createElement('div', { className: 'text-xs text-indigo-400 mb-1 font-medium' },
            '\u25b6 Forward trajectory — time runs left to right'
          ),
          React.createElement('canvas', {
            ref: fwdCanvasRef, width: 680, height: 110,
            className: 'w-full rounded',
            style: { maxWidth: '680px' }
          })
        ),
        // Backward
        showReversed ? React.createElement('div', null,
          React.createElement('div', { className: 'text-xs text-orange-400 mb-1 font-medium' },
            '\u25c4 Time-reversed trajectory — same record, run backward'
          ),
          React.createElement('canvas', {
            ref: bwdCanvasRef, width: 680, height: 110,
            className: 'w-full rounded',
            style: { maxWidth: '680px' }
          })
        ) : null,

        // X-axis labels
        React.createElement('div', { className: 'flex justify-between text-xs text-gray-500 mt-2 px-2' },
          React.createElement('span', null, 't = 0'),
          React.createElement('span', null, 't = T/2'),
          React.createElement('span', null, 't = T')
        )
      ),

      // Y-axis legend
      React.createElement('div', { className: 'flex gap-6 text-sm mb-4' },
        React.createElement('div', { className: 'flex items-center gap-1' },
          React.createElement('div', { className: 'w-4 h-1 bg-indigo-400 rounded' }),
          React.createElement('span', { className: 'text-gray-600' }, '\u27e8\u03c3\u1d63\u27e9 forward')
        ),
        showReversed ? React.createElement('div', { className: 'flex items-center gap-1' },
          React.createElement('div', { className: 'w-4 h-1 bg-orange-400 rounded' }),
          React.createElement('span', { className: 'text-gray-600' }, '\u27e8\u03c3\u1d63\u27e9 time-reversed')
        ) : null,
        React.createElement('div', { className: 'flex items-center gap-1' },
          React.createElement('div', { className: 'w-4 h-1 bg-gray-500 rounded', style: { borderTop: '1px dashed #6b7280' } }),
          React.createElement('span', { className: 'text-gray-600' }, '\u27e8\u03c3\u1d63\u27e9 = 0')
        )
      ),

      React.createElement('div', { className: 'bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800' },
        React.createElement('span', { className: 'font-semibold' }, 'Paper result: '),
        'The measurement-replicating Hamiltonian H\u2098\u2091\u2090\u209b exactly reproduces any stochastic trajectory deterministically, given the measurement record r\u209c. ',
        'The time-reversed version uses \u2212H \u2212 H\u2098\u2091\u2090\u209b, effectively "undoing" decoherence and running dynamics backward in time.'
      )
    )
  );
}
