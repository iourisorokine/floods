// Tiny retro sound effects with WebAudio (no audio files needed)
import { CONFIG } from "./config.ts";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

let ac: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (!CONFIG.SOUND) return null;
  if (!ac) {
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return null;
      ac = new Ctor();
    } catch {
      return null;
    }
  }
  if (ac.state === "suspended") ac.resume();
  return ac;
}

function tone(
  freq: number,
  dur = 0.08,
  type: OscillatorType = "square",
  vol = 0.06,
  slideTo: number | null = null,
  delay = 0,
): void {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  move: () => tone(110, 0.04, "triangle", 0.04),
  buildStart: () => tone(220, 0.05, "square", 0.04),
  work: () => tone(150 + Math.random() * 40, 0.04, "triangle", 0.035),
  build: () => {
    tone(330, 0.06);
    tone(495, 0.08, "square", 0.06, null, 0.06);
  },
  remove: () => tone(400, 0.1, "square", 0.05, 200),
  blocked: () => tone(90, 0.12, "sawtooth", 0.05),
  tick: () => tone(880, 0.03, "square", 0.03),
  floodStart: () => {
    tone(220, 0.25, "sawtooth", 0.06, 110);
    tone(165, 0.35, "sawtooth", 0.05, 80, 0.25);
  },
  rise: () => tone(140, 0.3, "triangle", 0.08, 90),
  lost: () => tone(300, 0.25, "square", 0.05, 60),
  win: () =>
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.12, "square", 0.06, null, i * 0.12),
    ),
  lose: () =>
    [392, 330, 262, 196].forEach((f, i) =>
      tone(f, 0.16, "square", 0.06, null, i * 0.16),
    ),
};
