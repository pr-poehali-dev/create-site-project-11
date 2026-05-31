import { useEffect, useRef, useState, useCallback } from "react";

type Scene = "solar" | "flying" | "darkness" | "message" | "meteor" | "unknown";
type GamePhase = "idle" | "countdown" | "wave_break" | "playing" | "gameover";

interface Star { x: number; y: number; r: number; opacity: number; speed: number; twinkleOffset: number; }
interface Planet { radius: number; color: string; orbitRadius: number; angle: number; speed: number; glowColor: string; moons?: Moon[]; noteFreq: number; noteType: OscillatorType; alive: boolean; }
interface Moon { orbitRadius: number; angle: number; speed: number; radius: number; color: string; }
interface BgMeteor { x: number; y: number; vx: number; vy: number; len: number; opacity: number; active: boolean; }
interface ImpactMeteor { x: number; y: number; scale: number; progress: number; }
interface Crack { ax: number; ay: number; bx: number; by: number; }
interface GameMeteor {
  id: number; x: number; y: number; vx: number; vy: number; r: number;
  alive: boolean; rot: number; rotSpeed: number; craters: { cx: number; cy: number; r: number }[];
  shards?: Shard[];
}
interface Shard { x: number; y: number; vx: number; vy: number; r: number; opacity: number; life: number; rot: number; rotSpeed: number; color: string; }

const PLANET_CONFIGS = [
  { orbitR: 80,  r: 8,  color: "#b5a9ff", glow: "#7c6fff", speed: 0.008,  freq: 261.6, type: "sine"     as OscillatorType },
  { orbitR: 130, r: 14, color: "#9b59b6", glow: "#6c3483", speed: 0.005,  freq: 329.6, type: "triangle" as OscillatorType },
  { orbitR: 190, r: 11, color: "#8e44ad", glow: "#4a235a", speed: 0.003,  freq: 196.0, type: "sine"     as OscillatorType },
  { orbitR: 260, r: 18, color: "#5b2c8d", glow: "#2e1065", speed: 0.002,  freq: 130.8, type: "triangle" as OscillatorType },
  { orbitR: 340, r: 9,  color: "#d7bde2", glow: "#9b59b6", speed: 0.0015, freq: 440.0, type: "sine"     as OscillatorType },
  { orbitR: 420, r: 7,  color: "#7d3c98", glow: "#4a235a", speed: 0.001,  freq: 523.3, type: "triangle" as OscillatorType },
];

const UNKNOWN_CONFIGS = [
  { orbitR: 90,  r: 12, color: "#1a0a2e", glow: "#7c3aed", speed: 0.004, freq: 174.6, type: "sine"     as OscillatorType },
  { orbitR: 160, r: 7,  color: "#2d1b69", glow: "#a855f7", speed: 0.006, freq: 220.0, type: "triangle" as OscillatorType },
  { orbitR: 230, r: 20, color: "#0f0a1e", glow: "#6d28d9", speed: 0.002, freq: 87.3,  type: "sine"     as OscillatorType },
  { orbitR: 310, r: 10, color: "#3b1f7a", glow: "#c084fc", speed: 0.003, freq: 349.2, type: "triangle" as OscillatorType },
  { orbitR: 390, r: 6,  color: "#1e1047", glow: "#8b5cf6", speed: 0.005, freq: 659.3, type: "sine"     as OscillatorType },
];

const MILESTONES: Record<number, string> = {
  10: "хахах как так",
  20: "ого ты развиваешься",
  30: "имба",
  40: "ого это было хорошо",
  50: "я верю в тебя — пробуй ещё раз",
  60: "это тебе уже в киберспорт",
  70: "умничка",
  80: "большая умничка",
  90: "серьёзная цифра, но не говори что ты не попробуешь ещё раз",
  100: "ты большая умничка 💜 желаю тебе точно так же побеждать и проходить все этапы на 100%",
};

const TOTAL_WAVES = 10;
const PER_WAVE = 10;
const TOTAL_METEORS = TOTAL_WAVES * PER_WAVE;

function makeStars(n: number, w: number, h: number): Star[] {
  return Array.from({ length: n }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    r: Math.random() * 1.8 + 0.2,
    opacity: Math.random() * 0.6 + 0.4,
    speed: Math.random() * 0.3 + 0.1,
    twinkleOffset: Math.random() * Math.PI * 2,
  }));
}

function makePlanets(cx: number, cy: number): Planet[] {
  return PLANET_CONFIGS.map((c, i) => ({
    radius: c.r, color: c.color, orbitRadius: c.orbitR,
    angle: (i / PLANET_CONFIGS.length) * Math.PI * 2,
    speed: c.speed, glowColor: c.glow,
    noteFreq: c.freq, noteType: c.type, alive: true,
    moons: i === 3 ? [
      { orbitRadius: 28, angle: 0, speed: 0.02, radius: 4, color: "#c39bd3" },
      { orbitRadius: 40, angle: Math.PI, speed: 0.012, radius: 3, color: "#a569bd" },
    ] : undefined,
  }));
}

function makeUnknownPlanets(): Planet[] {
  return UNKNOWN_CONFIGS.map((c, i) => ({
    radius: c.r, color: c.color, orbitRadius: c.orbitR,
    angle: (i / UNKNOWN_CONFIGS.length) * Math.PI * 2,
    speed: c.speed, glowColor: c.glow,
    noteFreq: c.freq, noteType: c.type, alive: true,
    moons: i === 2 ? [{ orbitRadius: 35, angle: 1, speed: 0.015, radius: 5, color: "#7c3aed" }] : undefined,
  }));
}

function makeGameMeteor(id: number, h: number): GameMeteor {
  const speed = 1.2 + Math.random() * 1.4;
  const r = 22 + Math.random() * 14;
  const craterCount = 2 + Math.floor(Math.random() * 3);
  return {
    id, x: -r - 10, y: 60 + Math.random() * (h - 120),
    vx: speed, vy: (Math.random() - 0.4) * 0.8,
    r, alive: true, rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.02,
    craters: Array.from({ length: craterCount }, () => ({
      cx: (Math.random() - 0.5) * r * 1.2,
      cy: (Math.random() - 0.5) * r * 1.2,
      r: r * (0.12 + Math.random() * 0.2),
    })),
  };
}

function getAudioCtx(): AudioContext {
  const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new A();
}

