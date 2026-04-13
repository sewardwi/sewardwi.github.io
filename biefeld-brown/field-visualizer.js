// Electric Field & Ion Trajectory Visualizer — method of images for wire-plate
var { useState: useStateFV, useEffect: useEffectFV, useRef: useRefFV } = React;

// Compute electric potential for wire-plate geometry using method of images.
// Wire at (wx, wy), image wire at (wx, -wy) reflected across y=0 (the plate = ground).
// phi(x,y) = (V/2pi*eps) * ln(r2/r1) — we just compute relative potential.
function potential(x, y, wireX, wireY, wireV) {
  var r1_sq = (x - wireX) * (x - wireX) + (y - wireY) * (y - wireY);
  var r2_sq = (x - wireX) * (x - wireX) + (y + wireY) * (y + wireY);
  if (r1_sq < 0.0001) r1_sq = 0.0001;
  if (r2_sq < 0.0001) r2_sq = 0.0001;
  return (wireV / (2 * Math.PI)) * Math.log(Math.sqrt(r2_sq / r1_sq));
}

// Electric field components (negative gradient of potential)
function electricField(x, y, wireX, wireY, wireV) {
  var dx1 = x - wireX, dy1 = y - wireY;
  var dx2 = x - wireX, dy2 = y + wireY;
  var r1_sq = dx1 * dx1 + dy1 * dy1;
  var r2_sq = dx2 * dx2 + dy2 * dy2;
  if (r1_sq < 0.01) r1_sq = 0.01;
  if (r2_sq < 0.01) r2_sq = 0.01;
  var Ex = (wireV / (2 * Math.PI)) * (dx1 / r1_sq - dx2 / r2_sq);
  var Ey = (wireV / (2 * Math.PI)) * (dy1 / r1_sq - dy2 / r2_sq);
  return { Ex: Ex, Ey: Ey };
}

var W = 700, H = 380;
var PLATE_Y = H - 40;  // grounded plate = bottom
var WIRE_Y_BASE = 80;  // wire above plate (we'll scale by gap)

