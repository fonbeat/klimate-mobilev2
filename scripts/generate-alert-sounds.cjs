// Original, short two-note chimes. Re-run with Node to regenerate bundled WAVs.
const fs = require('node:fs');
const path = require('node:path');
const folder = path.join(__dirname, '../assets/sounds');
fs.mkdirSync(folder, { recursive: true });
function chime(name, notes) {
  const rate = 22050, duration = .7, frames = Math.ceil(rate * duration);
  const data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
  data.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    const sample = notes.reduce((sum, [frequency, start]) => {
      const age = t - start;
      if (age < 0) return sum;
      const envelope = Math.min(1, age / .012) * Math.exp(-age * 10) * Math.min(1, (duration - t) / .04);
      return sum + Math.sin(2 * Math.PI * frequency * age) * envelope * .24;
    }, 0);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(folder, name), data);
}
chime('monitor-down.wav', [[740, 0], [554, .18]]);
chime('gateway-down.wav', [[554, 0], [370, .2]]);
