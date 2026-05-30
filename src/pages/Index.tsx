import { useEffect, useRef, useState } from "react";

type Scene = "solar" | "flying" | "darkness" | "message" | "meteor" | "unknown";

interface Star { x: number; y: number; r: number; opacity: number; speed: number; twinkleOffset: number; }
interface Planet { radius: number; color: string; orbitRadius: number; angle: number; speed: number; glowColor: string; moons?: Moon[]; noteFreq: number; noteType: OscillatorType; }
interface Moon { orbitRadius: number; angle: number; speed: number; radius: number; color: string; }
interface Meteor { x: number; y: number; vx: number; vy: number; len: number; opacity: number; active: boolean; }
interface ImpactMeteor { x: number; y: number; scale: number; progress: number; }

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
    noteFreq: c.freq, noteType: c.type,
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
    noteFreq: c.freq, noteType: c.type,
    moons: i === 2 ? [{ orbitRadius: 35, angle: 1, speed: 0.015, radius: 5, color: "#7c3aed" }] : undefined,
  }));
}

function getAudioCtx(): AudioContext {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AudioCtx();
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
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
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

  // Глубокий гул — основа солнца
  const base = ctx.createOscillator();
  const baseGain = ctx.createGain();
  base.type = "sawtooth";
  base.frequency.setValueAtTime(36.7, ctx.currentTime);
  base.frequency.linearRampToValueAtTime(32, ctx.currentTime + dur);
  baseGain.gain.value = 0.4;
  base.connect(baseGain); baseGain.connect(master);
  base.start(ctx.currentTime); base.stop(ctx.currentTime + dur);

  // Горячее мерцание — верхний слой
  const shimmer = ctx.createOscillator();
  const shimGain = ctx.createGain();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(146.8, ctx.currentTime);
  shimmer.frequency.linearRampToValueAtTime(110, ctx.currentTime + dur);
  shimGain.gain.value = 0.25;
  shimmer.connect(shimGain); shimGain.connect(master);
  shimmer.start(ctx.currentTime); shimmer.stop(ctx.currentTime + dur);

  // ЛФО — пульсация как солнечная активность
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 3.2;
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain); lfoGain.connect(shimmer.frequency);
  lfo.start(ctx.currentTime); lfo.stop(ctx.currentTime + dur);

  // Короны — высокий свист на обертоне
  const crown = ctx.createOscillator();
  const crownGain = ctx.createGain();
  crown.type = "sine";
  crown.frequency.setValueAtTime(440, ctx.currentTime);
  crown.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + dur * 0.7);
  crownGain.gain.setValueAtTime(0.12, ctx.currentTime);
  crownGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 0.7);
  crown.connect(crownGain); crownGain.connect(master);
  crown.start(ctx.currentTime); crown.stop(ctx.currentTime + dur * 0.7);

  // Долгое эхо-реверберация
  const delay = ctx.createDelay(1.0);
  const delayFb = ctx.createGain();
  const delayOut = ctx.createGain();
  delay.delayTime.value = 0.6;
  delayFb.gain.value = 0.45;
  delayOut.gain.value = 0.3;
  master.connect(delay);
  delay.connect(delayFb); delayFb.connect(delay);
  delay.connect(delayOut); delayOut.connect(ctx.destination);
}

