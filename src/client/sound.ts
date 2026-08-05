export type AlertMode = "beep" | "voice" | "both";

export interface AlertConfig {
  enabled: boolean;
  threshold: number;
  mode: AlertMode;
  repeat: number;
}

export interface AlertEvent {
  agent: string;
  model: string;
  timestamp: number;
  cost: number;
}

export function agentLabel(agent: string): string {
  switch (agent) {
    case "claude-code":
      return "Claude Code";
    case "opencode":
      return "OpenCode";
    case "codex":
      return "Codex";
    default:
      return agent;
  }
}

export function dollarsAndCents(n: number): string {
  const whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);
  if (whole === 0 && cents === 0) return "nothing";
  if (whole === 0) return `${cents} ${cents === 1 ? "cent" : "cents"}`;
  const wholePart = `${whole} ${whole === 1 ? "dollar" : "dollars"}`;
  if (cents === 0) return wholePart;
  return `${wholePart} and ${cents} ${cents === 1 ? "cent" : "cents"}`;
}

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

export function playBeep(freq = 880, duration = 0.28, volume = 0.4, delay = 0): void {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}

/** Two descending square-wave blips — the signature "money on fire" sound. */
export function playAnnoyingBeep(): void {
  playBeep(880, 0.25, 0.4);
  playBeep(660, 0.3, 0.4, 0.28);
}

export function stopSpeaking(): void {
  try {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

export function speak(text: string, { rate = 1.05, volume = 1 }: { rate?: number; volume?: number } = {}): void {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.volume = volume;
  const voices = speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /en[-_]US/i.test(v.lang) && /samantha|allison|ava/i.test(v.name)) ??
    voices.find((v) => /en[-_]US/i.test(v.lang));
  if (preferred) u.voice = preferred;
  speechSynthesis.speak(u);
}

function announce(event: AlertEvent, cfg: AlertConfig): void {
  const line = `${agentLabel(event.agent)} just spent ${dollarsAndCents(event.cost)}.`;
  const repeats = Math.max(1, Math.min(cfg.repeat || 1, 3));
  for (let i = 0; i < repeats; i++) {
    speak(line, { rate: 1.05 + i * 0.12 });
  }
}

/** Speak/beep once for a single event that crossed the threshold. */
export function fireAlert(event: AlertEvent, cfg: AlertConfig): void {
  stopSpeaking();
  if (cfg.mode !== "voice") playAnnoyingBeep();
  if (cfg.mode !== "beep") announce(event, cfg);
}

/** Announce the most expensive agent name using a sample event, for the Test button. */
export function testAlert(cfg: AlertConfig): void {
  fireAlert(
    {
      agent: "opencode",
      model: "test",
      timestamp: Date.now(),
      cost: Math.max(cfg.threshold, 0.01),
    },
    cfg,
  );
}
