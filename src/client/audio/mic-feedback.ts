import { getReplyAudioContext } from "./state";

const START_DELAY_MS = 130;

export function getMicStartDelayMs(): number {
  return START_DELAY_MS;
}

export function playMicStartSignal(): void {
  playToneSequence([
    { frequency: 520, offsetMs: 0, durationMs: 42, gain: 0.032 },
    { frequency: 780, offsetMs: 48, durationMs: 76, gain: 0.026 },
  ]);
}

export function playMicEndSignal(): void {
  playToneSequence([
    { frequency: 420, offsetMs: 0, durationMs: 44, gain: 0.025 },
    { frequency: 260, offsetMs: 48, durationMs: 66, gain: 0.018 },
  ]);
}

export function pulseMicHaptic(): void {
  if (!("vibrate" in navigator)) {
    return;
  }

  try {
    navigator.vibrate(18);
  } catch {
    // Haptics are optional and can be blocked by browser settings.
  }
}

function playToneSequence(
  tones: Array<{
    frequency: number;
    offsetMs: number;
    durationMs: number;
    gain: number;
  }>,
): void {
  const audioContext = getReplyAudioContext();

  if (!audioContext) {
    return;
  }

  void audioContext.resume().catch(() => undefined);

  for (const tone of tones) {
    playTone(audioContext, tone);
  }
}

function playTone(
  audioContext: AudioContext,
  {
    frequency,
    offsetMs,
    durationMs,
    gain,
  }: {
    frequency: number;
    offsetMs: number;
    durationMs: number;
    gain: number;
  },
): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const startTime = audioContext.currentTime + offsetMs / 1_000;
  const endTime = startTime + durationMs / 1_000;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
  oscillator.addEventListener(
    "ended",
    () => {
      oscillator.disconnect();
      gainNode.disconnect();
    },
    { once: true },
  );
}
