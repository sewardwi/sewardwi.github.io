const { useState, useMemo, Fragment } = React;

function BlochSphere() {
  const [theta, setTheta] = useState(Math.PI / 3);
  const [phi, setPhi] = useState(Math.PI / 4);

  const { alpha, betaReal, betaImag, betaMag, x, y, z } = useMemo(() => {
    const a = Math.cos(theta / 2);
    const bMag = Math.sin(theta / 2);
    const bReal = bMag * Math.cos(phi);
    const bImag = bMag * Math.sin(phi);
    return {
      alpha: a,
      betaReal: bReal,
      betaImag: bImag,
      betaMag: bMag,
      x: Math.sin(theta) * Math.cos(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(theta)
    };
  }, [theta, phi]);

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const r = 120;

  const format = (n) => n.toFixed(3);
  const formatComplex = (re, im) => {
    if (Math.abs(im) < 0.001) return format(re);
    const sign = im >= 0 ? '+' : '-';
    return `${format(re)} ${sign} ${format(Math.abs(im))}i`;
  };

  // 3D to 2D projection (isometric-ish)
  const project = (x3, y3, z3) => {
    const scale = 0.7;
    const px = cx + r * (x3 * 0.87 - y3 * 0.5) * scale;
    const py = cy - r * (z3 * 0.9 + x3 * 0.2 + y3 * 0.35) * scale;
    return { x: px, y: py };
  };

  const statePoint = project(x, y, z);
  const origin = project(0, 0, 0);

  // Axis endpoints
  const xAxis = { pos: project(1.3, 0, 0), neg: project(-1.3, 0, 0) };
  const yAxis = { pos: project(0, 1.3, 0), neg: project(0, -1.3, 0) };
  const zAxis = { pos: project(0, 0, 1.3), neg: project(0, 0, -1.3) };

  // Key states
  const state0 = project(0, 0, 1);
  const state1 = project(0, 0, -1);
  const statePlus = project(1, 0, 0);
  const stateMinus = project(-1, 0, 0);
  const statePlusI = project(0, 1, 0);
  const stateMinusI = project(0, -1, 0);

  // Generate circle points for equator and meridian
  const generateCircle = (thetaFunc, phiFunc, steps = 60) => {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const th = thetaFunc(t);
      const ph = phiFunc(t);
      const px = Math.sin(th) * Math.cos(ph);
      const py = Math.sin(th) * Math.sin(ph);
      const pz = Math.cos(th);
      const proj = project(px, py, pz);
      points.push(`${proj.x},${proj.y}`);
    }
    return points.join(' ');
  };

  const equator = generateCircle(() => Math.PI/2, t => t);
  const meridianXZ = generateCircle(t => t, () => 0);
  const meridianYZ = generateCircle(t => t, () => Math.PI/2);

  // Arc for theta angle visualization
  const thetaArc = useMemo(() => {
    const points = [];
    const steps = 30;
    const arcR = 0.3;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * theta;
      const px = arcR * Math.sin(t);
      const pz = arcR * Math.cos(t);
      const proj = project(px, 0, pz);
      points.push(`${proj.x},${proj.y}`);
    }
    return points.join(' ');
  }, [theta]);

  // Arc for phi angle visualization (on equator plane)
  const phiArc = useMemo(() => {
    const points = [];
    const steps = 30;
    const arcR = 0.4;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * phi;
      const px = arcR * Math.cos(t);
      const py = arcR * Math.sin(t);
      const proj = project(px, py, 0);
      points.push(`${proj.x},${proj.y}`);
    }
    return points.join(' ');
  }, [phi]);

  // Projection onto XY plane
  const xyProj = project(x, y, 0);

  return (
    <div className="py-6">
      <h2 className="text-2xl font-bold mb-1 text-center">Bloch Sphere Representation</h2>
      <p className="text-gray-600 text-center text-sm mb-4">
        |ψ⟩ = cos(θ/2)|0⟩ + e<sup>iφ</sup>sin(θ/2)|1⟩
      </p>

      <div className="flex flex-col lg:flex-row gap-4 items-center justify-center">
        {/* Bloch Sphere */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <svg width={size} height={size} className="bg-gray-50 rounded">
            {/* Back meridians (behind sphere) */}
            <polyline points={meridianXZ} fill="none" stroke="#d1d5db" strokeWidth="1" opacity="0.8"/>
            <polyline points={meridianYZ} fill="none" stroke="#d1d5db" strokeWidth="1" opacity="0.8"/>

            {/* Equator */}
            <polyline points={equator} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4,3"/>

            {/* Axes */}
            <line x1={xAxis.neg.x} y1={xAxis.neg.y} x2={xAxis.pos.x} y2={xAxis.pos.y} stroke="#dc2626" strokeWidth="1.5" opacity="0.8"/>
            <line x1={yAxis.neg.x} y1={yAxis.neg.y} x2={yAxis.pos.x} y2={yAxis.pos.y} stroke="#16a34a" strokeWidth="1.5" opacity="0.8"/>
            <line x1={zAxis.neg.x} y1={zAxis.neg.y} x2={zAxis.pos.x} y2={zAxis.pos.y} stroke="#2563eb" strokeWidth="1.5" opacity="0.8"/>

            {/* Axis labels */}
            <text x={xAxis.pos.x + 5} y={xAxis.pos.y} fill="#dc2626" fontSize="12" fontWeight="bold">X</text>
            <text x={yAxis.pos.x + 5} y={yAxis.pos.y} fill="#16a34a" fontSize="12" fontWeight="bold">Y</text>
            <text x={zAxis.pos.x + 5} y={zAxis.pos.y - 5} fill="#2563eb" fontSize="12" fontWeight="bold">Z</text>

            {/* Key states */}
            <circle cx={state0.x} cy={state0.y} r="5" fill="#2563eb"/>
            <text x={state0.x + 10} y={state0.y + 4} fill="#2563eb" fontSize="11">|0⟩</text>

            <circle cx={state1.x} cy={state1.y} r="5" fill="#2563eb"/>
            <text x={state1.x + 10} y={state1.y + 4} fill="#2563eb" fontSize="11">|1⟩</text>

            <circle cx={statePlus.x} cy={statePlus.y} r="4" fill="#dc2626" opacity="0.8"/>
            <text x={statePlus.x + 8} y={statePlus.y + 4} fill="#dc2626" fontSize="10">|+⟩</text>

            <circle cx={stateMinus.x} cy={stateMinus.y} r="4" fill="#dc2626" opacity="0.8"/>
            <text x={stateMinus.x - 20} y={stateMinus.y + 4} fill="#dc2626" fontSize="10">|-⟩</text>

            <circle cx={statePlusI.x} cy={statePlusI.y} r="4" fill="#16a34a" opacity="0.8"/>
            <text x={statePlusI.x + 8} y={statePlusI.y + 4} fill="#16a34a" fontSize="10">|+i⟩</text>

            <circle cx={stateMinusI.x} cy={stateMinusI.y} r="4" fill="#16a34a" opacity="0.8"/>
            <text x={stateMinusI.x - 22} y={stateMinusI.y + 4} fill="#16a34a" fontSize="10">|-i⟩</text>

            {/* Theta arc */}
            <polyline points={thetaArc} fill="none" stroke="#d97706" strokeWidth="2"/>

            {/* Phi arc */}
            <polyline points={phiArc} fill="none" stroke="#9333ea" strokeWidth="2"/>

            {/* Projection line to XY plane */}
            <line x1={statePoint.x} y1={statePoint.y} x2={xyProj.x} y2={xyProj.y} stroke="#6b7280" strokeWidth="1" strokeDasharray="3,3"/>
            <circle cx={xyProj.x} cy={xyProj.y} r="3" fill="#6b7280"/>

            {/* State vector */}
            <line x1={origin.x} y1={origin.y} x2={statePoint.x} y2={statePoint.y} stroke="#db2777" strokeWidth="3"/>
            <circle cx={statePoint.x} cy={statePoint.y} r="8" fill="#db2777" stroke="#1f2937" strokeWidth="2"/>

            {/* Angle labels */}
            <text x={origin.x + 15} y={origin.y - 30} fill="#d97706" fontSize="11" fontWeight="bold">θ</text>
            <text x={origin.x + 35} y={origin.y + 10} fill="#9333ea" fontSize="11" fontWeight="bold">φ</text>
          </svg>
        </div>

        {/* Info panels */}
        <div className="flex flex-col gap-3">
          {/* State vector */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Bloch Parametrization</h3>
            <div className="font-mono text-sm bg-gray-50 border border-gray-200 p-3 rounded mb-3 space-y-1">
              <div><span className="text-gray-600">|ψ⟩ = </span><span className="text-blue-600">cos(θ/2)</span><span className="text-gray-900">|0⟩ + </span><span className="text-pink-600">e<sup>iφ</sup>sin(θ/2)</span><span className="text-gray-900">|1⟩</span></div>
              <div className="border-t border-gray-200 pt-2 mt-2">
                <span className="text-gray-600">α = </span><span className="text-blue-600">{format(alpha)}</span>
              </div>
              <div>
                <span className="text-gray-600">β = </span><span className="text-pink-600">{formatComplex(betaReal, betaImag)}</span>
              </div>
            </div>

            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">|α|² = cos²(θ/2) =</span>
                <span className="text-blue-600 font-mono">{format(alpha * alpha)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">|β|² = sin²(θ/2) =</span>
                <span className="text-pink-600 font-mono">{format(betaMag * betaMag)}</span>
              </div>
            </div>
          </div>

          {/* Bloch vector */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Bloch Vector (x, y, z)</h3>
            <div className="font-mono text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-red-600">x = sin(θ)cos(φ) =</span>
                <span className="text-red-600">{format(x)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">y = sin(θ)sin(φ) =</span>
                <span className="text-green-600">{format(y)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">z = cos(θ) =</span>
                <span className="text-blue-600">{format(z)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1">
                <span className="text-gray-600">|r|² = x² + y² + z² =</span>
                <span className="text-green-600">{format(x*x + y*y + z*z)} ✓</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-700">Angles</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-yellow-700">θ (polar) = {format(theta)} rad = {format(theta * 180 / Math.PI)}°</label>
                <input
                  type="range" min="0" max={Math.PI} step="0.01" value={theta}
                  onChange={(e) => setTheta(parseFloat(e.target.value))}
                  className="w-full accent-yellow-500"
                />
                <p className="text-xs text-gray-500">θ = 0 → |0⟩, θ = π → |1⟩</p>
              </div>
              <div>
                <label className="text-sm text-purple-700">φ (azimuthal) = {format(phi)} rad = {format(phi * 180 / Math.PI)}°</label>
                <input
                  type="range" min="0" max={2 * Math.PI} step="0.01" value={phi}
                  onChange={(e) => setPhi(parseFloat(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <p className="text-xs text-gray-500">φ = 0 → |+⟩, φ = π → |-⟩</p>
              </div>
            </div>
          </div>

          {/* Special states */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Special States</h3>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <button onClick={() => {setTheta(0); setPhi(0);}} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 rounded p-1.5">|0⟩</button>
              <button onClick={() => {setTheta(Math.PI); setPhi(0);}} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 rounded p-1.5">|1⟩</button>
              <button onClick={() => {setTheta(Math.PI/2); setPhi(0);}} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 rounded p-1.5">|+⟩</button>
              <button onClick={() => {setTheta(Math.PI/2); setPhi(Math.PI);}} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 rounded p-1.5">|-⟩</button>
              <button onClick={() => {setTheta(Math.PI/2); setPhi(Math.PI/2);}} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 rounded p-1.5">|+i⟩</button>
              <button onClick={() => {setTheta(Math.PI/2); setPhi(3*Math.PI/2);}} className="bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-800 rounded p-1.5">|-i⟩</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
