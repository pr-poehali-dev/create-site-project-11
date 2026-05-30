import { useEffect, useRef, useState, useCallback } from "react";

type Scene = "solar" | "flying" | "darkness" | "message" | "meteor" | "unknown";

interface Star {
  x: number; y: number; r: number; opacity: number; speed: number; twinkleOffset: number;
}
interface Planet {
  x: number; y: number; radius: number; color: string; orbitRadius: number; angle: number; speed: number; glowColor: string; moons?: Moon[];
}
interface Moon {
  orbitRadius: number; angle: number; speed: number; radius: number; color: string;
}
interface Meteor {
  x: number; y: number; vx: number; vy: number; len: number; opacity: number; active: boolean;
}

function playClickSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

function createAmbientMusic(ctx: AudioContext): () => void {
  const nodes: AudioNode[] = [];
  const freqs = [55, 82.4, 110, 146.8, 196];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = ctx.createDelay(2);
    const delayGain = ctx.createGain();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = freq;
    delay.delayTime.value = 0.8 + i * 0.3;
    delayGain.gain.value = 0.3;
    gain.gain.value = 0.035 / (i + 1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(ctx.destination);
    osc.start();
    nodes.push(osc, gain);
  });
  return () => nodes.forEach(n => { try { (n as OscillatorNode).stop?.(); n.disconnect(); } catch (_e) { void _e; } });
}

function generateStars(count: number, w: number, h: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: Math.random() * 1.8 + 0.2,
    opacity: Math.random() * 0.6 + 0.4,
    speed: Math.random() * 0.3 + 0.1,
    twinkleOffset: Math.random() * Math.PI * 2,
  }));
}

function generatePlanets(cx: number, cy: number): Planet[] {
  const configs = [
    { orbitR: 80, r: 8, color: "#b5a9ff", glow: "#7c6fff", speed: 0.008 },
    { orbitR: 130, r: 14, color: "#9b59b6", glow: "#6c3483", speed: 0.005 },
    { orbitR: 190, r: 11, color: "#8e44ad", glow: "#4a235a", speed: 0.003 },
    { orbitR: 260, r: 18, color: "#5b2c8d", glow: "#2e1065", speed: 0.002 },
    { orbitR: 340, r: 9, color: "#d7bde2", glow: "#9b59b6", speed: 0.0015 },
    { orbitR: 420, r: 7, color: "#7d3c98", glow: "#4a235a", speed: 0.001 },
  ];
  return configs.map((c, i) => ({
    x: cx, y: cy,
    radius: c.r,
    color: c.color,
    orbitRadius: c.orbitR,
    angle: (i / configs.length) * Math.PI * 2,
    speed: c.speed,
    glowColor: c.glow,
    moons: i === 3 ? [
      { orbitRadius: 28, angle: 0, speed: 0.02, radius: 4, color: "#c39bd3" },
      { orbitRadius: 40, angle: Math.PI, speed: 0.012, radius: 3, color: "#a569bd" },
    ] : undefined,
  }));
}