function playPlanetSound(ctx: AudioContext, freq: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const reverb = ctx.createDelay(0.5);
  const reverbGain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.8);
  gain.gain.setValueAtTime(0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
  reverb.delayTime.value = 0.3;
  reverbGain.gain.value = 0.4;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.connect(reverb);
  reverb.connect(reverbGain);
  reverbGain.connect(ctx.destination);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1);

  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime);
  g2.gain.setValueAtTime(0.1, ctx.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc2.connect(g2); g2.connect(ctx.destination);
  osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.5);
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

    function spawnMeteor(): Meteor {
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
    unknownMeteorsRef.current = Array.from({ length: 8 }, spawnMeteor);

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
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
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

    function drawMeteorSmall(ctx: CanvasRenderingContext2D, m: Meteor) {
      if (!m.active) return;
      const len = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      const ax = m.vx / len, ay = m.vy / len;
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - ax * m.len, m.y - ay * m.len);
      grad.addColorStop(0, `rgba(200,160,255,${m.opacity})`);
      grad.addColorStop(1, "rgba(200,160,255,0)");
      ctx.beginPath(); ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - ax * m.len, m.y - ay * m.len);
      ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke();
    }

    function drawImpactMeteor(ctx: CanvasRenderingContext2D, im: ImpactMeteor) {
      const { x, y, scale, progress } = im;
      const r = scale * 400;
      const trail = 80 / scale;
      const angle = Math.atan2(h * 0.5 - y, cx - x);
      ctx.save();
      ctx.translate(x, y);
      const trailGrad = ctx.createLinearGradient(
        -Math.cos(angle) * trail, -Math.sin(angle) * trail, 0, 0
      );
      trailGrad.addColorStop(0, "rgba(180,100,255,0)");
      trailGrad.addColorStop(0.5, `rgba(220,160,255,${Math.min(progress * 2, 0.7)})`);
      trailGrad.addColorStop(1, `rgba(255,220,255,${Math.min(progress * 3, 0.9)})`);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-Math.cos(angle) * trail, -Math.sin(angle) * trail);
      ctx.lineWidth = r * 1.5;
      ctx.strokeStyle = trailGrad;
      ctx.lineCap = "round";
      ctx.stroke();
      const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      coreGrad.addColorStop(0, "#ffffff");
      coreGrad.addColorStop(0.2, "#e8d5ff");
      coreGrad.addColorStop(0.6, "#8b3cf7");
      coreGrad.addColorStop(1, "rgba(80,0,180,0)");
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad; ctx.shadowBlur = r * 2; ctx.shadowColor = "#a855f7";
      ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    }

    function loop() {
      const c = canvasRef.current; if (!c) return;
      const ctx = c.getContext("2d")!;
      timeRef.current++;
      const t = timeRef.current;
      const cur = sceneRef.current;
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
        unknownMeteorsRef.current.forEach((m, i) => {
          if (!m.active) { if (Math.random() < 0.004) m.active = true; return; }
          m.x += m.vx; m.y += m.vy; drawMeteorSmall(ctx, m);
          if (m.x > w + 120 || m.x < -120 || m.y > h + 120) {
            unknownMeteorsRef.current[i] = spawnMeteor();
            unknownMeteorsRef.current[i].active = false;
          }
        });
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
    const w = canvasRef.current?.width ?? window.innerWidth;
    const h = canvasRef.current?.height ?? window.innerHeight;
    impactMeteorRef.current = { x: w * 0.7, y: h * 0.15, scale: 0.01, progress: 0 };
    meteorBigRef.current = { progress: 0 };
  }

  function handleGoBack() {
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

    const ocx = cur === "solar" ? canvas.width / 2 : canvas.width / 2 * 1.1;
    const ocy = cur === "solar" ? canvas.height / 2 : canvas.height / 2 * 0.9;

    // Проверка клика по солнцу (радиус ~40 + зона касания 20)
    const sunDist = Math.sqrt((mx - ocx) ** 2 + (my - ocy) ** 2);
    if (sunDist < 60) {
      playSunSound(ctx);
      return;
    }

    const planetsToCheck = cur === "solar" ? planetsRef.current : unknownPlanetsRef.current;
    planetsToCheck.forEach(p => {
      const px = ocx + Math.cos(p.angle) * p.orbitRadius;
      const py = ocy + Math.sin(p.angle) * p.orbitRadius;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < p.radius + 16) {
        playPlanetSound(ctx, p.noteFreq, p.noteType);
      }
    });
  }

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioStartedRef.current) { getAudio(); }
    handleCanvasClick(e);
  }

  const css = `
    @keyframes textGlow {
      0%,100%{text-shadow:0 0 20px #c084fc,0 0 50px #9333ea,0 0 100px #6d28d9;opacity:.9}
      50%{text-shadow:0 0 40px #e879f9,0 0 90px #a855f7,0 0 140px #7c3aed;opacity:1}
    }
    @keyframes btnPulse {
      0%,100%{box-shadow:0 0 20px rgba(168,85,247,.5),0 0 50px rgba(139,92,246,.2),inset 0 0 20px rgba(168,85,247,.1)}
      50%{box-shadow:0 0 40px rgba(192,132,252,.8),0 0 90px rgba(168,85,247,.4),inset 0 0 30px rgba(192,132,252,.2)}
    }
    @keyframes starPulse{0%,100%{opacity:.5}50%{opacity:1}}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
    @keyframes drift{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
    @keyframes btn2In{from{opacity:0;transform:translate(-50%,-50%) scale(.7)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  `;

  return (
    <div
      style={{ width:"100vw", height:"100vh", overflow:"hidden", background:"#000", position:"relative", fontFamily:"'Montserrat',sans-serif", cursor:"crosshair" }}
      onClick={handlePageClick}
    >
      <style>{css}</style>
      <canvas ref={canvasRef} style={{ position:"absolute", inset:0, display:"block" }} />

      {showBtn1 && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:28, pointerEvents:"none" }}>
          <div style={{ color:"rgba(200,160,255,.45)", fontSize:11, letterSpacing:6, textTransform:"uppercase", animation:"starPulse 3s ease-in-out infinite" }}>
            ✦ &nbsp; добро пожаловать в космос &nbsp; ✦
          </div>
          <button
            onClick={e => { e.stopPropagation(); handleFirstInteraction(); }}
            style={{
              background:"linear-gradient(135deg,rgba(88,28,135,.75),rgba(109,40,217,.55))",
              border:"1px solid rgba(192,132,252,.5)", borderRadius:999,
              padding:"22px 56px", color:"#f0e6ff", fontSize:15, fontWeight:700,
              fontFamily:"'Montserrat',sans-serif", letterSpacing:3, cursor:"pointer",
              animation:"btnPulse 2.5s ease-in-out infinite, drift 4s ease-in-out infinite",
              backdropFilter:"blur(12px)", textTransform:"uppercase",
              transition:"transform .1s, background .2s", pointerEvents:"all",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(109,40,217,.9),rgba(139,92,246,.7))"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg,rgba(88,28,135,.75),rgba(109,40,217,.55))"; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(.95)"; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          >
            кликай ногтями дуре
          </button>
          <div style={{ color:"rgba(160,120,220,.3)", fontSize:12, letterSpacing:6, animation:"starPulse 4s ease-in-out infinite 1s" }}>✦ &nbsp; ✦ &nbsp; ✦</div>
        </div>
      )}

      {showMessage && (
        <div
          onClick={e => { e.stopPropagation(); handleMessageClick(); }}
          style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, cursor:"pointer", opacity:msgOpacity }}
        >
          <div style={{
            color:"#f0e8ff", fontSize:"clamp(24px,4.5vw,58px)",
            fontFamily:"'Cormorant Garamond',serif", fontWeight:300, fontStyle:"italic",
            textAlign:"center", maxWidth:720, lineHeight:1.6, padding:"0 32px",
            animation: msgOpacity > 0.5 ? "textGlow 2.5s ease-in-out infinite, fadeInUp 1.2s ease-out forwards" : "none",
            letterSpacing:1,
          }}>
            сияй ярче звёзд —<br />это твой день
          </div>
          <div style={{ color:"rgba(192,132,252,.4)", fontSize:10, letterSpacing:5, textTransform:"uppercase", marginTop:40, animation:"starPulse 2s ease-in-out infinite" }}>
            нажми чтобы продолжить
          </div>
        </div>
      )}

      {showBtn2 && (
        <button
          onClick={e => { e.stopPropagation(); handleGoBack(); }}
          style={{
            position:"absolute", left:"50%", bottom:48,
            transform:"translateX(-50%)",
            background:"rgba(10,2,30,.7)",
            border:"1px solid rgba(168,85,247,.5)", borderRadius:999,
            padding:"14px 36px", color:"rgba(220,180,255,.9)", fontSize:12,
            fontFamily:"'Montserrat',sans-serif", letterSpacing:4, cursor:"pointer",
            backdropFilter:"blur(16px)", textTransform:"uppercase",
            animation:"btnPulse 3s ease-in-out infinite, btn2In .8s ease-out forwards",
            transition:"transform .15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-50%) scale(1.05)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateX(-50%) scale(1)"; }}
        >
          ← вернуться к солнечной системе
        </button>
      )}
    </div>
  );
}