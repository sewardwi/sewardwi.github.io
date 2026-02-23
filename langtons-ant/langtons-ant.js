const { useState, useRef, useEffect, useCallback } = React;

const GRID_SIZE = 101;
const CELL_SIZE = 6;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;

// Directions: 0=up, 1=right, 2=down, 3=left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function createInitialState() {
  return {
    grid: new Uint8Array(GRID_SIZE * GRID_SIZE),
    antX: Math.floor(GRID_SIZE / 2),
    antY: Math.floor(GRID_SIZE / 2),
    antDir: 0,
    steps: 0,
  };
}

function step(state) {
  const { grid, antX, antY, antDir } = state;
  const idx = antY * GRID_SIZE + antX;
  const isBlack = grid[idx];

  // Turn: white → right, black → left
  const newDir = isBlack ? (antDir + 3) % 4 : (antDir + 1) % 4;

  // Flip color
  grid[idx] = isBlack ? 0 : 1;

  // Move forward
  let newX = antX + DX[newDir];
  let newY = antY + DY[newDir];

  // Wrap around
  if (newX < 0) newX = GRID_SIZE - 1;
  if (newX >= GRID_SIZE) newX = 0;
  if (newY < 0) newY = GRID_SIZE - 1;
  if (newY >= GRID_SIZE) newY = 0;

  state.antX = newX;
  state.antY = newY;
  state.antDir = newDir;
  state.steps++;
}

function LangtonsAnt() {
  const canvasRef = useRef(null);
  const stateRef = useRef(createInitialState());
  const runningRef = useRef(false);
  const animFrameRef = useRef(null);
  const [steps, setSteps] = useState(0);
  const [running, setRunning] = useState(false);
  const [stepsPerFrame, setStepsPerFrame] = useState(10);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { grid, antX, antY } = stateRef.current;

    // Draw grid
    const imageData = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const isBlack = grid[y * GRID_SIZE + x];
        const color = isBlack ? 0 : 255;
        for (let dy = 0; dy < CELL_SIZE; dy++) {
          for (let dx = 0; dx < CELL_SIZE; dx++) {
            const px = x * CELL_SIZE + dx;
            const py = y * CELL_SIZE + dy;
            const i = (py * CANVAS_SIZE + px) * 4;
            data[i] = color;
            data[i + 1] = color;
            data[i + 2] = color;
            data[i + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw ant
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(antX * CELL_SIZE, antY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }, []);

  const tick = useCallback(() => {
    for (let i = 0; i < stepsPerFrame; i++) {
      step(stateRef.current);
    }
    setSteps(stateRef.current.steps);
    draw();
    if (runningRef.current) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, [draw, stepsPerFrame]);

  const handleStart = useCallback(() => {
    runningRef.current = true;
    setRunning(true);
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handleStop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  const handleReset = useCallback(() => {
    handleStop();
    stateRef.current = createInitialState();
    setSteps(0);
    draw();
  }, [handleStop, draw]);

  useEffect(() => {
    draw();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Langton's Ant</h1>
      <p className="text-gray-600 mb-6">
        A two-dimensional cellular automaton. The ant follows simple rules — turn right on white, turn left on black, flip the cell, move forward — yet produces complex emergent behavior.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={running ? handleStop : handleStart}
          className={`px-4 py-2 rounded font-medium text-white ${running ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 rounded font-medium text-white bg-red-500 hover:bg-red-600"
        >
          Reset
        </button>
        <span className="text-sm text-gray-500 ml-2">Steps: {steps.toLocaleString()}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-gray-600">Speed:</label>
        <input
          type="range"
          min="1"
          max="100"
          value={stepsPerFrame}
          onChange={(e) => setStepsPerFrame(parseInt(e.target.value))}
          className="w-48"
        />
        <span className="text-sm text-gray-500">{stepsPerFrame} steps/frame</span>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="border border-gray-300 rounded"
      />
    </div>
  );
}
