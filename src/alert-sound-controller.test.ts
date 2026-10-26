import assert from 'node:assert/strict';
import test from 'node:test';
import { AlertSoundController, defaultAlertSounds, isOutagePush, parseAlertSounds, type AlertSound, type SoundCue } from './alert-sound-controller.ts';

const cursor = (n: number) => new Date(Date.UTC(2026, 9, 16, 12, 0, n)).toISOString();
function fixture(cues: SoundCue[]) {
  const paths: string[] = [], played: AlertSound[] = [];
  const preferences = { ...defaultAlertSounds };
  const controller = new AlertSoundController(async (path) => {
    paths.push(path);
    const cue = cues.shift();
    if (!cue) throw new Error('offline');
    return cue;
  }, () => preferences, async (sound, current) => { if (current() && preferences[sound]) played.push(sound); });
  return { controller, paths, played, preferences };
}

test('first poll is silent; new monitor and gateway outages use the server cursor, not client time', async () => {
  const f = fixture([
    { play: 'monitorDown', cursor: cursor(0) },
    { play: 'monitorDown', cursor: cursor(30) },
    { play: 'probeDown', cursor: cursor(60) },
    { play: 'monitorUp', cursor: cursor(90) },
    { play: 'none', cursor: cursor(120) },
  ]);
  await f.controller.resume();
  assert.deepEqual(f.played, []);
  for (let i = 0; i < 4; i++) await f.controller.poll();
  assert.deepEqual(f.played, ['monitorDown', 'probeDown']);
  assert.equal(f.paths[0], '/v2/status/sound');
  assert.equal(f.paths[1], `/v2/status/sound?since=${encodeURIComponent(cursor(0))}`);
});

test('muting consumes cues; repeated/older cursors do not replay; resume establishes a fresh baseline', async () => {
  const f = fixture([
    { play: 'none', cursor: cursor(0) },
    { play: 'monitorDown', cursor: cursor(30) },
    { play: 'monitorDown', cursor: cursor(30) },
    { play: 'probeDown', cursor: cursor(0) },
    { play: 'probeDown', cursor: cursor(60) },
    { play: 'probeDown', cursor: cursor(90) },
  ]);
  await f.controller.resume();
  f.preferences.monitorDown = false;
  await f.controller.poll();
  f.preferences.monitorDown = true;
  await f.controller.poll(); await f.controller.poll();
  assert.deepEqual(f.played, []);
  f.controller.pause();
  await f.controller.poll();
  assert.equal(f.paths.length, 4);
  await f.controller.resume();
  assert.equal(f.paths[4], '/v2/status/sound');
  assert.deepEqual(f.played, []);
  await f.controller.poll();
  assert.deepEqual(f.played, ['probeDown']);
});

test('backgrounding or changing organizations invalidates in-flight responses and prevents overlapping polls', async () => {
  let resolve!: (cue: SoundCue) => void;
  let reads = 0;
  const played: AlertSound[] = [];
  const controller = new AlertSoundController(() => {
    reads++;
    return new Promise((done) => { resolve = done; });
  }, () => defaultAlertSounds, async (sound) => { played.push(sound); });
  const initial = controller.resume();
  await controller.poll();
  assert.equal(reads, 1);
  resolve({ play: 'none', cursor: cursor(0) }); await initial;
  const pending = controller.poll();
  controller.pause();
  resolve({ play: 'probeDown', cursor: cursor(30) }); await pending;
  assert.deepEqual(played, []);
});

test('failed requests preserve the last cursor and invalid payloads cannot play sound', async () => {
  const paths: string[] = [], played: AlertSound[] = [];
  let step = 0;
  const controller = new AlertSoundController(async (path) => {
    paths.push(path);
    if (step++ === 1) throw new Error('offline');
    return step === 1 ? { play: 'none', cursor: cursor(0) } : { play: 'probeDown', cursor: 'invalid' };
  }, () => defaultAlertSounds, async (sound) => { played.push(sound); });
  await controller.resume(); await controller.poll(); await controller.poll();
  assert.equal(paths[1], paths[2]);
  assert.deepEqual(played, []);
});

test('saved preferences validate independently and only outage pushes delegate foreground sound', () => {
  assert.deepEqual(parseAlertSounds(null), defaultAlertSounds);
  assert.deepEqual(parseAlertSounds('bad'), defaultAlertSounds);
  assert.deepEqual(parseAlertSounds('{"monitorDown":false,"probeDown":"false"}'), { monitorDown: false, probeDown: true, vibrate: true });
  assert.deepEqual(parseAlertSounds('{"monitorDown":false,"probeDown":false}'), { monitorDown: false, probeDown: false, vibrate: true });
  assert.deepEqual(parseAlertSounds('{"vibrate":false}'), { monitorDown: true, probeDown: true, vibrate: false });
  assert.deepEqual(parseAlertSounds('{"vibrate":"false"}'), defaultAlertSounds);
  for (const type of ['monitor_down', 'probe_offline', 'gateway_offline']) assert.equal(isOutagePush({ type }), true);
  assert.equal(isOutagePush({ type: 'certificate_expiring' }), false);
  assert.equal(isOutagePush(), false);
});

test('a playback still preparing audio is cancelled when the foreground session ends', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0, played = 0;
  const controller = new AlertSoundController(async () => ({ play: reads++ ? 'probeDown' : 'none', cursor: cursor(reads * 30) }),
    () => defaultAlertSounds, async (_sound, current) => {
      entered(); await gate;
      if (current()) played++;
    });
  await controller.resume();
  const poll = controller.poll();
  await started;
  controller.pause();
  release(); await poll;
  assert.equal(played, 0);
});

test('vibration-only mode delivers new outage cues, not first-load, recovery, repeated or paused cues', async () => {
  let preferences = { monitorDown: false, probeDown: false, vibrate: true };
  const cues = [
    { play: 'probeDown', cursor: cursor(0) },
    { play: 'monitorDown', cursor: cursor(30) },
    { play: 'probeDown', cursor: cursor(60) },
    { play: 'probeDown', cursor: cursor(60) },
    { play: 'monitorUp', cursor: cursor(90) },
    { play: 'monitorDown', cursor: cursor(120) },
    { play: 'probeDown', cursor: cursor(150) },
  ];
  const feedback: AlertSound[] = [];
  const controller = new AlertSoundController(async () => cues.shift()!, () => preferences, async (sound) => { feedback.push(sound); });
  await controller.resume();
  for (let i = 0; i < 4; i++) await controller.poll();
  assert.deepEqual(feedback, ['monitorDown', 'probeDown']);
  preferences = { ...preferences, vibrate: false };
  await controller.poll();
  assert.equal(feedback.length, 2);
  preferences = { ...preferences, vibrate: true };
  await controller.poll();
  assert.deepEqual(feedback, ['monitorDown', 'probeDown', 'probeDown']);
  controller.pause(); await controller.poll();
  assert.equal(feedback.length, 3);
});