function startAmbient(ctx: AudioContext): () => void {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
  master.connect(ctx.destination);
  const nodes: OscillatorNode[] = [];
  [55, 82.4, 110, 146.8, 196].forEach((freq, i) => {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    const delay = ctx.createDelay(2); const dg = ctx.createGain();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = freq; delay.delayTime.value = 0.8 + i * 0.3;
    dg.gain.value = 0.3; gain.gain.value = 0.04 / (i + 1);
    osc.connect(gain); gain.connect(master);
    gain.connect(delay); delay.connect(dg); dg.connect(master);
    osc.start(); nodes.push(osc);
  });
  return () => nodes.forEach(n => { try { n.stop(); n.disconnect(); } catch (_e) { void _e; } });
}

function playClick(ctx: AudioContext) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
}

function playSunSound(ctx: AudioContext) {
  const dur = 3.5;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 0.15);
  master.gain.setValueAtTime(0.55, ctx.currentTime + dur - 0.8);
  master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  master.connect(ctx.destination);
  const base = ctx.createOscillator(); const baseGain = ctx.createGain();
  base.type = "sawtooth"; base.frequency.setValueAtTime(36.7, ctx.currentTime);
  base.frequency.linearRampToValueAtTime(32, ctx.currentTime + dur); baseGain.gain.value = 0.4;
  base.connect(baseGain); baseGain.connect(master); base.start(ctx.currentTime); base.stop(ctx.currentTime + dur);
  const shimmer = ctx.createOscillator(); const shimGain = ctx.createGain();
  shimmer.type = "sine"; shimmer.frequency.setValueAtTime(146.8, ctx.currentTime);
  shimmer.frequency.linearRampToValueAtTime(110, ctx.currentTime + dur); shimGain.gain.value = 0.25;
  shimmer.connect(shimGain); shimGain.connect(master); shimmer.start(ctx.currentTime); shimmer.stop(ctx.currentTime + dur);
  const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
  lfo.type = "sine"; lfo.frequency.value = 3.2; lfoGain.gain.value = 18;
  lfo.connect(lfoGain); lfoGain.connect(shimmer.frequency); lfo.start(ctx.currentTime); lfo.stop(ctx.currentTime + dur);
  const crown = ctx.createOscillator(); const crownGain = ctx.createGain();
  crown.type = "sine"; crown.frequency.setValueAtTime(440, ctx.currentTime);
  crown.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur * 0.7);
  crownGain.gain.setValueAtTime(0.12, ctx.currentTime);
  crownGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 0.7);
  crown.connect(crownGain); crownGain.connect(master); crown.start(ctx.currentTime); crown.stop(ctx.currentTime + dur * 0.7);
  const delay = ctx.createDelay(1.0); const delayFb = ctx.createGain(); const delayOut = ctx.createGain();
  delay.delayTime.value = 0.6; delayFb.gain.value = 0.45; delayOut.gain.value = 0.3;
  master.connect(delay); delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayOut); delayOut.connect(ctx.destination);
}

function playPlanetSound(ctx: AudioContext, freq: number, type: OscillatorType) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  const reverb = ctx.createDelay(0.5); const reverbGain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.8);
  gain.gain.setValueAtTime(0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
  reverb.delayTime.value = 0.3; reverbGain.gain.value = 0.4;
  osc.connect(gain); gain.connect(ctx.destination);
  gain.connect(reverb); reverb.connect(reverbGain); reverbGain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1);
  const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
  osc2.type = "sine"; osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime);
  g2.gain.setValueAtTime(0.1, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc2.connect(g2); g2.connect(ctx.destination); osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.5);
}

function playCountdownBeep(ctx: AudioContext, num: number) {
  const freqs: Record<number, number> = { 10:200,9:240,8:280,7:320,6:360,5:400,4:500,3:600,2:720,1:900 };
  const types: Record<number, OscillatorType> = { 10:"sawtooth",9:"triangle",8:"sine",7:"square",6:"triangle",5:"sine",4:"sawtooth",3:"triangle",2:"sine",1:"sine" };
  const freq = freqs[num] ?? 440; const type = types[num] ?? "sine";
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (num <= 3) osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.45, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (num === 1 ? 0.6 : 0.3));
  osc.connect(gain); gain.connect(ctx.destination); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
  if (num <= 3) {
    const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
    osc2.type = "sine"; osc2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(0.2, ctx.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.connect(g2); g2.connect(ctx.destination); osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.4);
  }
}

function playMeteorHit(ctx: AudioContext) {
  // Удар + разлёт камня
  const now = ctx.currentTime;
  // Низкий глухой удар
  const impact = ctx.createOscillator(); const impactGain = ctx.createGain();
  impact.type = "sine"; impact.frequency.setValueAtTime(180, now);
  impact.frequency.exponentialRampToValueAtTime(40, now + 0.18);
  impactGain.gain.setValueAtTime(0.7, now); impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  impact.connect(impactGain); impactGain.connect(ctx.destination);
  impact.start(now); impact.stop(now + 0.22);
  // Хруст/треск камня
  const crunch = ctx.createOscillator(); const crunchGain = ctx.createGain();
  crunch.type = "sawtooth"; crunch.frequency.setValueAtTime(320, now + 0.02);
  crunch.frequency.exponentialRampToValueAtTime(80, now + 0.25);
  crunchGain.gain.setValueAtTime(0.4, now + 0.02); crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  crunch.connect(crunchGain); crunchGain.connect(ctx.destination); crunch.start(now + 0.02); crunch.stop(now + 0.3);
  // Шипение осколков — белый шум через filter
  const bufSize = ctx.sampleRate * 0.35;
  const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = "bandpass"; noiseFilter.frequency.value = 2200; noiseFilter.Q.value = 0.8;
  const noiseGain = ctx.createGain(); noiseGain.gain.setValueAtTime(0.25, now + 0.05); noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ctx.destination); noise.start(now + 0.05);
  // Высокий звон отлетающих кусков
  const ping = ctx.createOscillator(); const pingGain = ctx.createGain();
  ping.type = "triangle"; ping.frequency.setValueAtTime(880 + Math.random() * 400, now + 0.05);
  ping.frequency.exponentialRampToValueAtTime(220, now + 0.5);
  pingGain.gain.setValueAtTime(0.18, now + 0.05); pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  ping.connect(pingGain); pingGain.connect(ctx.destination); ping.start(now + 0.05); ping.stop(now + 0.5);
}

function playDamage(ctx: AudioContext) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = "square"; osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
  gain.gain.setValueAtTime(0.6, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + 0.4);
}

