// Synthesizes the game's sound effects into src/Server and src/Guess (16-bit mono, 22050 Hz).
import fs from "node:fs";

const RATE = 22050;

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}

/** Notes: [startSec, durSec, freqStart, freqEnd, wave, volume] mixed together. */
function synth(len, notes) {
  const out = new Float32Array(Math.round(len * RATE));
  for (const [start, dur, f0, f1, wave, vol] of notes) {
    let phase = 0;
    const n = Math.round(dur * RATE);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      phase += ((f0 + (f1 - f0) * t) / RATE) * 2 * Math.PI;
      const env = Math.min(1, i / 60) * (1 - t) ** 2; // quick attack, smooth decay
      const v = wave === "square" ? Math.sign(Math.sin(phase)) * 0.5 : wave === "tri" ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase);
      const j = Math.round(start * RATE) + i;
      if (j < out.length) out[j] += v * env * vol;
    }
  }
  return [...out];
}

const sounds = {
  correct: synth(0.5, [[0, 0.12, 784, 784, "tri", 0.45], [0.1, 0.12, 988, 988, "tri", 0.45], [0.2, 0.3, 1319, 1319, "sine", 0.45]]),
  close: synth(0.25, [[0, 0.1, 440, 520, "tri", 0.35], [0.1, 0.15, 520, 470, "tri", 0.3]]),
  tick: synth(0.06, [[0, 0.05, 1800, 1500, "square", 0.18]]),
  turnstart: synth(0.6, [[0, 0.15, 392, 392, "square", 0.22], [0.12, 0.15, 523, 523, "square", 0.22], [0.24, 0.35, 659, 784, "tri", 0.4]]),
  roundend: synth(0.9, [[0, 0.25, 659, 659, "tri", 0.4], [0.2, 0.25, 523, 523, "tri", 0.4], [0.4, 0.5, 392, 330, "tri", 0.4]]),
};
const where = { correct: ["Server", "Guess"], close: ["Guess"], tick: ["Server"], turnstart: ["Server"], roundend: ["Server"] };
for (const [name, s] of Object.entries(sounds))
  for (const dir of where[name]) {
    fs.mkdirSync(`src/${dir}`, { recursive: true });
    fs.writeFileSync(`src/${dir}/${name}.wav`, wav(s));
  }
console.log("wrote", Object.keys(sounds).join(", "));