function FieldVisualizer() {
  var [voltage, setVoltage] = useStateFV(30);    // kV
  var [gapPx, setGapPx] = useStateFV(220);       // gap in pixels (display)
  var [showField, setShowField] = useStateFV(true);
  var [showPotential, setShowPotential] = useStateFV(true);
  var [showTrajectories, setShowTrajectories] = useStateFV(true);
  var canvasRef = useRefFV(null);

  var wireX = W / 2;
  var wireY = PLATE_Y - gapPx;

  useEffectFV(function() {
    var canvas = canvasRef.current;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    var wireV = voltage; // use kV as scaled units

    // ---- Equipotential lines ----
    if (showPotential) {
      var nLevels = 12;
      // Sample potential at a grid, then draw contours
      // Approximation: draw circles-of-constant-potential analytically
      // For wire-plate: equipotentials are circles (Apollonius circles)
      // r2/r1 = exp(2pi*phi/V) = const => set k = r2/r1
      var kValues = Array.from({ length: nLevels }, function(_, i) {
        return Math.exp(((i + 1) / (nLevels + 1) - 0.5) * 3);
      });

      kValues.forEach(function(k, idx) {
        // Apollonius circle: locus where r2/r1 = k
        // Center: (wireX, (k^2*wireY + wireY)/(k^2-1) = wireY*(k^2+1)/(k^2-1) if k != 1)
        if (Math.abs(k - 1) < 0.05) return; // skip near-wire
        var cy = wireY + 2 * wireY * k * k / (k * k - 1) - wireY;
        // radius: 2*wireY*k/|k^2-1|
        var r_ap = Math.abs(2 * wireY * k / (k * k - 1));

        // Level: positive (k>1 = closer to image=higher potential from above)
        var frac = (k > 1) ? Math.min(1, (k - 1) / 4) : Math.min(1, (1 / k - 1) / 4);
        var isPos = k > 1;
        ctx.beginPath();
        ctx.arc(wireX, PLATE_Y - (wireY - (cy - wireY)), r_ap, 0, 2 * Math.PI);
        ctx.strokeStyle = isPos ?
          'rgba(251, 191, 36, ' + (0.15 + frac * 0.35) + ')' :
          'rgba(96, 165, 250, ' + (0.15 + frac * 0.35) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // ---- Electric field arrows (vector field) ----
    if (showField) {
      var gridStep = 35;
      for (var gx = gridStep; gx < W - 10; gx += gridStep) {
        for (var gy = 20; gy < PLATE_Y - 10; gy += gridStep) {
          // Convert screen coords to field coords (y flipped, plate=0)
          var fieldX = gx - wireX;
          var fieldY = -(gy - PLATE_Y); // +y up in field coords
          var ef = electricField(fieldX, fieldY, 0, -(wireY - PLATE_Y), wireV);
          var mag = Math.sqrt(ef.Ex * ef.Ex + ef.Ey * ef.Ey);
          if (mag < 0.001) continue;

          var scale = Math.min(14, 3 / mag * 8);
          var nx = ef.Ex / mag, ny = ef.Ey / mag;
          // Map field direction to screen (flip y)
          var sdx = nx * scale, sdy = -ny * scale;

          var alpha = Math.min(0.8, 0.15 + mag * 0.4);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(gx - sdx * 0.5, gy - sdy * 0.5);
          ctx.lineTo(gx + sdx * 0.5, gy + sdy * 0.5);
          ctx.stroke();
          // Arrow tip
          ctx.fillStyle = '#818cf8';
          ctx.beginPath();
          var tipX = gx + sdx * 0.5, tipY = gy + sdy * 0.5;
          var perpX = -sdy / scale * 3, perpY = sdx / scale * 3;
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - sdx / scale * 5 + perpX, tipY - sdy / scale * 5 + perpY);
          ctx.lineTo(tipX - sdx / scale * 5 - perpX, tipY - sdy / scale * 5 - perpY);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // ---- Ion trajectories ----
    if (showTrajectories) {
      var nTrajs = 9;
      var startXs = Array.from({ length: nTrajs }, function(_, i) {
        return wireX - 60 + (i * 15);
      });
      startXs.forEach(function(sx, ti) {
        // Trace from near wire toward plate
        var px = sx - wireX, py = -(wireY - 20 - PLATE_Y);
        var points = [{ x: sx, y: wireY + 20 }];
        var stepSize = 4;

        for (var step = 0; step < 200; step++) {
          var ef = electricField(px, py, 0, -(wireY - PLATE_Y), wireV);
          var mag = Math.sqrt(ef.Ex * ef.Ex + ef.Ey * ef.Ey);
          if (mag < 0.001) break;
          var nx = ef.Ex / mag, ny = ef.Ey / mag;
          px += nx * stepSize;
          py += ny * stepSize * (-1); // reverse y: field points from + to -
          // Actually ions go from + wire toward - plate, same as E field direction
          // In our coords: field points away from wire (positive), ions follow E
          px += ef.Ex / mag * stepSize;
          py -= ef.Ey / mag * stepSize;

          var screenX = px + wireX;
          var screenY = PLATE_Y - py;
          points.push({ x: screenX, y: screenY });
          if (screenY >= PLATE_Y - 5 || screenX < 5 || screenX > W - 5) break;
        }

        if (points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var pi = 1; pi < points.length; pi++) {
          ctx.lineTo(points[pi].x, points[pi].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Ion dot along path
        var midPt = points[Math.floor(points.length * 0.5)];
        if (midPt) {
          ctx.beginPath();
          ctx.arc(midPt.x, midPt.y, 3, 0, 2 * Math.PI);
          ctx.fillStyle = '#fbbf24';
          ctx.fill();
        }
        ctx.restore();
      });
    }

    // ---- Grounded plate ----
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, PLATE_Y, W, H - PLATE_Y);
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, PLATE_Y, W, 4);

    // Plate ground symbols
    for (var gi = 0; gi < 8; gi++) {
      var gsx = 50 + gi * 90;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gsx, PLATE_Y + 4);
      ctx.lineTo(gsx, PLATE_Y + 14);
      ctx.moveTo(gsx - 8, PLATE_Y + 14);
      ctx.lineTo(gsx + 8, PLATE_Y + 14);
      ctx.moveTo(gsx - 5, PLATE_Y + 18);
      ctx.lineTo(gsx + 5, PLATE_Y + 18);
      ctx.moveTo(gsx - 2, PLATE_Y + 22);
      ctx.lineTo(gsx + 2, PLATE_Y + 22);
      ctx.stroke();
    }
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Collector (Ground, −)', 10, PLATE_Y - 8);

    // ---- Emitter wire ----
    ctx.save();
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(wireX - 3, wireY - 5, 6, 10);
    ctx.restore();

    // Wire label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Emitter Wire (+' + voltage + ' kV)', wireX, wireY - 14);

    // ---- Legend ----
    ctx.fillStyle = 'rgba(15,23,42,0.7)';
    ctx.fillRect(8, 8, 170, 58);
    ctx.fillStyle = '#fbbf24';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('─ ─  Ion trajectories', 16, 22);
    ctx.fillStyle = '#818cf8';
    ctx.fillText('→  Electric field vectors', 16, 36);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('◯  Equipotential lines', 16, 50);
    ctx.fillStyle = '#64748b';
    ctx.fillText('     Yellow = +V, Blue = 0', 16, 62);

    // ---- Gap annotation ----
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(W - 30, wireY);
    ctx.lineTo(W - 30, PLATE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(gapPx / 10) + ' mm gap', W - 30, (wireY + PLATE_Y) / 2);

  }, [voltage, gapPx, showField, showPotential, showTrajectories, wireX, wireY]);

  return (
    React.createElement('div', { className: 'mb-10' },
      React.createElement('h2', { className: 'text-2xl font-bold mb-2' }, 'Electric Field & Ion Trajectories'),
      React.createElement('p', { className: 'text-gray-600 mb-4 text-sm' },
        'Wire-to-plate geometry solved analytically via method of images. ',
        'Equipotential lines are Apollonius circles; field lines radiate from the wire. ',
        'Ions follow the electric field from the high-voltage emitter wire to the grounded collector. ',
        'Notice how field lines concentrate near the sharp wire — this is what causes corona discharge.'
      ),

      // Controls
      React.createElement('div', { className: 'flex flex-wrap items-center gap-6 mb-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Voltage: ',
            React.createElement('span', { className: 'font-mono font-bold text-yellow-600' }, voltage + ' kV')
          ),
          React.createElement('input', {
            type: 'range', min: '5', max: '50', step: '1', value: voltage,
            onChange: function(e) { setVoltage(Number(e.target.value)); },
            className: 'w-48'
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'text-sm text-gray-600 block mb-1' },
            'Gap: ',
            React.createElement('span', { className: 'font-mono font-bold text-blue-600' }, Math.round(gapPx / 10) + ' mm')
          ),
          React.createElement('input', {
            type: 'range', min: '80', max: '280', step: '5', value: gapPx,
            onChange: function(e) { setGapPx(Number(e.target.value)); },
            className: 'w-48'
          })
        ),
        React.createElement('div', { className: 'flex flex-col gap-1' },
          React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
            React.createElement('input', { type: 'checkbox', checked: showField, onChange: function() { setShowField(!showField); } }),
            'Field vectors'
          ),
          React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
            React.createElement('input', { type: 'checkbox', checked: showPotential, onChange: function() { setShowPotential(!showPotential); } }),
            'Equipotentials'
          ),
          React.createElement('label', { className: 'text-sm text-gray-600 flex items-center gap-1' },
            React.createElement('input', { type: 'checkbox', checked: showTrajectories, onChange: function() { setShowTrajectories(!showTrajectories); } }),
            'Ion paths'
          )
        )
      ),

      React.createElement('div', { className: 'bg-gray-950 rounded-lg overflow-hidden mb-4' },
        React.createElement('canvas', {
          ref: canvasRef, width: W, height: H,
          className: 'w-full', style: { maxWidth: W + 'px', display: 'block' }
        })
      ),

      // Field strength callout
      React.createElement('div', { className: 'bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800' },
        React.createElement('span', { className: 'font-semibold' }, 'Corona threshold: '),
        'Air ionizes when the electric field exceeds ~3\u00d710\u2076 V/m. Near a 50\u03bcm wire, the field is amplified by a factor of ~ln(d/r) \u2248 ' +
        Math.log(gapPx / 0.5).toFixed(1) +
        ' compared to a parallel-plate capacitor. At ' + voltage + ' kV with ' + Math.round(gapPx/10) + ' mm gap, ',
        'the average field is ' + (voltage * 100 / gapPx).toFixed(0) + ' kV/cm; ',
        'near the wire it\u2019s orders of magnitude higher \u2014 well above the ionization threshold.'
      )
    )
  );
}
