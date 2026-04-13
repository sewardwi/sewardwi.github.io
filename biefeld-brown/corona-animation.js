// Corona Animation — Biefeld-Brown ionic wind particle sim
// Hook aliases for shared global scope
var { useState: useStateCO, useEffect: useEffectCO, useRef: useRefCO, useCallback: useCallbackCO } = React;

var CANVAS_W = 700, CANVAS_H = 340;
var WIRE_X = 80;       // emitter wire x position
var PLATE_X = 620;     // collector plate x position
var MID_Y = CANVAS_H / 2;

// Ion properties
var ION_RADIUS = 4;
var NEUTRAL_RADIUS = 5;
var MAX_IONS = 80;
var MAX_NEUTRALS = 60;

function CoronaAnimation() {
  var [voltage, setVoltage] = useStateCO(25); // kV
  var [running, setRunning] = useStateCO(true);
  var [showLabels, setShowLabels] = useStateCO(true);
  var canvasRef = useRefCO(null);
  var stateRef = useRefCO(null);
  var rafRef = useRefCO(null);

  // Physics-derived parameters
  var V_onset = 7; // kV
  var activeVoltage = Math.max(voltage, V_onset + 0.1);
  var ionAccel = ((activeVoltage - V_onset) / 20) * 0.18 + 0.04; // px/frame²
  var spawnRate = Math.max(0, (activeVoltage - V_onset) / 18) * 0.35 + 0.05;
  var coronaRadius = 18 + (activeVoltage - V_onset) * 0.8;

  // Initialize simulation state
  var initState = useCallbackCO(function() {
    return {
      ions: [],
      neutrals: Array.from({ length: 35 }, function(_, i) {
        return {
          x: 130 + Math.random() * (PLATE_X - 145),
          y: 30 + Math.random() * (CANVAS_H - 60),
          vx: 0, vy: 0,
          opacity: 0.6 + Math.random() * 0.3,
          radius: 4 + Math.random() * 3,
          hit: false, hitTimer: 0
        };
      }),
      spawnAccum: 0,
      frame: 0
    };
  }, []);

  useEffectCO(function() {
    stateRef.current = initState();
  }, [initState]);

  // Main animation loop
  useEffectCO(function() {
    var canvas = canvasRef.current;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    function draw() {
      if (!stateRef.current) return;
      var s = stateRef.current;
      s.frame++;

      // Clear
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // ---- Draw electric field lines (background, subtle) ----
      ctx.save();
      ctx.globalAlpha = 0.07;
      for (var i = 0; i < 9; i++) {
        var fy = 40 + i * (CANVAS_H - 80) / 8;
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        // Slightly curved lines from wire to plate
        ctx.moveTo(WIRE_X + 20, fy);
        var ctrlY = MID_Y + (fy - MID_Y) * 0.3;
        ctx.quadraticCurveTo(CANVAS_W / 2, fy, PLATE_X - 10, fy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // ---- Corona glow ----
      var glowR = coronaRadius;
      var glowGrad = ctx.createRadialGradient(WIRE_X, MID_Y, 2, WIRE_X, MID_Y, glowR);
      glowGrad.addColorStop(0, 'rgba(180, 100, 255, 0.7)');
      glowGrad.addColorStop(0.4, 'rgba(100, 60, 200, 0.25)');
      glowGrad.addColorStop(1, 'rgba(60, 20, 120, 0)');
      ctx.beginPath();
      ctx.arc(WIRE_X, MID_Y, glowR, 0, 2 * Math.PI);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // flickering corona streamers
      if (voltage >= V_onset) {
        var nStreamers = Math.floor((voltage - V_onset) / 4) + 2;
        for (var si = 0; si < nStreamers; si++) {
          var ang = (s.frame * 0.04 + si * Math.PI * 2 / nStreamers + si * 0.5) % (2 * Math.PI);
          var sLen = glowR * (0.7 + 0.3 * Math.sin(s.frame * 0.1 + si));
          ctx.save();
          ctx.globalAlpha = 0.4 + 0.3 * Math.sin(s.frame * 0.07 + si * 1.3);
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(WIRE_X, MID_Y);
          ctx.lineTo(WIRE_X + Math.cos(ang) * sLen, MID_Y + Math.sin(ang) * sLen);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ---- Collector plate ----
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(PLATE_X - 6, 40, 12, CANVAS_H - 80);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(PLATE_X - 6, 40, 12, CANVAS_H - 80);
      // Plate glow (negative)
      var plateGrad = ctx.createRadialGradient(PLATE_X, MID_Y, 5, PLATE_X, MID_Y, 50);
      plateGrad.addColorStop(0, 'rgba(30, 120, 255, 0.15)');
      plateGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = plateGrad;
      ctx.fillRect(PLATE_X - 50, 40, 60, CANVAS_H - 80);

      // ---- Emitter wire ----
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 8;
      ctx.fillRect(WIRE_X - 3, 40, 6, CANVAS_H - 80);
      ctx.shadowBlur = 0;

      // ---- Spawn new ions ----
      if (running && voltage >= V_onset) {
        s.spawnAccum += spawnRate;
        while (s.spawnAccum >= 1 && s.ions.length < MAX_IONS) {
          s.spawnAccum -= 1;
          var angle = Math.random() * 2 * Math.PI;
          var r0 = glowR * 0.5 + Math.random() * glowR * 0.4;
          s.ions.push({
            x: WIRE_X + Math.cos(angle) * r0,
            y: MID_Y + Math.sin(angle) * r0,
            vx: 0.3 + Math.random() * 0.5,
            vy: (Math.random() - 0.5) * 0.4,
            charge: 1,
            age: 0
          });
        }
      }

      // ---- Update neutrals (drift after being hit, then slowly settle) ----
      s.neutrals.forEach(function(n) {
        if (n.hit) {
          n.vx += 0.012;
          n.hitTimer--;
          if (n.hitTimer <= 0) { n.hit = false; }
        }
        n.vx *= 0.97; // damping
        n.vy *= 0.97;
        n.x += n.vx;
        n.y += n.vy + Math.sin(n.x * 0.05 + s.frame * 0.01) * 0.03;
        // Wrap around
        if (n.x > PLATE_X - 10) { n.x = 130 + Math.random() * 50; n.vx = 0; n.vy = 0; }
        if (n.x < 110) n.x = 110;
        n.y = Math.max(30, Math.min(CANVAS_H - 30, n.y));
      });

      // Draw neutrals (air molecules)
      s.neutrals.forEach(function(n) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
        ctx.fillStyle = n.hit ? 'rgba(147, 197, 253, 0.8)' : ('rgba(100, 130, 180, ' + n.opacity + ')');
        ctx.fill();
        if (n.hit) {
          ctx.strokeStyle = 'rgba(147, 197, 253, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // N₂ label
        if (n.radius > 6 && showLabels) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
          ctx.font = '7px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('N₂', n.x, n.y + 3);
        }
      });

      // ---- Update & draw ions ----
      s.ions = s.ions.filter(function(ion) {
        if (!running) return true;
        // Accelerate toward plate (simplified uniform field + slight funnel)
        var fieldStrength = ionAccel;
        ion.vx += fieldStrength;
        // Slight vertical attraction toward center (field lens effect)
        ion.vy += (MID_Y - ion.y) * 0.0004;
        // Drag
        ion.vx *= 0.985;
        ion.vy *= 0.98;
        ion.x += ion.vx;
        ion.y += ion.vy;
        ion.age++;

        // Collision with neutrals
        s.neutrals.forEach(function(n) {
          var dx = ion.x - n.x, dy = ion.y - n.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ION_RADIUS + n.radius + 2) {
            n.hit = true;
            n.hitTimer = 25 + Math.floor(Math.random() * 20);
            n.vx += ion.vx * 0.15;
            n.vy += ion.vy * 0.08;
            ion.vx *= 0.7;
            ion.vy += (Math.random() - 0.5) * 0.3;
          }
        });

        // Remove if reached plate or gone off-screen
        return ion.x < PLATE_X + 5 && ion.age < 500;
      });

      // Draw ions
      s.ions.forEach(function(ion) {
        // Trail
        ctx.beginPath();
        ctx.arc(ion.x - ion.vx * 3, ion.y - ion.vy * 3, ION_RADIUS * 0.5, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(253, 186, 116, 0.2)';
        ctx.fill();
        // Ion
        ctx.beginPath();
        ctx.arc(ion.x, ion.y, ION_RADIUS, 0, 2 * Math.PI);
        var ionGrad = ctx.createRadialGradient(ion.x - 1, ion.y - 1, 0, ion.x, ion.y, ION_RADIUS);
        ionGrad.addColorStop(0, '#fef3c7');
        ionGrad.addColorStop(1, '#f59e0b');
        ctx.fillStyle = ionGrad;
        ctx.fill();
        // + label
        if (showLabels) {
          ctx.fillStyle = '#1a1a1a';
          ctx.font = 'bold 7px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('+', ion.x, ion.y + 3);
        }
      });

      // ---- Thrust arrow on device (left-pointing) ----
      if (voltage >= V_onset) {
        var thrustMag = Math.min(60, (voltage - V_onset) * 3.5);
        var arrowX = WIRE_X - 20;
        ctx.save();
        ctx.strokeStyle = '#22c55e';
        ctx.fillStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 6;
        // Arrow shaft
        ctx.beginPath();
        ctx.moveTo(arrowX, MID_Y);
        ctx.lineTo(arrowX - thrustMag, MID_Y);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(arrowX - thrustMag, MID_Y);
        ctx.lineTo(arrowX - thrustMag + 12, MID_Y - 7);
        ctx.lineTo(arrowX - thrustMag + 12, MID_Y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (showLabels) {
          ctx.fillStyle = '#22c55e';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('THRUST', arrowX - thrustMag / 2, MID_Y - 12);
        }
      }

      // ---- Ion wind arrow (right-pointing at bottom) ----
      if (voltage >= V_onset && showLabels) {
        var windStrength = Math.min(80, (voltage - V_onset) * 4);
        ctx.save();
        ctx.strokeStyle = '#60a5fa';
        ctx.fillStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(180, CANVAS_H - 35);
        ctx.lineTo(180 + windStrength, CANVAS_H - 35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(180 + windStrength, CANVAS_H - 35);
        ctx.lineTo(180 + windStrength - 10, CANVAS_H - 42);
        ctx.lineTo(180 + windStrength - 10, CANVAS_H - 28);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#93c5fd';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('ionic wind →', 185, CANVAS_H - 47);
        ctx.restore();
      }

      // ---- Labels ----
      if (showLabels) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('+ HV', WIRE_X, 32);
        ctx.fillText('Emitter', WIRE_X, 22);
        ctx.fillStyle = '#60a5fa';
        ctx.fillText('Collector', PLATE_X, 22);
        ctx.fillText('(−)', PLATE_X, 32);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px sans-serif';
        ctx.fillText('Ion (+)', WIRE_X + 45, MID_Y - 25);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Air mol.', 250, MID_Y + 30);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return function() { cancelAnimationFrame(rafRef.current); };
  }, [running, voltage, ionAccel, spawnRate, coronaRadius, showLabels]);

  // Derived display values
  var mu_b = 2e-4; // m²/(V·s)
  var epsilon = 8.85e-12;
  var d = 0.025; // 25mm gap for display (fixed typical)
  var Lc = d;
  var C = 9 * mu_b * epsilon / (8 * Lc * Lc);
  var dV = Math.max(0, voltage - V_onset) * 1000;
  var I_mA = C * dV * dV * 1000; // in mA
  var T_mN = (C * dV * dV * d / mu_b) * 1000; // in mN

  return (
    React.createElement('div', { className: 'mb-10' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Corona Discharge & Ionic Wind'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'High voltage on the sharp emitter wire ionizes surrounding air. Positive ions accelerate toward the grounded collector, ',
        'colliding with neutral air molecules and dragging them along — the "ionic wind." ',
        'By Newton\'s 3rd law, the device experiences thrust in the opposite direction. No moving parts.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-6 mb-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Voltage: ',
            React.createElement('span', { className: 'font-mono font-bold text-yellow-600' }, voltage + ' kV'),
            voltage < V_onset ? React.createElement('span', { className: 'text-red-500 text-xs ml-2' }, '(below onset ~7 kV)') : null
          ),
          React.createElement('input', {
            type: 'range', min: '0', max: '40', step: '1', value: voltage,
            onChange: function(e) { setVoltage(Number(e.target.value)); },
            className: 'w-64'
          })
        ),
        React.createElement('button', {
          onClick: function() { setRunning(!running); },
          className: 'px-4 py-2 rounded text-sm font-medium ' + (running ? 'bg-yellow-600 text-white' : 'bg-indigo-600 text-white')
        }, running ? 'Pause' : 'Resume'),
        React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
          React.createElement('input', { type: 'checkbox', checked: showLabels, onChange: function() { setShowLabels(!showLabels); } }),
          'Labels'
        )
      ),

      React.createElement('div', { className: 'bg-gray-950 rounded-lg overflow-hidden mb-4' },
        React.createElement('canvas', {
          ref: canvasRef, width: CANVAS_W, height: CANVAS_H,
          className: 'w-full', style: { maxWidth: CANVAS_W + 'px', display: 'block' }
        })
      ),

      // Live physics readout
      React.createElement('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-3 text-sm' },
        React.createElement('div', { className: 'bg-yellow-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Applied Voltage'),
          React.createElement('div', { className: 'font-mono font-bold text-yellow-600' }, voltage + ' kV')
        ),
        React.createElement('div', { className: 'bg-gray-100 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Corona Current'),
          React.createElement('div', { className: 'font-mono font-bold text-purple-600' },
            voltage < V_onset ? '0 mA' : I_mA.toFixed(2) + ' mA'
          )
        ),
        React.createElement('div', { className: 'bg-green-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'EHD Thrust'),
          React.createElement('div', { className: 'font-mono font-bold text-green-600' },
            voltage < V_onset ? '0 mN' : T_mN.toFixed(1) + ' mN'
          )
        ),
        React.createElement('div', { className: 'bg-blue-50 rounded p-2' },
          React.createElement('div', { className: 'text-gray-500 text-xs' }, 'Status'),
          React.createElement('div', { className: 'font-bold text-xs ' + (voltage < V_onset ? 'text-red-500' : 'text-green-600') },
            voltage < V_onset ? 'Below corona onset' :
            voltage < 15 ? 'Weak corona' :
            voltage < 25 ? 'Active corona' : 'Strong corona'
          )
        )
      )
    )
  );
}
