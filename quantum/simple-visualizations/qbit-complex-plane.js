const { useState, useMemo, Fragment } = React;

function QubitVisualization() {
  const [alphaMag, setAlphaMag] = useState(0.8);
  const [alphaPhase, setAlphaPhase] = useState(Math.PI / 6);
  const [betaPhase, setBetaPhase] = useState(Math.PI / 3);
  
  const { alphaReal, alphaImag, betaMag, betaReal, betaImag } = useMemo(() => {
    const bMag = Math.sqrt(1 - alphaMag * alphaMag);
    return {
      alphaReal: alphaMag * Math.cos(alphaPhase),
      alphaImag: alphaMag * Math.sin(alphaPhase),
      betaMag: bMag,
      betaReal: bMag * Math.cos(betaPhase),
      betaImag: bMag * Math.sin(betaPhase)
    };
  }, [alphaMag, alphaPhase, betaPhase]);

  const width = 260;
  const height = 260;
  const scale = 90;

  const format = (n) => n.toFixed(3);
  const formatComplex = (re, im) => {
    const sign = im >= 0 ? '+' : '-';
    return `${format(re)} ${sign} ${format(Math.abs(im))}i`;
  };

  const ComplexPlane = ({ real, imag, color, label, magnitude }) => {
    const cx = width / 2;
    const cy = height / 2;
    return (
      <svg width={width} height={height} className="bg-gray-950 rounded">
        {/* Grid */}
        {[-2, -1, 0, 1, 2].map(i => (
          <React.Fragment key={i}>
            <line x1={cx + i * scale/2} y1={0} x2={cx + i * scale/2} y2={height} stroke="#374151" strokeWidth="1"/>
            <line x1={0} y1={cy + i * scale/2} x2={width} y2={cy + i * scale/2} stroke="#374151" strokeWidth="1"/>
          </React.Fragment>
        ))}
        
        {/* Axes */}
        <line x1={0} y1={cy} x2={width} y2={cy} stroke="#6b7280" strokeWidth="2"/>
        <line x1={cx} y1={0} x2={cx} y2={height} stroke="#6b7280" strokeWidth="2"/>
        
        {/* Unit circle */}
        <circle cx={cx} cy={cy} r={scale} fill="none" stroke="#4b5563" strokeWidth="1" strokeDasharray="4,4"/>
        
        {/* Magnitude circle */}
        <circle cx={cx} cy={cy} r={magnitude * scale} fill="none" stroke={color} strokeWidth="1" opacity="0.4"/>
        
        {/* Vector */}
        <line x1={cx} y1={cy} x2={cx + real * scale} y2={cy - imag * scale} stroke={color} strokeWidth="3"/>
        <circle cx={cx + real * scale} cy={cy - imag * scale} r="6" fill={color}/>
        
        {/* Labels */}
        <text x={width - 25} y={cy - 10} fill="#9ca3af" fontSize="12">Re</text>
        <text x={cx + 10} y={20} fill="#9ca3af" fontSize="12">Im</text>
        <text x={cx + scale - 5} y={cy + 15} fill="#6b7280" fontSize="10">1</text>
        
        {/* Component label */}
        <text x={15} y={25} fill={color} fontSize="16" fontWeight="bold">{label}</text>
        <text x={15} y={45} fill={color} fontSize="11">{formatComplex(real, imag)}</text>
        <text x={15} y={62} fill="#9ca3af" fontSize="10">|{label}| = {format(magnitude)}</text>
      </svg>
    );
  };

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <h2 className="text-xl font-bold mb-1 text-center">Qubit in ℂ² — Both Amplitudes Complex</h2>
      <p className="text-gray-400 text-center text-sm mb-4">
        |ψ⟩ = α|0⟩ + β|1⟩ where α, β ∈ ℂ and |α|² + |β|² = 1
      </p>
      
      <div className="flex flex-col items-center gap-4">
        {/* Two complex planes side by side */}
        <div className="flex gap-4 flex-wrap justify-center">
          <div className="bg-gray-800 rounded-lg p-3">
            <ComplexPlane real={alphaReal} imag={alphaImag} color="#60a5fa" label="α" magnitude={alphaMag}/>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <ComplexPlane real={betaReal} imag={betaImag} color="#f472b6" label="β" magnitude={betaMag}/>
          </div>
        </div>
        
        {/* State info */}
        <div className="flex gap-4 flex-wrap justify-center">
          <div className="bg-gray-800 rounded-lg p-4 min-w-64">
            <h3 className="text-sm font-semibold mb-2 text-gray-300">State Vector</h3>
            <div className="font-mono text-base bg-gray-950 p-3 rounded mb-3">
              <span className="text-white">|ψ⟩ = (</span>
              <span className="text-blue-400">{formatComplex(alphaReal, alphaImag)}</span>
              <span className="text-white">)|0⟩</span>
              <br/>
              <span className="text-white ml-8">+ (</span>
              <span className="text-pink-400">{formatComplex(betaReal, betaImag)}</span>
              <span className="text-white">)|1⟩</span>
            </div>
            
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">|α|² =</span>
                <span className="text-blue-400 font-mono">{format(alphaMag * alphaMag)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">|β|² =</span>
                <span className="text-pink-400 font-mono">{format(betaMag * betaMag)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-1">
                <span className="text-gray-400">|α|² + |β|² =</span>
                <span className="text-green-400 font-mono">1.000 ✓</span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 min-w-64">
            <h3 className="text-sm font-semibold mb-2 text-gray-300">Phase Information</h3>
            <div className="text-sm space-y-2 mb-3">
              <div className="flex justify-between">
                <span className="text-gray-400">arg(α) =</span>
                <span className="text-blue-400 font-mono">{format(alphaPhase)} rad</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">arg(β) =</span>
                <span className="text-pink-400 font-mono">{format(betaPhase)} rad</span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-1">
                <span className="text-gray-400">Relative phase =</span>
                <span className="text-purple-400 font-mono">{format(betaPhase - alphaPhase)} rad</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">Only the relative phase (arg(β) - arg(α)) is physically observable. Global phase can be absorbed.</p>
          </div>
        </div>
        
        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-4 w-full max-w-xl">
          <h3 className="text-sm font-semibold mb-3 text-gray-300">Controls</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-400">|α| = {format(alphaMag)}</label>
              <input 
                type="range" min="0" max="1" step="0.01" value={alphaMag}
                onChange={(e) => setAlphaMag(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
              <p className="text-xs text-gray-500">|β| auto-adjusts to maintain normalization</p>
            </div>
            <div>
              <label className="text-sm text-gray-400">arg(α) = {format(alphaPhase)} rad</label>
              <input 
                type="range" min="0" max={2 * Math.PI} step="0.01" value={alphaPhase}
                onChange={(e) => setAlphaPhase(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">arg(β) = {format(betaPhase)} rad</label>
              <input 
                type="range" min="0" max={2 * Math.PI} step="0.01" value={betaPhase}
                onChange={(e) => setBetaPhase(parseFloat(e.target.value))}
                className="w-full accent-pink-500"
              />
            </div>
          </div>
        </div>
        
        {/* Mathematical note */}
        <div className="bg-gray-800 rounded-lg p-4 w-full max-w-xl">
          <h3 className="text-sm font-semibold mb-2 text-gray-300">Why We Often Write α as Real</h3>
          <p className="text-sm text-gray-400">
            Mathematically, α ∈ ℂ. But since |ψ⟩ and e<sup>iγ</sup>|ψ⟩ are physically indistinguishable, 
            we can factor out α's phase: |ψ⟩ = e<sup>i·arg(α)</sup>(|α||0⟩ + |β|e<sup>i(arg(β)-arg(α))</sup>|1⟩). 
            The global phase e<sup>i·arg(α)</sup> is unobservable, so we conventionally set α ∈ ℝ⁺.
          </p>
        </div>
      </div>
    </div>
  );
}