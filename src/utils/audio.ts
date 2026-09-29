let audioCtx: AudioContext | null = null;

const CUSTOM_SOUND_KEY = 'kasir_custom_sound';

export function getCustomSound(): string | null {
  return localStorage.getItem(CUSTOM_SOUND_KEY);
}

export function setCustomSound(dataUrl: string) {
  localStorage.setItem(CUSTOM_SOUND_KEY, dataUrl);
}

export function clearCustomSound() {
  localStorage.removeItem(CUSTOM_SOUND_KEY);
}

export function playCustomSound(): boolean {
  const dataUrl = getCustomSound();
  if (!dataUrl) return false;
  try {
    const audio = new Audio(dataUrl);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function playNotificationOrCustomSound() {
  const dataUrl = getCustomSound();
  if (dataUrl) {
    try {
      const audio = new Audio(dataUrl);
      audio.volume = 0.5;
      audio.onerror = () => playNotificationSound();
      const p = audio.play();
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => playNotificationSound());
      }
      return;
    } catch {
      playNotificationSound();
      return;
    }
  }
  playNotificationSound();
}

export function initAudio() {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function doBeep() {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new Ctor();
    }
    if (audioCtx.state !== 'running') return;

    const now = audioCtx.currentTime;

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    gain1.gain.setValueAtTime(0.55, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.25);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(1174.66, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.22);

    gain2.gain.setValueAtTime(0.5, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);
  } catch (error) {
    console.warn("Audio gagal:", error);
  }
}

export function playNotificationSound() {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new Ctor();
    }

    // Context masih suspended (browser menunggu interaksi pengguna / resume async).
    // Resume lalu bunyikan segera setelah berjalan, plus retry cadangan.
    if (audioCtx.state === 'suspended') {
      const resumePromise = audioCtx.resume();
      if (resumePromise && typeof (resumePromise as Promise<void>).then === 'function') {
        (resumePromise as Promise<void>)
          .then(() => { if (audioCtx && audioCtx.state === 'running') doBeep(); })
          .catch(() => {});
      } else {
        setTimeout(() => { if (audioCtx && audioCtx.state === 'running') doBeep(); }, 150);
      }
      return;
    }

    doBeep();
  } catch (error) {
    console.warn("Audio gagal:", error);
  }
}
