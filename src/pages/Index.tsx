import { useEffect, useRef, useState, useCallback } from "react";

type Scene = "solar" | "flying" | "darkness" | "message" | "meteor" | "unknown";
type GamePhase = "idle" | "countdown" | "playing" | "gameover";

interface Star { x: number; y: number; r: number; opacity: number; speed: number; twinkleOffset: number; }
interface Planet { radius: number; color: string; orbitRadius: number; angle: number; speed: number; glowColor: string; moons?: Moon[]; noteFreq: number; noteType: OscillatorType; alive: boolean; }
interface Moon { orbitRadius: number; angle: number; speed: number; radius: number; color: string; }
interface Meteor { x: number; y: number; vx: number; vy: number; len: number; opacity: number; active: boolean; }
interface ImpactMeteor { x: number; y: number; scale: number; progress: number; }
interface GameMeteor { id: number; x: number; y: number; vx: number; vy: number; r: number; opacity: number; alive: boolean; shards?: Shard[]; }
interface Shard { x: number; y: number; vx: number; vy: number; r: number; opacity: number; life: number; }

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
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = ctx.createDelay(2);
    const dg = ctx.createGain();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = freq;
    delay.delayTime.value = 0.8 + i * 0.3;
    dg.gain.value = 0.3;
    gain.gain.value = 0.04 / (i + 1);
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
  base.frequency.linearRampToValueAtTime(32, ctx.currentTime + dur);
  baseGain.gain.value = 0.4;
  base.connect(baseGain); baseGain.connect(master);
  base.start(ctx.currentTime); base.stop(ctx.currentTime + dur);
  const shimmer = ctx.createOscillator(); const shimGain = ctx.createGain();
  shimmer.type = "sine"; shimmer.frequency.setValueAtTime(146.8, ctx.currentTime);
  shimmer.frequency.linearRampToValueAtTime(110, ctx.currentTime + dur);
  shimGain.gain.value = 0.25;
  shimmer.connect(shimGain); shimGain.connect(master);
  shimmer.start(ctx.currentTime); shimmer.stop(ctx.currentTime + dur);
  const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
  lfo.type = "sine"; lfo.frequency.value = 3.2; lfoGain.gain.value = 18;
  lfo.connect(lfoGain); lfoGain.connect(shimmer.frequency);
  lfo.start(ctx.currentTime); lfo.stop(ctx.currentTime + dur);
  const crown = ctx.createOscillator(); const crownGain = ctx.createGain();
  crown.type = "sine"; crown.frequency.setValueAtTime(440, ctx.currentTime);
  crown.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur * 0.7);
  crownGain.gain.setValueAtTime(0.12, ctx.currentTime);
  crownGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 0.7);
  crown.connect(crownGain); crownGain.connect(master);
  crown.start(ctx.currentTime); crown.stop(ctx.currentTime + dur * 0.7);
  const delay = ctx.createDelay(1.0); const delayFb = ctx.createGain(); const delayOut = ctx.createGain();
  delay.delayTime.value = 0.6; delayFb.gain.value = 0.45; delayOut.gain.value = 0.3;
  master.connect(delay); delay.connect(delayFb); delayFb.connect(delay);
  delay.connect(delayOut); delayOut.connect(ctx.destination);
}

function playPlanetSound(ctx: AudioContext, freq: number, type: OscillatorType) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  const reverb = ctx.createDelay(0.5); const reverbGain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
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
  osc2.connect(g2); g2.connect(ctx.destination);
  osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.5);
}

// Уникальный звук для каждой цифры обратного отсчёта
function playCountdownBeep(ctx: AudioContext, num: number) {
  const freqs: Record<number, number> = { 10: 200, 9: 240, 8: 280, 7: 320, 6: 360, 5: 400, 4: 500, 3: 600, 2: 720, 1: 900 };
  const types: Record<number, OscillatorType> = { 10: "sawtooth", 9: "triangle", 8: "sine", 7: "square", 6: "triangle", 5: "sine", 4: "sawtooth", 3: "triangle", 2: "sine", 1: "sine" };
  const freq = freqs[num] ?? 440;
  const type = types[num] ?? "sine";

  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (num <= 3) osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.45, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (num === 1 ? 0.6 : 0.3));
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);

  if (num <= 3) {
    const osc2 = ctx.createOscillator(); const g2 = ctx.createGain();
    osc2.type = "sine"; osc2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(0.2, ctx.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.4);
  }
}

