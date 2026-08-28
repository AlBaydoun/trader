import type { Signal } from "../types";

export function playSignalTone(signal: Signal): void {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = signal.direction === "buy" ? "sine" : "triangle";
  oscillator.frequency.value = signal.direction === "buy" ? 740 : 420;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.38);
}

export function speakSignal(signal: Signal): void {
  if (!("speechSynthesis" in window) || signal.direction === "hold") return;
  const utterance = new SpeechSynthesisUtterance(
    `${signal.symbol} ${signal.direction} signal. Confidence ${Math.round(signal.confidence * 100)} percent.`
  );
  utterance.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
