/**
 * Optional station sounds, synthesized in the browser: no audio file is
 * downloaded. Off until the person turns it on, and never started without a
 * gesture, as browsers require.
 */
const STORAGE_KEY = "guteneo.experience.sound";
const listeners = new Set<() => void>();
let enabled = false;
let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let lastFlap = 0;

try {
  enabled = localStorage.getItem(STORAGE_KEY) === "on";
} catch {
  enabled = false;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!context) {
    const Constructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Constructor) return null;
    context = new Constructor();
  }
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context.state === "running" ? context : null;
}

function noiseBuffer(current: AudioContext): AudioBuffer {
  if (noise) return noise;
  const length = Math.floor(current.sampleRate * 0.05);
  noise = current.createBuffer(1, length, current.sampleRate);
  const data = noise.getChannelData(0);
  for (let index = 0; index < length; index += 1)
    data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2;
  return noise;
}

function burst(
  current: AudioContext,
  frequency: number,
  gain: number,
  when = current.currentTime,
) {
  const source = current.createBufferSource();
  source.buffer = noiseBuffer(current);
  const filter = current.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 1.4;
  const level = current.createGain();
  level.gain.value = gain;
  source.connect(filter).connect(level).connect(current.destination);
  source.start(when);
}

/** One flap landing. A cascading board is thinned to a believable rattle. */
export function flapSound(): void {
  if (!enabled) return;
  const now = performance.now();
  if (now - lastFlap < 22) return;
  lastFlap = now;
  const current = audio();
  if (current) burst(current, 2200 + Math.random() * 1400, 0.05);
}

/** The ticket punch: a low thud followed by the die closing. */
export function punchSound(): void {
  const current = audio();
  if (!current) return;
  burst(current, 260, 0.5);
  burst(current, 3200, 0.16, current.currentTime + 0.045);
}

/** A two-note arrival chime of our own. */
export function chimeSound(): void {
  const current = audio();
  if (!current) return;
  [659.25, 880].forEach((frequency, index) => {
    const start = current.currentTime + index * 0.2;
    const oscillator = current.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const level = current.createGain();
    level.gain.setValueAtTime(0.0001, start);
    level.gain.exponentialRampToValueAtTime(0.11, start + 0.02);
    level.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    oscillator.connect(level).connect(current.destination);
    oscillator.start(start);
    oscillator.stop(start + 1);
  });
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
  } catch {
    // The choice still applies to this visit.
  }
  if (value) chimeSound();
  for (const listener of listeners) listener();
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