function playMeteorHit(ctx: AudioContext) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.25);
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
}

function playDamage(ctx: AudioContext) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.6, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
}

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
  const unknownMeteorsRef = useRef<Meteor[]>([]);
  const timeRef = useRef(0);
  const audioStartedRef = useRef(false);

  // GAME STATE
  const [gamePhase, setGamePhase] = useState<GamePhase>("idle");
  const [countdown, setCountdown] = useState(10);
  const [lives, setLives] = useState(3);
  const [progress, setProgress] = useState(0);
  const [milestone, setMilestone] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const gamePhaseRef = useRef<GamePhase>("idle");
  const livesRef = useRef(3);
  const progressRef = useRef(0);
  const gameMeteorsRef = useRef<GameMeteor[]>([]);
  const gameMeteoridNextId = useRef(0);
  const totalSpawned = useRef(0);
  const totalDestroyed = useRef(0);
  const shownMilestones = useRef<Set<number>>(new Set());
  const milestoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameLoopTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  function spawnGameMeteors() {
    const canvas = canvasRef.current; if (!canvas) return;
    const h = canvas.height;
    const TOTAL = 100;
    let spawned = 0;
    const interval = setInterval(() => {
      if (spawned >= TOTAL || gamePhaseRef.current !== "playing") {
        clearInterval(interval);
        return;
      }
      const count = Math.random() > 0.6 ? 3 : 1;
      for (let i = 0; i < count && spawned < TOTAL; i++) {
        const speed = 2.5 + Math.random() * 3;
        gameMeteorsRef.current.push({
          id: gameMeteoridNextId.current++,
          x: -30,
          y: 40 + Math.random() * (h - 80),
          vx: speed,
          vy: (Math.random() - 0.3) * 1.2,
          r: 8 + Math.random() * 10,
          opacity: 1,
          alive: true,
        });
        spawned++;
        totalSpawned.current++;
      }
    }, 250 + Math.random() * 400);
    gameLoopTimer.current = interval;
  }

  function startCountdown() {
    const audio = getAudio();
    setGamePhase("countdown");
    gamePhaseRef.current = "countdown";
    setCountdown(10);
    let n = 10;
    playCountdownBeep(audio, n);
    countdownTimer.current = setInterval(() => {
      n--;
      setCountdown(n);
      playCountdownBeep(audio, n);
      if (n <= 0) {
        clearInterval(countdownTimer.current!);
        setGamePhase("playing");
        gamePhaseRef.current = "playing";
        spawnGameMeteors();
      }
    }, 1000);
  }

  function startExperiment() {
    // сбрасываем всё
    gameMeteorsRef.current = [];
    totalSpawned.current = 0;
    totalDestroyed.current = 0;
    shownMilestones.current = new Set();
    progressRef.current = 0;
    livesRef.current = 3;
    setLives(3);
    setProgress(0);
    setMilestone(null);
    setGameOver(false);
    setShowBtn2(false);
    // сбрасываем планеты (оживляем)
    unknownPlanetsRef.current = makeUnknownPlanets();
    startCountdown();
  }

  function endGame() {
    if (gameLoopTimer.current) clearInterval(gameLoopTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    gamePhaseRef.current = "gameover";
    setGamePhase("gameover");
    setGameOver(true);

    // Показываем milestone для финального прогресса
    const pct = progressRef.current;
    const keys = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const key = keys.find(k => pct >= k) ?? 0;
    if (key > 0) setMilestone(MILESTONES[key] ?? null);
  }

  function handleRestartGame() {
    startExperiment();
  }

  function handleBackToUniverse() {
    if (gameLoopTimer.current) clearInterval(gameLoopTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    gameMeteorsRef.current = [];
    setGamePhase("idle");
    gamePhaseRef.current = "idle";
    setGameOver(false);
    setMilestone(null);
    setShowBtn2(true);
    unknownPlanetsRef.current = makeUnknownPlanets();
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
      if (dist < m.r + 12) {
        m.alive = false;
        playMeteorHit(audio);
        // создаём осколки
        m.shards = Array.from({ length: 8 + Math.floor(Math.random() * 6) }, () => ({
          x: m.x, y: m.y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          r: 1.5 + Math.random() * 3,
          opacity: 1,
          life: 1,
        }));
        totalDestroyed.current++;
        // прогресс
        const pct = Math.min(Math.round((totalDestroyed.current / 100) * 100), 100);
        progressRef.current = pct;
        setProgress(pct);
        // milestone
        const milestoneKeys = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        milestoneKeys.forEach(k => {
          if (pct >= k && !shownMilestones.current.has(k)) {
            shownMilestones.current.add(k);
            setMilestone(MILESTONES[k]);
            if (milestoneTimer.current) clearTimeout(milestoneTimer.current);
            milestoneTimer.current = setTimeout(() => setMilestone(null), 3500);
          }
        });
        // если все 100 уничтожены
        if (totalDestroyed.current >= 100) endGame();
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

    function spawnBgMeteor(): Meteor {
      const side = Math.random() > 0.5 ? 0 : 1;
      return {
        x: side === 0 ? -50 : w + 50, y: Math.random() * h * 0.7,
        vx: side === 0 ? (1.5 + Math.random() * 3) : -(1.5 + Math.random() * 3),
        vy: 0.5 + Math.random() * 1.5,
        len: 50 + Math.random() * 100,
        opacity: 0.5 + Math.random() * 0.5,
        active: Math.random() > 0.6,
      };
    }
    unknownMeteorsRef.current = Array.from({ length: 8 }, spawnBgMeteor);

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
        const mx = px + Math.cos(m.angle) * m.orbitRadius;
        const my = py + Math.sin(m.angle) * m.orbitRadius;
        ctx.beginPath(); ctx.arc(mx, my, m.radius, 0, Math.PI * 2);
        ctx.fillStyle = m.color; ctx.globalAlpha = alpha * 0.75; ctx.fill(); ctx.globalAlpha = 1;
      });
    }

    function drawBgMeteor(ctx: CanvasRenderingContext2D, m: Meteor) {
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
      const r = scale * 400;
      const trail = 80 / scale;
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

    // рисуем игровые метеориты
    function drawGameMeteors(ctx: CanvasRenderingContext2D, pcx: number, pcy: number) {
      const audio = audioRef.current;
      gameMeteorsRef.current.forEach(m => {
        if (m.alive) {
          m.x += m.vx; m.y += m.vy;
          // хвост
          const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 8, m.y - m.vy * 8);
          grad.addColorStop(0, `rgba(255,200,120,${m.opacity})`);
          grad.addColorStop(1, "rgba(255,150,50,0)");
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 8, m.y - m.vy * 8);
          ctx.strokeStyle = grad; ctx.lineWidth = m.r * 0.7; ctx.stroke();
          // ядро
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          const cg = ctx.createRadialGradient(m.x - m.r * 0.3, m.y - m.r * 0.3, 0, m.x, m.y, m.r);
          cg.addColorStop(0, "#fff5e0"); cg.addColorStop(0.5, "#ffaa44"); cg.addColorStop(1, "rgba(200,80,0,0)");
          ctx.fillStyle = cg; ctx.shadowBlur = 15; ctx.shadowColor = "#ff8800"; ctx.fill(); ctx.shadowBlur = 0;

          // проверяем попадание в солнце (radius ~40)
          const dSun = Math.sqrt((m.x - pcx) ** 2 + (m.y - pcy) ** 2);
          if (dSun < 50) {
            m.alive = false;
            if (audio) playDamage(audio);
            const newLives = Math.max(0, livesRef.current - 3);
            livesRef.current = newLives;
            setLives(newLives);
            if (newLives <= 0) endGame();
            return;
          }

          // проверяем попадание в планеты
          unknownPlanetsRef.current.forEach(p => {
            if (!p.alive || !m.alive) return;
            const px = pcx + Math.cos(p.angle) * p.orbitRadius;
            const py = pcy + Math.sin(p.angle) * p.orbitRadius;
            const dP = Math.sqrt((m.x - px) ** 2 + (m.y - py) ** 2);
            if (dP < p.radius + m.r) {
              m.alive = false;
              p.alive = false;
              if (audio) playDamage(audio);
              const newLives = Math.max(0, livesRef.current - 1);
              livesRef.current = newLives;
              setLives(newLives);
              if (newLives <= 0) endGame();
            }
          });

          // вылетел за экран — тоже минус жизнь
          if (m.x > w + 60) {
            m.alive = false;
            const newLives = Math.max(0, livesRef.current - 1);
            livesRef.current = newLives;
            setLives(newLives);
            if (newLives <= 0) endGame();
          }
        }

        // рисуем осколки
        if (m.shards) {
          m.shards.forEach(s => {
            s.x += s.vx; s.y += s.vy;
            s.vy += 0.05;
            s.life -= 0.025;
            s.opacity = Math.max(0, s.life);
            if (s.opacity <= 0) return;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,180,80,${s.opacity})`;
            ctx.shadowBlur = 6; ctx.shadowColor = "#ff8800"; ctx.fill(); ctx.shadowBlur = 0;
          });
          m.shards = m.shards.filter(s => s.opacity > 0);
        }
      });
      // чистим мёртвые без осколков
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
        planetsRef.current.forEach(p => {
          p.angle += p.speed;
          if (p.moons) p.moons.forEach(m => { m.angle += m.speed; });
          drawPlanet(ctx, p, cx, cy);
        });
        drawSun(ctx, cx, cy, t);
      }

      if (cur === "flying") {
        flyProgressRef.current += 0.01;
        const fp = Math.min(flyProgressRef.current, 1);
        ctx.fillStyle = "#060010"; ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(1 + fp * 5, 1 + fp * 5); ctx.translate(-cx, -cy);
        drawStars(ctx, t, 1 - fp * 0.7);
        planetsRef.current.forEach(p => { drawPlanet(ctx, p, cx, cy, 1 - fp); });
        drawSun(ctx, cx, cy, t, 1 - fp);
        ctx.restore();
        ctx.fillStyle = `rgba(0,0,0,${fp * 0.97})`; ctx.fillRect(0, 0, w, h);
        if (fp >= 0.999) {
          sceneRef.current = "darkness"; setScene("darkness");
          darknessTimerRef.current = t;
        }
      }

      if (cur === "darkness") {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        if (t - darknessTimerRef.current > 240) {
          sceneRef.current = "message"; setScene("message");
          setShowMessage(true);
          let op = 0;
          const fade = setInterval(() => {
            op += 0.015; setMsgOpacity(Math.min(op, 1));
            if (op >= 1) clearInterval(fade);
          }, 40);
        }
      }

      if (cur === "message") {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, 0.15);
      }

      if (cur === "meteor") {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, Math.max(0, 0.1 - meteorBigRef.current.progress * 0.3));
        const im = impactMeteorRef.current;
        im.progress += 0.018;
        im.scale = 0.01 + im.progress * im.progress * 3;
        const targetX = cx + (im.x - cx) * (1 - im.progress * 0.5);
        const targetY = cy + (im.y - cy) * (1 - im.progress * 0.5);
        im.x = targetX; im.y = targetY;
        drawImpactMeteor(ctx, im);
        if (im.progress > 0.6) {
          const flashAlpha = Math.min((im.progress - 0.6) / 0.4, 1);
          ctx.fillStyle = `rgba(120,40,255,${flashAlpha * 0.8})`; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.3})`; ctx.fillRect(0, 0, w, h);
        }
        if (im.progress >= 1.0) {
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
          sceneRef.current = "unknown"; setScene("unknown");
          setShowMessage(false);
          setShowBtn2(true);
          unknownPlanetsRef.current = makeUnknownPlanets();
        }
      }

      if (cur === "unknown") {
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
        bg.addColorStop(0, "#0d0520"); bg.addColorStop(0.5, "#07021a"); bg.addColorStop(1, "#020008");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, 0.9);
        unknownPlanetsRef.current.forEach(p => {
          p.angle += p.speed;
          if (p.moons) p.moons.forEach(m => { m.angle += m.speed; });
          drawPlanet(ctx, p, cx * 1.1, cy * 0.9);
        });
        const sunPulse = 25 + 4 * Math.sin(t * 0.025);
        const sg = ctx.createRadialGradient(cx * 1.1, cy * 0.9, 0, cx * 1.1, cy * 0.9, sunPulse * 2);
        sg.addColorStop(0, "#e8d5ff"); sg.addColorStop(0.4, "#9b59b6"); sg.addColorStop(1, "rgba(80,0,140,0)");
        ctx.beginPath(); ctx.arc(cx * 1.1, cy * 0.9, sunPulse, 0, Math.PI * 2);
        ctx.fillStyle = sg; ctx.shadowBlur = 70; ctx.shadowColor = "#a855f7"; ctx.fill(); ctx.shadowBlur = 0;

        // фоновые метеориты только если игра не идёт
        if (gPhase === "idle" || gPhase === "gameover") {
          unknownMeteorsRef.current.forEach((m, i) => {
            if (!m.active) { if (Math.random() < 0.004) m.active = true; return; }
            m.x += m.vx; m.y += m.vy; drawBgMeteor(ctx, m);
            if (m.x > w + 120 || m.x < -120 || m.y > h + 120) {
              unknownMeteorsRef.current[i] = spawnBgMeteor();
              unknownMeteorsRef.current[i].active = false;
            }
          });
        }

        // игровые метеориты
        if (gPhase === "playing") {
          drawGameMeteors(ctx, cx * 1.1, cy * 0.9);
        }
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", handleResize); };
  }, []);

  function handleFirstInteraction() {
    getAudio();
    const ctx = audioRef.current!;
    playClick(ctx);
    setShowBtn1(false);
    sceneRef.current = "flying"; setScene("flying");
    flyProgressRef.current = 0;
    starsRef.current = makeStars(300, window.innerWidth, window.innerHeight);
  }

  function handleMessageClick() {
    sceneRef.current = "meteor"; setScene("meteor");
    const ww = canvasRef.current?.width ?? window.innerWidth;
    const hh = canvasRef.current?.height ?? window.innerHeight;
    impactMeteorRef.current = { x: ww * 0.7, y: hh * 0.15, scale: 0.01, progress: 0 };
    meteorBigRef.current = { progress: 0 };
  }

  function handleGoBack() {
    if (gameLoopTimer.current) clearInterval(gameLoopTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    gameMeteorsRef.current = [];
    gamePhaseRef.current = "idle";
    setGamePhase("idle");
    setGameOver(false);
    setShowBtn2(false);
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
    if (gamePhaseRef.current === "playing") {
      handleGameMeteorClick(e);
      return;
    }
    const ocx = cur === "solar" ? canvas.width / 2 : canvas.width / 2 * 1.1;
    const ocy = cur === "solar" ? canvas.height / 2 : canvas.height / 2 * 0.9;
    const sunDist = Math.sqrt((mx - ocx) ** 2 + (my - ocy) ** 2);
    if (sunDist < 60) { playSunSound(ctx); return; }
    const planetsToCheck = cur === "solar" ? planetsRef.current : unknownPlanetsRef.current;
    planetsToCheck.forEach(p => {
      if (!p.alive) return;
      const px = ocx + Math.cos(p.angle) * p.orbitRadius;
      const py = ocy + Math.sin(p.angle) * p.orbitRadius;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < p.radius + 16) playPlanetSound(ctx, p.noteFreq, p.noteType);
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
    @keyframes milestoneIn{0%{opacity:0;transform:translate(-50%,-50%) scale(.7)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
    @keyframes gameoverIn{from{opacity:0;transform:translate(-50%,-50%) scale(.8)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  `;

  const isUnknown = scene === "unknown";
  const isPlaying = gamePhase === "playing";
  const isCountdown = gamePhase === "countdown";

  return (
    <div
      style={{ width:"100vw", height:"100vh", overflow:"hidden", background:"#000", position:"relative", fontFamily:"'Montserrat',sans-serif", cursor: isPlaying ? "crosshair" : "crosshair" }}
      onClick={handlePageClick}
    >
      <style>{css}</style>
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, display:"block" }} />

      {/* ===== КНОПКА 1 ===== */}
      {showBtn1 && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:28, pointerEvents:"none" }}>
          <div style={{ color:"rgba(200,160,255,.45)", fontSize:11, letterSpacing:6, textTransform:"uppercase", animation:"starPulse 3s ease-in-out infinite" }}>
            ✦ &nbsp; добро пожаловать в космос &nbsp; ✦
          </div>
          <button onClick={e => { e.stopPropagation(); handleFirstInteraction(); }} style={{ background:"linear-gradient(135deg,rgba(88,28,135,.75),rgba(109,40,217,.55))", border:"1px solid rgba(192,132,252,.5)", borderRadius:999, padding:"22px 56px", color:"#f0e6ff", fontSize:15, fontWeight:700, fontFamily:"'Montserrat',sans-serif", letterSpacing:3, cursor:"pointer", animation:"btnPulse 2.5s ease-in-out infinite, drift 4s ease-in-out infinite", backdropFilter:"blur(12px)", textTransform:"uppercase", transition:"transform .1s, background .2s", pointerEvents:"all" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(109,40,217,.9),rgba(139,92,246,.7))"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(88,28,135,.75),rgba(109,40,217,.55))"; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(.95)"; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          >кликай ногтями дуре</button>
          <div style={{ color:"rgba(160,120,220,.3)", fontSize:12, letterSpacing:6, animation:"starPulse 4s ease-in-out infinite 1s" }}>✦ &nbsp; ✦ &nbsp; ✦</div>
        </div>
      )}

      {/* ===== СООБЩЕНИЕ ===== */}
      {showMessage && (
        <div onClick={e => { e.stopPropagation(); handleMessageClick(); }} style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, cursor:"pointer", opacity:msgOpacity }}>
          <div style={{ color:"#f0e8ff", fontSize:"clamp(24px,4.5vw,58px)", fontFamily:"'Cormorant Garamond',serif", fontWeight:300, fontStyle:"italic", textAlign:"center", maxWidth:720, lineHeight:1.6, padding:"0 32px", animation: msgOpacity > 0.5 ? "textGlow 2.5s ease-in-out infinite, fadeInUp 1.2s ease-out forwards" : "none", letterSpacing:1 }}>
            сияй ярче звёзд —<br />это твой день
          </div>
          <div style={{ color:"rgba(192,132,252,.4)", fontSize:10, letterSpacing:5, textTransform:"uppercase", marginTop:40, animation:"starPulse 2s ease-in-out infinite" }}>нажми чтобы продолжить</div>
        </div>
      )}

      {/* ===== КНОПКА 2 — вернуться ===== */}
      {showBtn2 && gamePhase === "idle" && (
        <button onClick={e => { e.stopPropagation(); handleGoBack(); }} style={{ position:"absolute", left:"50%", bottom:48, transform:"translateX(-50%)", background:"rgba(10,2,30,.7)", border:"1px solid rgba(168,85,247,.5)", borderRadius:999, padding:"14px 36px", color:"rgba(220,180,255,.9)", fontSize:12, fontFamily:"'Montserrat',sans-serif", letterSpacing:4, cursor:"pointer", backdropFilter:"blur(16px)", textTransform:"uppercase", animation:"btnPulse 3s ease-in-out infinite, btn2In .8s ease-out forwards", transition:"transform .15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-50%) scale(1.05)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-50%) scale(1)"; }}
        >← вернуться к солнечной системе</button>
      )}

      {/* ===== КНОПКА "НАЧАТЬ ЭКСПЕРИМЕНТ" ===== */}
      {isUnknown && gamePhase === "idle" && (
        <button
          onClick={e => { e.stopPropagation(); startExperiment(); }}
          style={{ position:"absolute", top:24, right:24, background:"linear-gradient(135deg,rgba(100,20,180,.8),rgba(140,60,220,.6))", border:"1px solid rgba(192,132,252,.6)", borderRadius:999, padding:"12px 28px", color:"#f0e6ff", fontSize:12, fontWeight:700, fontFamily:"'Montserrat',sans-serif", letterSpacing:2, cursor:"pointer", backdropFilter:"blur(12px)", textTransform:"uppercase", animation:"btnPulse 3s ease-in-out infinite", transition:"transform .1s, background .2s", zIndex:10 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(140,60,220,.95),rgba(170,90,250,.8))"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(100,20,180,.8),rgba(140,60,220,.6))"; }}
          onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(.95)"; }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >начать эксперимент</button>
      )}

      {/* ===== ОБРАТНЫЙ ОТСЧЁТ ===== */}
      {isCountdown && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16, pointerEvents:"none" }}>
          <div style={{ color:"rgba(192,132,252,.7)", fontSize:12, letterSpacing:5, textTransform:"uppercase", marginBottom:8 }}>эксперимент начнётся через</div>
          <div key={countdown} style={{ color:"#e8d5ff", fontSize:"clamp(80px,15vw,160px)", fontWeight:900, lineHeight:1, animation:"countPop .4s cubic-bezier(.2,1.5,.5,1) forwards", textShadow:"0 0 40px #a855f7, 0 0 80px #6d28d9" }}>
            {countdown}
          </div>
          {/* сердечки */}
          <div style={{ display:"flex", gap:16, marginTop:20 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ fontSize:32, animation:`heartBeat 1.2s ease-in-out infinite`, animationDelay:`${i * 0.2}s`, filter:"drop-shadow(0 0 8px #a855f7)" }}>💜</span>
            ))}
          </div>
        </div>
      )}

      {/* ===== HUD ВО ВРЕМЯ ИГРЫ ===== */}
      {isPlaying && (
        <>
          {/* Жизни */}
          <div style={{ position:"absolute", top:20, right:20, display:"flex", gap:10, zIndex:10, pointerEvents:"none" }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ fontSize:28, opacity: i < lives ? 1 : 0.2, filter: i < lives ? "drop-shadow(0 0 6px #a855f7)" : "none", transition:"opacity .3s, filter .3s" }}>💜</span>
            ))}
          </div>
          {/* Прогресс */}
          <div style={{ position:"absolute", bottom:24, left:"50%", transform:"translateX(-50%)", width:"min(400px,80vw)", zIndex:10, pointerEvents:"none" }}>
            <div style={{ color:"rgba(192,132,252,.6)", fontSize:10, letterSpacing:3, textTransform:"uppercase", textAlign:"center", marginBottom:6 }}>уничтожено {progress}%</div>
            <div style={{ background:"rgba(60,10,100,.4)", borderRadius:999, height:8, border:"1px solid rgba(168,85,247,.3)", overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#7c3aed,#a855f7,#e879f9)", borderRadius:999, transition:"width .3s ease", boxShadow:"0 0 10px #a855f7" }} />
            </div>
          </div>
        </>
      )}

      {/* ===== MILESTONE СООБЩЕНИЕ ===== */}
      {milestone && !gameOver && (
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:20, pointerEvents:"none", textAlign:"center", animation:"milestoneIn 3.5s ease-out forwards", width:"80vw", maxWidth:700 }}>
          <div style={{ color:"#f0e8ff", fontSize:"clamp(20px,3.5vw,48px)", fontFamily:"'Cormorant Garamond',serif", fontWeight:300, fontStyle:"italic", lineHeight:1.5, textShadow:"0 0 30px #c084fc, 0 0 60px #9333ea, 0 0 100px #6d28d9" }}>
            {milestone}
          </div>
        </div>
      )}

      {/* ===== GAME OVER ===== */}
      {gameOver && (
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:30, animation:"gameoverIn .6s ease-out forwards", textAlign:"center", width:"90vw", maxWidth:700 }}>
          <div style={{ background:"rgba(5,0,20,.85)", border:"1px solid rgba(168,85,247,.4)", borderRadius:24, padding:"48px 40px", backdropFilter:"blur(24px)", display:"flex", flexDirection:"column", alignItems:"center", gap:24 }}>
            {milestone && (
              <div style={{ color:"#f0e8ff", fontSize:"clamp(18px,3vw,36px)", fontFamily:"'Cormorant Garamond',serif", fontWeight:300, fontStyle:"italic", lineHeight:1.5, textShadow:"0 0 20px #c084fc, 0 0 40px #9333ea", marginBottom:4 }}>
                {milestone}
              </div>
            )}
            <div style={{ color:"rgba(192,132,252,.6)", fontSize:11, letterSpacing:4, textTransform:"uppercase" }}>
              уничтожено {progress} из 100 метеоритов
            </div>
            <div style={{ display:"flex", gap:12, marginTop:8, flexWrap:"wrap", justifyContent:"center" }}>
              <button
                onClick={e => { e.stopPropagation(); handleRestartGame(); }}
                style={{ background:"linear-gradient(135deg,rgba(100,20,180,.85),rgba(140,60,220,.7))", border:"1px solid rgba(192,132,252,.6)", borderRadius:999, padding:"14px 32px", color:"#f0e6ff", fontSize:13, fontWeight:700, fontFamily:"'Montserrat',sans-serif", letterSpacing:2, cursor:"pointer", backdropFilter:"blur(8px)", textTransform:"uppercase", animation:"btnPulse 2.5s ease-in-out infinite" }}
              >попробовать снова</button>
              <button
                onClick={e => { e.stopPropagation(); handleBackToUniverse(); }}
                style={{ background:"rgba(10,2,30,.7)", border:"1px solid rgba(168,85,247,.4)", borderRadius:999, padding:"14px 32px", color:"rgba(200,160,255,.8)", fontSize:13, fontFamily:"'Montserrat',sans-serif", letterSpacing:2, cursor:"pointer", backdropFilter:"blur(8px)", textTransform:"uppercase" }}
              >обратно во вселенную</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