function generateUnknownPlanets(cx: number, cy: number): Planet[] {
  const configs = [
    { orbitR: 90, r: 12, color: "#1a0a2e", glow: "#7c3aed", speed: 0.004 },
    { orbitR: 160, r: 7, color: "#2d1b69", glow: "#a855f7", speed: 0.006 },
    { orbitR: 230, r: 20, color: "#0f0a1e", glow: "#6d28d9", speed: 0.002 },
    { orbitR: 310, r: 10, color: "#3b1f7a", glow: "#c084fc", speed: 0.003 },
    { orbitR: 390, r: 6, color: "#1e1047", glow: "#8b5cf6", speed: 0.005 },
  ];
  return configs.map((c, i) => ({
    x: cx, y: cy,
    radius: c.r,
    color: c.color,
    orbitRadius: c.orbitR,
    angle: (i / configs.length) * Math.PI * 2,
    speed: c.speed,
    glowColor: c.glow,
    moons: i === 2 ? [
      { orbitRadius: 35, angle: 1, speed: 0.015, radius: 5, color: "#7c3aed" },
    ] : undefined,
  }));
}

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene>("solar");
  const [scene, setScene] = useState<Scene>("solar");
  const [showButton, setShowButton] = useState(true);
  const [showMessage, setShowMessage] = useState(false);
  const [messageOpacity, setMessageOpacity] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopMusicRef = useRef<(() => void) | null>(null);
  const animRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const planetsRef = useRef<Planet[]>([]);
  const unknownPlanetsRef = useRef<Planet[]>([]);
  const flyProgressRef = useRef(0);
  const darknessTimerRef = useRef(0);
  const meteorBigRef = useRef({ progress: 0, active: false });
  const unknownMeteorsRef = useRef<Meteor[]>([]);
  const timeRef = useRef(0);

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
      stopMusicRef.current = createAmbientMusic(audioCtxRef.current);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let w = canvas.width, h = canvas.height;
    let cx = w / 2, cy = h / 2;

    starsRef.current = generateStars(300, w, h);
    planetsRef.current = generatePlanets(cx, cy);
    unknownPlanetsRef.current = generateUnknownPlanets(cx * 1.1, cy * 0.9);

    function makeMeteor(): Meteor {
      const side = Math.floor(Math.random() * 2);
      return {
        x: side === 0 ? -50 : w + 50,
        y: Math.random() * h * 0.7,
        vx: side === 0 ? (1.5 + Math.random() * 3) : -(1.5 + Math.random() * 3),
        vy: 0.5 + Math.random() * 1.5,
        len: 50 + Math.random() * 100,
        opacity: 0.5 + Math.random() * 0.5,
        active: Math.random() > 0.6,
      };
    }
    unknownMeteorsRef.current = Array.from({ length: 8 }, makeMeteor);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      w = canvas.width; h = canvas.height;
      cx = w / 2; cy = h / 2;
      starsRef.current = generateStars(300, w, h);
      planetsRef.current = generatePlanets(cx, cy);
      unknownPlanetsRef.current = generateUnknownPlanets(cx * 1.1, cy * 0.9);
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
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    function drawSun(ctx: CanvasRenderingContext2D, scx: number, scy: number, t: number) {
      const pulse = 1 + 0.05 * Math.sin(t * 0.02);
      const grad = ctx.createRadialGradient(scx, scy, 0, scx, scy, 40 * pulse);
      grad.addColorStop(0, "#fff8e1");
      grad.addColorStop(0.3, "#ffe082");
      grad.addColorStop(0.7, "#ff8f00");
      grad.addColorStop(1, "rgba(255,100,0,0)");
      ctx.beginPath();
      ctx.arc(scx, scy, 40 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowBlur = 60;
      ctx.shadowColor = "#ff8f00";
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, pcx: number, pcy: number, alpha = 1) {
      const px = pcx + Math.cos(p.angle) * p.orbitRadius;
      const py = pcy + Math.sin(p.angle) * p.orbitRadius;
      ctx.beginPath();
      ctx.arc(pcx, pcy, p.orbitRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(120,80,180,${0.12 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      const grad = ctx.createRadialGradient(px - p.radius * 0.3, py - p.radius * 0.3, 0, px, py, p.radius);
      grad.addColorStop(0, p.color + "ff");
      grad.addColorStop(1, p.glowColor + "cc");
      ctx.beginPath();
      ctx.arc(px, py, p.radius, 0, Math.PI * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = grad;
      ctx.shadowBlur = 25;
      ctx.shadowColor = p.glowColor;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      if (p.moons) {
        p.moons.forEach(m => {
          const mx = px + Math.cos(m.angle) * m.orbitRadius;
          const my = py + Math.sin(m.angle) * m.orbitRadius;
          ctx.beginPath();
          ctx.arc(mx, my, m.radius, 0, Math.PI * 2);
          ctx.fillStyle = m.color;
          ctx.globalAlpha = alpha * 0.75;
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      }
    }

    function drawMeteorSmall(ctx: CanvasRenderingContext2D, m: Meteor) {
      if (!m.active) return;
      const ax = m.vx / Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      const ay = m.vy / Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - ax * m.len, m.y - ay * m.len);
      grad.addColorStop(0, `rgba(200,160,255,${m.opacity})`);
      grad.addColorStop(1, "rgba(200,160,255,0)");
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - ax * m.len, m.y - ay * m.len);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function loop() {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d")!;
      timeRef.current++;
      const t = timeRef.current;
      const cur = sceneRef.current;

      ctx.clearRect(0, 0, w, h);

      if (cur === "solar") {
        ctx.fillStyle = "#060010";
        ctx.fillRect(0, 0, w, h);
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
        ctx.fillStyle = "#060010";
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1 + fp * 5, 1 + fp * 5);
        ctx.translate(-cx, -cy);
        drawStars(ctx, t, 1 - fp * 0.7);
        planetsRef.current.forEach(p => {
          p.angle += p.speed * 0.5;
          drawPlanet(ctx, p, cx, cy, 1 - fp);
        });
        drawSun(ctx, cx, cy, t);
        ctx.restore();
        ctx.fillStyle = `rgba(0,0,0,${fp * 0.97})`;
        ctx.fillRect(0, 0, w, h);
        if (fp >= 0.999) {
          sceneRef.current = "darkness";
          setScene("darkness");
          darknessTimerRef.current = t;
        }
      }

      if (cur === "darkness") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        if (t - darknessTimerRef.current > 240) {
          sceneRef.current = "message";
          setScene("message");
          setShowMessage(true);
          let op = 0;
          const fade = setInterval(() => {
            op += 0.015;
            setMessageOpacity(Math.min(op, 1));
            if (op >= 1) clearInterval(fade);
          }, 40);
        }
      }

      if (cur === "message") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, 0.15);
      }

      if (cur === "meteor") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, 0.1);
        const mb = meteorBigRef.current;
        mb.progress += 0.016;
        const p = Math.min(mb.progress, 1);
        const r = p * Math.max(w, h) * 1.8;
        const grd = ctx.createRadialGradient(w * 0.6, h * 0.3, 0, w * 0.6, h * 0.3, r);
        grd.addColorStop(0, `rgba(40,5,80,${Math.min(p * 1.5, 1)})`);
        grd.addColorStop(0.3, `rgba(80,20,140,${p * 0.9})`);
        grd.addColorStop(0.7, `rgba(30,5,60,${p * 0.6})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(w * 0.6, h * 0.3, r, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.fillStyle = `rgba(0,0,0,${p * p})`;
        ctx.fillRect(0, 0, w, h);
        if (p >= 0.98) {
          sceneRef.current = "unknown";
          setScene("unknown");
          setShowMessage(false);
        }
      }

      if (cur === "unknown") {
        const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
        bg.addColorStop(0, "#0d0520");
        bg.addColorStop(0.5, "#07021a");
        bg.addColorStop(1, "#020008");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        drawStars(ctx, t, 0.9);
        unknownPlanetsRef.current.forEach(p => {
          p.angle += p.speed;
          if (p.moons) p.moons.forEach(m => { m.angle += m.speed; });
          drawPlanet(ctx, p, cx * 1.1, cy * 0.9);
        });
        const sunPulse = 25 + 4 * Math.sin(t * 0.025);
        const sg = ctx.createRadialGradient(cx * 1.1, cy * 0.9, 0, cx * 1.1, cy * 0.9, sunPulse * 2);
        sg.addColorStop(0, "#e8d5ff");
        sg.addColorStop(0.4, "#9b59b6");
        sg.addColorStop(1, "rgba(80,0,140,0)");
        ctx.beginPath();
        ctx.arc(cx * 1.1, cy * 0.9, sunPulse, 0, Math.PI * 2);
        ctx.fillStyle = sg;
        ctx.shadowBlur = 70;
        ctx.shadowColor = "#a855f7";
        ctx.fill();
        ctx.shadowBlur = 0;
        unknownMeteorsRef.current.forEach((m, i) => {
          if (!m.active) {
            if (Math.random() < 0.004) m.active = true;
            return;
          }
          m.x += m.vx;
          m.y += m.vy;
          drawMeteorSmall(ctx, m);
          if (m.x > w + 120 || m.x < -120 || m.y > h + 120) {
            const side = Math.floor(Math.random() * 2);
            unknownMeteorsRef.current[i] = {
              x: side === 0 ? -50 : w + 50,
              y: Math.random() * h * 0.7,
              vx: side === 0 ? (1.5 + Math.random() * 3) : -(1.5 + Math.random() * 3),
              vy: 0.5 + Math.random() * 1.5,
              len: 50 + Math.random() * 100,
              opacity: 0.5 + Math.random() * 0.5,
              active: false,
            };
          }
        });
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
      stopMusicRef.current?.();
    };
  }, []);

  function handleClick() {
    initAudio();
    if (audioCtxRef.current) playClickSound(audioCtxRef.current);
    setShowButton(false);
    sceneRef.current = "flying";
    setScene("flying");
    flyProgressRef.current = 0;
  }

  function handleMessageClick() {
    sceneRef.current = "meteor";
    setScene("meteor");
    meteorBigRef.current = { progress: 0, active: true };
  }

  const glowAnim = `
    @keyframes textGlow {
      0%, 100% { text-shadow: 0 0 20px #c084fc, 0 0 50px #9333ea, 0 0 100px #6d28d9; opacity: 0.9; }
      50% { text-shadow: 0 0 40px #e879f9, 0 0 90px #a855f7, 0 0 140px #7c3aed; opacity: 1; }
    }
    @keyframes btnPulse {
      0%, 100% { box-shadow: 0 0 20px rgba(168,85,247,0.5), 0 0 50px rgba(139,92,246,0.2), inset 0 0 20px rgba(168,85,247,0.1); }
      50% { box-shadow: 0 0 40px rgba(192,132,252,0.8), 0 0 90px rgba(168,85,247,0.4), inset 0 0 30px rgba(192,132,252,0.2); }
    }
    @keyframes starPulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes subtleDrift {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
  `;

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      background: "#000", position: "relative",
      fontFamily: "'Montserrat', sans-serif", cursor: "crosshair"
    }}>
      <style>{glowAnim}</style>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />

      {showButton && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28,
        }}>
          <div style={{
            color: "rgba(200,160,255,0.45)",
            fontSize: 11, letterSpacing: 6, textTransform: "uppercase",
            animation: "starPulse 3s ease-in-out infinite",
          }}>
            ✦ &nbsp; добро пожаловать в космос &nbsp; ✦
          </div>
          <button
            onClick={handleClick}
            style={{
              background: "linear-gradient(135deg, rgba(88,28,135,0.75) 0%, rgba(109,40,217,0.55) 100%)",
              border: "1px solid rgba(192,132,252,0.5)",
              borderRadius: 999,
              padding: "22px 56px",
              color: "#f0e6ff",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "'Montserrat', sans-serif",
              letterSpacing: 3,
              cursor: "pointer",
              animation: "btnPulse 2.5s ease-in-out infinite, subtleDrift 4s ease-in-out infinite",
              backdropFilter: "blur(12px)",
              textTransform: "uppercase",
              transition: "transform 0.1s, background 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(109,40,217,0.9) 0%, rgba(139,92,246,0.7) 100%)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, rgba(88,28,135,0.75) 0%, rgba(109,40,217,0.55) 100%)";
            }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.95)"; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          >
            кликай ногтями дуре
          </button>
          <div style={{ color: "rgba(160,120,220,0.3)", fontSize: 12, letterSpacing: 6, animation: "starPulse 4s ease-in-out infinite 1s" }}>
            ✦ &nbsp; ✦ &nbsp; ✦
          </div>
        </div>
      )}

      {showMessage && (
        <div
          onClick={handleMessageClick}
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
            gap: 12, cursor: "pointer",
            opacity: messageOpacity,
          }}
        >
          <div style={{
            color: "#f0e8ff",
            fontSize: "clamp(24px, 4.5vw, 58px)",
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontStyle: "italic",
            textAlign: "center",
            maxWidth: 720,
            lineHeight: 1.6,
            padding: "0 32px",
            animation: messageOpacity > 0.5
              ? "textGlow 2.5s ease-in-out infinite, fadeInUp 1.2s ease-out forwards"
              : "none",
            letterSpacing: 1,
          }}>
            сияй ярче звёзд —<br />это твой день
          </div>
          <div style={{
            color: "rgba(192,132,252,0.4)",
            fontSize: 10,
            letterSpacing: 5,
            textTransform: "uppercase",
            marginTop: 40,
            animation: "starPulse 2s ease-in-out infinite",
          }}>
            нажми чтобы продолжить
          </div>
        </div>
      )}
    </div>
  );
}