// =========================================================

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene>("solar");
  const [scene, setScene] = useState<Scene>("solar");
  const [showBtn1, setShowBtn1] = useState(true);
  const [showBtn2, setShowBtn2] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [msgOpacity, setMsgOpacity] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const stopAmbientRef = useRef<(() => void) | null>(null);
  const animRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const unknownPlanetsRef = useRef<Planet[]>([]);
  const flyProgressRef = useRef(0);
  const darknessTimerRef = useRef(0);
  const meteorBigRef = useRef({ progress: 0 });
  const impactMeteorRef = useRef<ImpactMeteor>({ x: 0, y: 0, scale: 0.01, progress: 0 });
  const bgMeteorsRef = useRef<BgMeteor[]>([]);
  const timeRef = useRef(0);
  const audioStartedRef = useRef(false);

  // GAME STATE
  const [gamePhase, setGamePhase] = useState<GamePhase>("idle");
  const [countdown, setCountdown] = useState(10);
  const [waveNumber, setWaveNumber] = useState(1);
  const [waveBreakTimer, setWaveBreakTimer] = useState(3);
  const [lives, setLives] = useState(3);
  const [progress, setProgress] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [finalMilestone, setFinalMilestone] = useState<string | null>(null);

  const gamePhaseRef = useRef<GamePhase>("idle");
  const livesRef = useRef(3);
  const progressRef = useRef(0);
  const waveNumberRef = useRef(1);
  const waveDestroyedRef = useRef(0); // уничтожено в текущей волне
  const totalDestroyedRef = useRef(0);
  const gameMeteorsRef = useRef<GameMeteor[]>([]);
  const meteorIdRef = useRef(0);
  const waveSpawnedRef = useRef(0);
  const spawnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveBreakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function getAudio(): AudioContext {
    if (!audioRef.current) {
      audioRef.current = getAudioCtx();
      if (!audioStartedRef.current) {
        audioStartedRef.current = true;
        stopAmbientRef.current = startAmbient(audioRef.current);
      }
    }
    return audioRef.current;
  }

  function clearAllTimers() {
    if (spawnTimerRef.current) { clearInterval(spawnTimerRef.current); spawnTimerRef.current = null; }
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    if (waveBreakTimerRef.current) { clearInterval(waveBreakTimerRef.current); waveBreakTimerRef.current = null; }
  }

  function endGame() {
    clearAllTimers();
    gamePhaseRef.current = "gameover";
    setGamePhase("gameover");
    setGameOver(true);
    const pct = progressRef.current;
    const keys = [100,90,80,70,60,50,40,30,20,10];
    const key = keys.find(k => pct >= k) ?? 0;
    setFinalMilestone(key > 0 ? (MILESTONES[key] ?? null) : null);
  }

  function spawnWave(wave: number, h: number) {
    waveSpawnedRef.current = 0;
    waveDestroyedRef.current = 0;
    let spawned = 0;
    spawnTimerRef.current = setInterval(() => {
      if (gamePhaseRef.current !== "playing") { clearInterval(spawnTimerRef.current!); return; }
      if (spawned >= PER_WAVE) { clearInterval(spawnTimerRef.current!); return; }
      const count = Math.random() > 0.65 ? 2 : 1;
      for (let i = 0; i < count && spawned < PER_WAVE; i++) {
        gameMeteorsRef.current.push(makeGameMeteor(meteorIdRef.current++, h));
        spawned++;
        waveSpawnedRef.current++;
      }
    }, 600 + Math.random() * 500);
  }

  function startWaveBreak(nextWave: number) {
    clearAllTimers();
    gamePhaseRef.current = "wave_break";
    setGamePhase("wave_break");
    setWaveNumber(nextWave);
    waveNumberRef.current = nextWave;
    let t = 3;
    setWaveBreakTimer(t);
    waveBreakTimerRef.current = setInterval(() => {
      t--;
      setWaveBreakTimer(t);
      if (t <= 0) {
        clearInterval(waveBreakTimerRef.current!);
        gamePhaseRef.current = "playing";
        setGamePhase("playing");
        const h = canvasRef.current?.height ?? window.innerHeight;
        spawnWave(nextWave, h);
      }
    }, 1000);
  }

  function startCountdown() {
    const audio = getAudio();
    gamePhaseRef.current = "countdown";
    setGamePhase("countdown");
    setCountdown(10);
    let n = 10;
    playCountdownBeep(audio, n);
    countdownTimerRef.current = setInterval(() => {
      n--;
      setCountdown(n);
      if (n > 0) playCountdownBeep(audio, n);
      if (n <= 0) {
        clearInterval(countdownTimerRef.current!);
        // начинаем волну 1 сразу (без wave_break экрана)
        gamePhaseRef.current = "playing";
        setGamePhase("playing");
        waveNumberRef.current = 1;
        setWaveNumber(1);
        const h = canvasRef.current?.height ?? window.innerHeight;
        spawnWave(1, h);
      }
    }, 1000);
  }

  function startExperiment() {
    clearAllTimers();
    gameMeteorsRef.current = [];
    totalDestroyedRef.current = 0;
    waveDestroyedRef.current = 0;
    waveSpawnedRef.current = 0;
    meteorIdRef.current = 0;
    progressRef.current = 0;
    livesRef.current = 3;
    waveNumberRef.current = 1;
    setLives(3);
    setProgress(0);
    setWaveNumber(1);
    setGameOver(false);
    setFinalMilestone(null);
    setShowBtn2(false);
    unknownPlanetsRef.current = makeUnknownPlanets();
    startCountdown();
  }

  function handleRestartGame() {
    startExperiment();
  }

  function handleBackToUniverse() {
    clearAllTimers();
    gameMeteorsRef.current = [];
    gamePhaseRef.current = "idle";
    setGamePhase("idle");
    setGameOver(false);
    setFinalMilestone(null);
    setShowBtn2(true);
    unknownPlanetsRef.current = makeUnknownPlanets();
  }

  // Проверяем: вся волна уничтожена (все 10 убиты или пролетели)?
  function checkWaveComplete() {
    const wave = waveNumberRef.current;
    if (waveDestroyedRef.current >= PER_WAVE) {
      if (wave >= TOTAL_WAVES) {
        endGame();
      } else {
        startWaveBreak(wave + 1);
      }
    }
  }

  const handleGameMeteorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (gamePhaseRef.current !== "playing") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const audio = audioRef.current ?? getAudio();

    gameMeteorsRef.current.forEach(m => {
      if (!m.alive) return;
      const dist = Math.sqrt((mx - m.x) ** 2 + (my - m.y) ** 2);
      if (dist < m.r + 10) {
        m.alive = false;
        playMeteorHit(audio);
        // Реалистичные осколки: разные размеры, разные цвета камня, вращение
        const shardCount = 10 + Math.floor(Math.random() * 8);
        const stoneColors = ["#8b7355","#6b5b45","#a0917a","#c4b49a","#7a6b52","#5a4a35","#b0a090"];
        m.shards = Array.from({ length: shardCount }, (_, si) => {
          const angle = (si / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
          const speed = 2 + Math.random() * 5;
          return {
            x: m.x + (Math.random() - 0.5) * m.r,
            y: m.y + (Math.random() - 0.5) * m.r,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - Math.random() * 2,
            r: m.r * (0.08 + Math.random() * 0.25),
            opacity: 1, life: 1,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.25,
            color: stoneColors[Math.floor(Math.random() * stoneColors.length)],
          };
        });
        totalDestroyedRef.current++;
        waveDestroyedRef.current++;
        const pct = Math.min(Math.round((totalDestroyedRef.current / TOTAL_METEORS) * 100), 100);
        progressRef.current = pct;
        setProgress(pct);
        checkWaveComplete();
      }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let w = canvas.width, h = canvas.height;
    let cx = w / 2, cy = h / 2;

    starsRef.current = makeStars(300, w, h);
    planetsRef.current = makePlanets(cx, cy);
    unknownPlanetsRef.current = makeUnknownPlanets();
    impactMeteorRef.current = { x: w * 0.65, y: h * 0.2, scale: 0.01, progress: 0 };

    function spawnBgMeteor(): BgMeteor {
      const side = Math.random() > 0.5 ? 0 : 1;
      return {
        x: side === 0 ? -50 : w + 50, y: Math.random() * h * 0.7,
        vx: side === 0 ? (1.5 + Math.random() * 3) : -(1.5 + Math.random() * 3),
        vy: 0.5 + Math.random() * 1.5, len: 50 + Math.random() * 100,
        opacity: 0.5 + Math.random() * 0.5, active: Math.random() > 0.6,
      };
    }
    bgMeteorsRef.current = Array.from({ length: 8 }, spawnBgMeteor);

    const handleResize = () => {
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;
      w = canvas.width; h = canvas.height; cx = w / 2; cy = h / 2;
      starsRef.current = makeStars(300, w, h);
      planetsRef.current = makePlanets(cx, cy);
    };
    window.addEventListener("resize", handleResize);

    function drawStars(ctx: CanvasRenderingContext2D, t: number, alpha = 1) {
      starsRef.current.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(t * s.speed * 0.5 + s.twinkleOffset);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220,200,255,${s.opacity * twinkle * alpha})`;
        ctx.shadowBlur = s.r > 1.2 ? 8 : 0;
        ctx.shadowColor = `rgba(180,140,255,${twinkle * alpha})`;
        ctx.fill(); ctx.shadowBlur = 0;
      });
    }

    function drawSun(ctx: CanvasRenderingContext2D, scx: number, scy: number, t: number, alpha = 1) {
      const pulse = 1 + 0.05 * Math.sin(t * 0.02);
      const grad = ctx.createRadialGradient(scx, scy, 0, scx, scy, 40 * pulse);
      grad.addColorStop(0, "#fff8e1"); grad.addColorStop(0.3, "#ffe082");
      grad.addColorStop(0.7, "#ff8f00"); grad.addColorStop(1, "rgba(255,100,0,0)");
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(scx, scy, 40 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.shadowBlur = 60; ctx.shadowColor = "#ff8f00";
      ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, pcx: number, pcy: number, alpha = 1) {
      if (!p.alive) return;
      const px = pcx + Math.cos(p.angle) * p.orbitRadius;
      const py = pcy + Math.sin(p.angle) * p.orbitRadius;
      ctx.beginPath(); ctx.arc(pcx, pcy, p.orbitRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(120,80,180,${0.12 * alpha})`; ctx.lineWidth = 1; ctx.stroke();
      const grad = ctx.createRadialGradient(px - p.radius * 0.3, py - p.radius * 0.3, 0, px, py, p.radius);
      grad.addColorStop(0, p.color + "ff"); grad.addColorStop(1, p.glowColor + "cc");
      ctx.beginPath(); ctx.arc(px, py, p.radius, 0, Math.PI * 2);
      ctx.globalAlpha = alpha; ctx.fillStyle = grad;
      ctx.shadowBlur = 25; ctx.shadowColor = p.glowColor; ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (p.moons) p.moons.forEach(m => {
        const mx2 = px + Math.cos(m.angle) * m.orbitRadius;
        const my2 = py + Math.sin(m.angle) * m.orbitRadius;
        ctx.beginPath(); ctx.arc(mx2, my2, m.radius, 0, Math.PI * 2);
        ctx.fillStyle = m.color; ctx.globalAlpha = alpha * 0.75; ctx.fill(); ctx.globalAlpha = 1;
      });
    }

    function drawBgMeteor(ctx: CanvasRenderingContext2D, m: BgMeteor) {
      if (!m.active) return;
      const len = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      const ax = m.vx / len, ay = m.vy / len;
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - ax * m.len, m.y - ay * m.len);
      grad.addColorStop(0, `rgba(200,160,255,${m.opacity})`);
      grad.addColorStop(1, "rgba(200,160,255,0)");
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - ax * m.len, m.y - ay * m.len);
      ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke();
    }

    function drawImpactMeteor(ctx: CanvasRenderingContext2D, im: ImpactMeteor) {
      const { x, y, scale, progress } = im;
      const r = scale * 400; const trail = 80 / scale;
      const angle = Math.atan2(h * 0.5 - y, cx - x);
      ctx.save(); ctx.translate(x, y);
      const trailGrad = ctx.createLinearGradient(-Math.cos(angle) * trail, -Math.sin(angle) * trail, 0, 0);
      trailGrad.addColorStop(0, "rgba(180,100,255,0)");
      trailGrad.addColorStop(0.5, `rgba(220,160,255,${Math.min(progress * 2, 0.7)})`);
      trailGrad.addColorStop(1, `rgba(255,220,255,${Math.min(progress * 3, 0.9)})`);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-Math.cos(angle) * trail, -Math.sin(angle) * trail);
      ctx.lineWidth = r * 1.5; ctx.strokeStyle = trailGrad; ctx.lineCap = "round"; ctx.stroke();
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      coreGrad.addColorStop(0, "#ffffff"); coreGrad.addColorStop(0.2, "#e8d5ff");
      coreGrad.addColorStop(0.6, "#8b3cf7"); coreGrad.addColorStop(1, "rgba(80,0,180,0)");
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad; ctx.shadowBlur = r * 2; ctx.shadowColor = "#a855f7";
      ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    }

    // Реалистичный каменный метеорит
    function drawGameMeteor(ctx: CanvasRenderingContext2D, m: GameMeteor) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      const r = m.r;
      // Хвост из раскалённых частиц
      ctx.restore();
      ctx.save();
      ctx.translate(m.x, m.y);
      for (let i = 0; i < 6; i++) {
        const dist = (i + 1) * r * 0.55;
        const spread = (Math.random() - 0.5) * r * 0.4;
        const pr = r * (0.25 - i * 0.03);
        if (pr <= 0) continue;
        const ag = 0.55 - i * 0.08;
        ctx.beginPath();
        ctx.arc(-dist + spread * 0.3, spread, Math.max(pr, 1), 0, Math.PI * 2);
        ctx.fillStyle = i < 2 ? `rgba(255,200,80,${ag})` : i < 4 ? `rgba(255,120,30,${ag})` : `rgba(150,60,10,${ag * 0.5})`;
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      // Тело — многоугольник с неровными краями
      ctx.beginPath();
      const pts = 9;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const rr = r * (0.82 + Math.sin(i * 3.7 + m.id) * 0.18);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      // Основной цвет — тёмный камень с красноватым свечением
      const bodyGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, 0, 0, 0, r);
      bodyGrad.addColorStop(0, "#9a7a5a");
      bodyGrad.addColorStop(0.4, "#6b5240");
      bodyGrad.addColorStop(0.75, "#3d2a1a");
      bodyGrad.addColorStop(1, "#1a0f08");
      ctx.fillStyle = bodyGrad;
      ctx.shadowBlur = 18; ctx.shadowColor = "rgba(255,100,20,0.7)";
      ctx.fill(); ctx.shadowBlur = 0;
      // Контур
      ctx.strokeStyle = "rgba(200,140,80,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
      // Кратеры
      m.craters.forEach(cr => {
        ctx.beginPath(); ctx.arc(cr.cx, cr.cy, cr.r, 0, Math.PI * 2);
        const cg = ctx.createRadialGradient(cr.cx - cr.r * 0.2, cr.cy - cr.r * 0.2, 0, cr.cx, cr.cy, cr.r);
        cg.addColorStop(0, "rgba(80,50,25,0.9)"); cg.addColorStop(1, "rgba(20,10,5,0.6)");
        ctx.fillStyle = cg; ctx.fill();
      });
      // Светлое пятно (блик)
      ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.28, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,220,180,0.12)"; ctx.fill();
      ctx.restore();
    }

    function drawGameMeteors(ctx: CanvasRenderingContext2D, pcx: number, pcy: number) {
      const audio = audioRef.current;
      const phase = gamePhaseRef.current;
      gameMeteorsRef.current.forEach(m => {
        m.rot += m.rotSpeed;
        if (m.alive) {
          m.x += m.vx; m.y += m.vy;
          drawGameMeteor(ctx, m);
          if (phase !== "playing") return;
          // Проверка — попал в солнце
          const dSun = Math.sqrt((m.x - pcx) ** 2 + (m.y - pcy) ** 2);
          if (dSun < 55) {
            m.alive = false;
            if (audio) playDamage(audio);
            const nl = Math.max(0, livesRef.current - 3);
            livesRef.current = nl; setLives(nl);
            waveDestroyedRef.current++;
            if (nl <= 0) { endGame(); return; }
            checkWaveComplete();
            return;
          }
          // Попал в планету
          unknownPlanetsRef.current.forEach(p => {
            if (!p.alive || !m.alive) return;
            const px = pcx + Math.cos(p.angle) * p.orbitRadius;
            const py = pcy + Math.sin(p.angle) * p.orbitRadius;
            const dP = Math.sqrt((m.x - px) ** 2 + (m.y - py) ** 2);
            if (dP < p.radius + m.r - 4) {
              m.alive = false; p.alive = false;
              if (audio) playDamage(audio);
              const nl = Math.max(0, livesRef.current - 1);
              livesRef.current = nl; setLives(nl);
              waveDestroyedRef.current++;
              if (nl <= 0) { endGame(); return; }
              checkWaveComplete();
            }
          });
          // Вылетел за экран — считается как пропуск (минус жизнь)
          if (m.x > w + m.r + 10) {
            m.alive = false;
            const nl = Math.max(0, livesRef.current - 1);
            livesRef.current = nl; setLives(nl);
            waveDestroyedRef.current++;
            if (nl <= 0) { endGame(); return; }
            checkWaveComplete();
          }
        }
        // Осколки
        if (m.shards) {
          m.shards.forEach(s => {
            s.x += s.vx; s.y += s.vy; s.vy += 0.08; s.vx *= 0.98;
            s.rot += s.rotSpeed; s.life -= 0.022; s.opacity = Math.max(0, s.life);
            if (s.opacity <= 0) return;
            ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
            ctx.beginPath();
            // Угловатый осколок
            const n = 4 + Math.floor(Math.random() * 2);
            const sr = s.r * s.life;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2;
              const rr = sr * (0.7 + Math.random() * 0.3);
              if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fillStyle = s.color.replace(")", `,${s.opacity})`).replace("rgb", "rgba");
            ctx.globalAlpha = s.opacity;
            ctx.shadowBlur = 4; ctx.shadowColor = "rgba(255,150,50,0.5)";
            ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
            ctx.restore();
          });
          m.shards = m.shards.filter(s => s.opacity > 0);
        }
      });
      gameMeteorsRef.current = gameMeteorsRef.current.filter(m => m.alive || (m.shards && m.shards.length > 0));
    }

    function loop() {
      const c = canvasRef.current; if (!c) return;
      const ctx = c.getContext("2d")!;
      timeRef.current++;
      const t = timeRef.current;
      const cur = sceneRef.current;
      const gPhase = gamePhaseRef.current;
      ctx.clearRect(0, 0, w, h);

      if (cur === "solar") {
        ctx.fillStyle = "#060010"; ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t);
        planetsRef.current.forEach(p => { p.angle += p.speed; if (p.moons) p.moons.forEach(m => { m.angle += m.speed; }); drawPlanet(ctx, p, cx, cy); });
        drawSun(ctx, cx, cy, t);
      }
      if (cur === "flying") {
        flyProgressRef.current += 0.01;
        const fp = Math.min(flyProgressRef.current, 1);
        ctx.fillStyle = "#060010"; ctx.fillRect(0, 0, w, h);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(1 + fp * 5, 1 + fp * 5); ctx.translate(-cx, -cy);
        drawStars(ctx, t, 1 - fp * 0.7);
        planetsRef.current.forEach(p => { drawPlanet(ctx, p, cx, cy, 1 - fp); });
        drawSun(ctx, cx, cy, t, 1 - fp);
        ctx.restore();
        ctx.fillStyle = `rgba(0,0,0,${fp * 0.97})`; ctx.fillRect(0, 0, w, h);
        if (fp >= 0.999) { sceneRef.current = "darkness"; setScene("darkness"); darknessTimerRef.current = t; }
      }
      if (cur === "darkness") {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        if (t - darknessTimerRef.current > 240) {
          sceneRef.current = "message"; setScene("message"); setShowMessage(true);
          let op = 0;
          const fade = setInterval(() => { op += 0.015; setMsgOpacity(Math.min(op, 1)); if (op >= 1) clearInterval(fade); }, 40);
        }
      }
      if (cur === "message") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); drawStars(ctx, t, 0.15); }
      if (cur === "meteor") {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, Math.max(0, 0.1 - meteorBigRef.current.progress * 0.3));
        const im = impactMeteorRef.current;
        im.progress += 0.018; im.scale = 0.01 + im.progress * im.progress * 3;
        im.x = cx + (im.x - cx) * (1 - im.progress * 0.5);
        im.y = cy + (im.y - cy) * (1 - im.progress * 0.5);
        drawImpactMeteor(ctx, im);
        if (im.progress > 0.6) {
          const fa = Math.min((im.progress - 0.6) / 0.4, 1);
          ctx.fillStyle = `rgba(120,40,255,${fa * 0.8})`; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = `rgba(255,255,255,${fa * 0.3})`; ctx.fillRect(0, 0, w, h);
        }
        if (im.progress >= 1.0) {
          sceneRef.current = "unknown"; setScene("unknown"); setShowMessage(false); setShowBtn2(true);
          unknownPlanetsRef.current = makeUnknownPlanets();
        }
      }
      if (cur === "unknown") {
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
        bg.addColorStop(0, "#0d0520"); bg.addColorStop(0.5, "#07021a"); bg.addColorStop(1, "#020008");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, 0.9);
        unknownPlanetsRef.current.forEach(p => { p.angle += p.speed; if (p.moons) p.moons.forEach(m => { m.angle += m.speed; }); drawPlanet(ctx, p, cx * 1.1, cy * 0.9); });
        const sp = 25 + 4 * Math.sin(t * 0.025);
        const sg = ctx.createRadialGradient(cx * 1.1, cy * 0.9, 0, cx * 1.1, cy * 0.9, sp * 2);
        sg.addColorStop(0, "#e8d5ff"); sg.addColorStop(0.4, "#9b59b6"); sg.addColorStop(1, "rgba(80,0,140,0)");
        ctx.beginPath(); ctx.arc(cx * 1.1, cy * 0.9, sp, 0, Math.PI * 2);
        ctx.fillStyle = sg; ctx.shadowBlur = 70; ctx.shadowColor = "#a855f7"; ctx.fill(); ctx.shadowBlur = 0;
        if (gPhase === "idle" || gPhase === "gameover") {
          bgMeteorsRef.current.forEach((m, i) => {
            if (!m.active) { if (Math.random() < 0.004) m.active = true; return; }
            m.x += m.vx; m.y += m.vy; drawBgMeteor(ctx, m);
            if (m.x > w + 120 || m.x < -120 || m.y > h + 120) { bgMeteorsRef.current[i] = spawnBgMeteor(); bgMeteorsRef.current[i].active = false; }
          });
        }
        if (gPhase === "playing" || gPhase === "wave_break") {
          drawGameMeteors(ctx, cx * 1.1, cy * 0.9);
        }
      }
      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", handleResize); };
  }, []);

  function handleFirstInteraction() {
    getAudio(); const ctx = audioRef.current!; playClick(ctx);
    setShowBtn1(false); sceneRef.current = "flying"; setScene("flying");
    flyProgressRef.current = 0; starsRef.current = makeStars(300, window.innerWidth, window.innerHeight);
  }

  function handleMessageClick() {
    sceneRef.current = "meteor"; setScene("meteor");
    const ww = canvasRef.current?.width ?? window.innerWidth;
    const hh = canvasRef.current?.height ?? window.innerHeight;
    impactMeteorRef.current = { x: ww * 0.7, y: hh * 0.15, scale: 0.01, progress: 0 };
    meteorBigRef.current = { progress: 0 };
  }

  function handleGoBack() {
    clearAllTimers(); gameMeteorsRef.current = [];
    gamePhaseRef.current = "idle"; setGamePhase("idle"); setGameOver(false); setShowBtn2(false);
    sceneRef.current = "solar"; setScene("solar");
    starsRef.current = makeStars(300, window.innerWidth, window.innerHeight);
    planetsRef.current = makePlanets(window.innerWidth / 2, window.innerHeight / 2);
    setShowBtn1(true);
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    const ctx = audioRef.current ?? getAudio();
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cur = sceneRef.current;
    if (cur !== "solar" && cur !== "unknown") return;
    if (gamePhaseRef.current === "playing") { handleGameMeteorClick(e); return; }
    const ocx = cur === "solar" ? canvas.width / 2 : canvas.width / 2 * 1.1;
    const ocy = cur === "solar" ? canvas.height / 2 : canvas.height / 2 * 0.9;
    const sunDist = Math.sqrt((mx - ocx) ** 2 + (my - ocy) ** 2);
    if (sunDist < 60) { playSunSound(ctx); return; }
    const pts = cur === "solar" ? planetsRef.current : unknownPlanetsRef.current;
    pts.forEach(p => {
      if (!p.alive) return;
      const px = ocx + Math.cos(p.angle) * p.orbitRadius;
      const py = ocy + Math.sin(p.angle) * p.orbitRadius;
      if (Math.sqrt((mx - px) ** 2 + (my - py) ** 2) < p.radius + 16) playPlanetSound(ctx, p.noteFreq, p.noteType);
    });
  }

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioStartedRef.current) getAudio();
    if (gamePhaseRef.current === "playing") { handleGameMeteorClick(e); return; }
    handleCanvasClick(e);
  }

  const css = `
    @keyframes textGlow{0%,100%{text-shadow:0 0 20px #c084fc,0 0 50px #9333ea,0 0 100px #6d28d9;opacity:.9}50%{text-shadow:0 0 40px #e879f9,0 0 90px #a855f7,0 0 140px #7c3aed;opacity:1}}
    @keyframes btnPulse{0%,100%{box-shadow:0 0 20px rgba(168,85,247,.5),0 0 50px rgba(139,92,246,.2),inset 0 0 20px rgba(168,85,247,.1)}50%{box-shadow:0 0 40px rgba(192,132,252,.8),0 0 90px rgba(168,85,247,.4),inset 0 0 30px rgba(192,132,252,.2)}}
    @keyframes starPulse{0%,100%{opacity:.5}50%{opacity:1}}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
    @keyframes drift{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes btn2In{from{opacity:0;transform:translateX(-50%) scale(.7)}to{opacity:1;transform:translateX(-50%) scale(1)}}
    @keyframes heartBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
    @keyframes countPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
    @keyframes waveIn{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}70%{transform:translate(-50%,-50%) scale(.97)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
    @keyframes gameoverIn{from{opacity:0;transform:translate(-50%,-50%) scale(.8)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
    @keyframes blink{0%,100%{opacity:.45}50%{opacity:.9}}
  `;

  const isUnknown = scene === "unknown";
  const isPlaying = gamePhase === "playing";
  const isCountdown = gamePhase === "countdown";
  const isWaveBreak = gamePhase === "wave_break";

  return (
    <div style={{ width:"100vw", height:"100vh", overflow:"hidden", background:"#000", position:"relative", fontFamily:"'Montserrat',sans-serif", cursor:"crosshair" }} onClick={handlePageClick}>
      <style>{css}</style>
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, display:"block" }} />

      {/* КНОПКА 1 */}
      {showBtn1 && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:28, pointerEvents:"none" }}>
          <div style={{ color:"rgba(200,160,255,.45)", fontSize:11, letterSpacing:6, textTransform:"uppercase", animation:"starPulse 3s ease-in-out infinite" }}>✦ &nbsp; добро пожаловать в космос &nbsp; ✦</div>
          <button onClick={e => { e.stopPropagation(); handleFirstInteraction(); }} style={{ background:"linear-gradient(135deg,rgba(88,28,135,.75),rgba(109,40,217,.55))", border:"1px solid rgba(192,132,252,.5)", borderRadius:999, padding:"22px 56px", color:"#f0e6ff", fontSize:15, fontWeight:700, fontFamily:"'Montserrat',sans-serif", letterSpacing:3, cursor:"pointer", animation:"btnPulse 2.5s ease-in-out infinite, drift 4s ease-in-out infinite", backdropFilter:"blur(12px)", textTransform:"uppercase", transition:"transform .1s, background .2s", pointerEvents:"all" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(109,40,217,.9),rgba(139,92,246,.7))"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(88,28,135,.75),rgba(109,40,217,.55))"; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(.95)"; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          >кликай ногтями дуре</button>
          <div style={{ color:"rgba(160,120,220,.3)", fontSize:12, letterSpacing:6, animation:"starPulse 4s ease-in-out infinite 1s" }}>✦ &nbsp; ✦ &nbsp; ✦</div>
        </div>
      )}

      {/* СООБЩЕНИЕ */}
      {showMessage && (
        <div onClick={e => { e.stopPropagation(); handleMessageClick(); }} style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, cursor:"pointer", opacity:msgOpacity }}>
          <div style={{ color:"#f0e8ff", fontSize:"clamp(24px,4.5vw,58px)", fontFamily:"'Cormorant Garamond',serif", fontWeight:300, fontStyle:"italic", textAlign:"center", maxWidth:720, lineHeight:1.6, padding:"0 32px", animation: msgOpacity > 0.5 ? "textGlow 2.5s ease-in-out infinite, fadeInUp 1.2s ease-out forwards" : "none", letterSpacing:1 }}>
            сияй ярче звёзд —<br />это твой день
          </div>
          <div style={{ color:"rgba(192,132,252,.4)", fontSize:10, letterSpacing:5, textTransform:"uppercase", marginTop:40, animation:"starPulse 2s ease-in-out infinite" }}>нажми чтобы продолжить</div>
        </div>
      )}

      {/* КНОПКА 2 — вернуться + подпись */}
      {showBtn2 && gamePhase === "idle" && (
        <>
          <button onClick={e => { e.stopPropagation(); handleGoBack(); }} style={{ position:"absolute", left:"50%", bottom:48, transform:"translateX(-50%)", background:"rgba(10,2,30,.7)", border:"1px solid rgba(168,85,247,.5)", borderRadius:999, padding:"14px 36px", color:"rgba(220,180,255,.9)", fontSize:12, fontFamily:"'Montserrat',sans-serif", letterSpacing:4, cursor:"pointer", backdropFilter:"blur(16px)", textTransform:"uppercase", animation:"btnPulse 3s ease-in-out infinite, btn2In .8s ease-out forwards", transition:"transform .15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-50%) scale(1.05)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-50%) scale(1)"; }}
          >← вернуться к солнечной системе</button>
          {/* Подпись в левом нижнем углу */}
          <div style={{ position:"absolute", left:20, bottom:20, color:"rgba(192,132,252,.55)", fontSize:11, letterSpacing:3, textTransform:"lowercase", animation:"blink 3s ease-in-out infinite", pointerEvents:"none", userSelect:"none" }}>
            сайт создан для яси
          </div>
        </>
      )}

      {/* КНОПКА "НАЧАТЬ ЭКСПЕРИМЕНТ" */}
      {isUnknown && gamePhase === "idle" && (
        <button onClick={e => { e.stopPropagation(); startExperiment(); }} style={{ position:"absolute", top:24, right:24, background:"linear-gradient(135deg,rgba(100,20,180,.8),rgba(140,60,220,.6))", border:"1px solid rgba(192,132,252,.6)", borderRadius:999, padding:"12px 28px", color:"#f0e6ff", fontSize:12, fontWeight:700, fontFamily:"'Montserrat',sans-serif", letterSpacing:2, cursor:"pointer", backdropFilter:"blur(12px)", textTransform:"uppercase", animation:"btnPulse 3s ease-in-out infinite", transition:"transform .1s, background .2s", zIndex:10 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(140,60,220,.95),rgba(170,90,250,.8))"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(100,20,180,.8),rgba(140,60,220,.6))"; }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(.95)"; }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >начать эксперимент</button>
      )}

      {/* ОБРАТНЫЙ ОТСЧЁТ */}
      {isCountdown && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, pointerEvents:"none" }}>
          <div style={{ color:"rgba(192,132,252,.7)", fontSize:12, letterSpacing:5, textTransform:"uppercase", marginBottom:8 }}>эксперимент начнётся через</div>
          <div key={countdown} style={{ color:"#e8d5ff", fontSize:"clamp(80px,15vw,160px)", fontWeight:900, lineHeight:1, animation:"countPop .4s cubic-bezier(.2,1.5,.5,1) forwards", textShadow:"0 0 40px #a855f7, 0 0 80px #6d28d9" }}>{countdown}</div>
          <div style={{ display:"flex", gap:16, marginTop:20 }}>
            {[0,1,2].map(i => <span key={i} style={{ fontSize:32, animation:"heartBeat 1.2s ease-in-out infinite", animationDelay:`${i * 0.2}s`, filter:"drop-shadow(0 0 8px #a855f7)" }}>💜</span>)}
          </div>
        </div>
      )}

      {/* ЭКРАН ВОЛНЫ */}
      {isWaveBreak && (
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:25, pointerEvents:"none", textAlign:"center", animation:"waveIn .5s cubic-bezier(.2,1.4,.5,1) forwards" }}>
          <div style={{ color:"rgba(192,132,252,.6)", fontSize:13, letterSpacing:6, textTransform:"uppercase", marginBottom:12 }}>следующая</div>
          <div style={{ color:"#f0e8ff", fontSize:"clamp(60px,12vw,130px)", fontWeight:900, lineHeight:1, textShadow:"0 0 40px #a855f7, 0 0 80px #6d28d9, 0 0 120px #4a00b0" }}>
            волна {waveNumber}
          </div>
          <div key={waveBreakTimer} style={{ color:"rgba(192,132,252,.5)", fontSize:"clamp(32px,6vw,64px)", fontWeight:700, marginTop:12, animation:"countPop .3s ease-out forwards" }}>{waveBreakTimer}</div>
        </div>
      )}

      {/* HUD ВО ВРЕМЯ ИГРЫ */}
      {(isPlaying || isWaveBreak) && (
        <>
          <div style={{ position:"absolute", top:20, right:20, display:"flex", gap:10, zIndex:10, pointerEvents:"none" }}>
            {[0,1,2].map(i => <span key={i} style={{ fontSize:28, opacity: i < lives ? 1 : 0.2, filter: i < lives ? "drop-shadow(0 0 6px #a855f7)" : "none", transition:"opacity .3s" }}>💜</span>)}
          </div>
          <div style={{ position:"absolute", top:20, left:"50%", transform:"translateX(-50%)", color:"rgba(192,132,252,.7)", fontSize:12, letterSpacing:3, textTransform:"uppercase", zIndex:10, pointerEvents:"none" }}>
            волна {waveNumber} / {TOTAL_WAVES}
          </div>
          <div style={{ position:"absolute", bottom:24, left:"50%", transform:"translateX(-50%)", width:"min(400px,80vw)", zIndex:10, pointerEvents:"none" }}>
            <div style={{ color:"rgba(192,132,252,.6)", fontSize:10, letterSpacing:3, textTransform:"uppercase", textAlign:"center", marginBottom:6 }}>уничтожено {progress}%</div>
            <div style={{ background:"rgba(60,10,100,.4)", borderRadius:999, height:8, border:"1px solid rgba(168,85,247,.3)", overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#7c3aed,#a855f7,#e879f9)", borderRadius:999, transition:"width .3s ease", boxShadow:"0 0 10px #a855f7" }} />
            </div>
          </div>
        </>
      )}

      {/* GAME OVER */}
      {gameOver && (
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:30, animation:"gameoverIn .6s ease-out forwards", textAlign:"center", width:"90vw", maxWidth:700 }}>
          <div style={{ background:"rgba(5,0,20,.9)", border:"1px solid rgba(168,85,247,.4)", borderRadius:24, padding:"48px 40px", backdropFilter:"blur(24px)", display:"flex", flexDirection:"column", alignItems:"center", gap:20 }}>
            {/* Фраза всегда видна пока не нажали кнопку */}
            {finalMilestone && (
              <div style={{ color:"#f0e8ff", fontSize:"clamp(18px,3vw,36px)", fontFamily:"'Cormorant Garamond',serif", fontWeight:300, fontStyle:"italic", lineHeight:1.5, textShadow:"0 0 20px #c084fc, 0 0 40px #9333ea" }}>
                {finalMilestone}
              </div>
            )}
            <div style={{ color:"rgba(192,132,252,.55)", fontSize:11, letterSpacing:4, textTransform:"uppercase" }}>
              уничтожено {progress}% метеоритов • волна {waveNumber}
            </div>
            <div style={{ display:"flex", gap:12, marginTop:8, flexWrap:"wrap", justifyContent:"center" }}>
              <button onClick={e => { e.stopPropagation(); handleRestartGame(); }} style={{ background:"linear-gradient(135deg,rgba(100,20,180,.85),rgba(140,60,220,.7))", border:"1px solid rgba(192,132,252,.6)", borderRadius:999, padding:"14px 32px", color:"#f0e6ff", fontSize:13, fontWeight:700, fontFamily:"'Montserrat',sans-serif", letterSpacing:2, cursor:"pointer", backdropFilter:"blur(8px)", textTransform:"uppercase", animation:"btnPulse 2.5s ease-in-out infinite" }}>
                попробовать снова
              </button>
              <button onClick={e => { e.stopPropagation(); handleBackToUniverse(); }} style={{ background:"rgba(10,2,30,.7)", border:"1px solid rgba(168,85,247,.4)", borderRadius:999, padding:"14px 32px", color:"rgba(200,160,255,.8)", fontSize:13, fontFamily:"'Montserrat',sans-serif", letterSpacing:2, cursor:"pointer", backdropFilter:"blur(8px)", textTransform:"uppercase" }}>
                обратно во вселенную
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}