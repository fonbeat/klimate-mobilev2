export type AlertSound = 'monitorDown' | 'probeDown';
export type AlertSoundPreferences = Record<AlertSound, boolean> & { vibrate: boolean };
export const defaultAlertSounds: AlertSoundPreferences = { monitorDown: true, probeDown: true, vibrate: true };
export type SoundCue = { play: string; cursor: string; message?: string };

export function parseAlertSounds(saved: string | null): AlertSoundPreferences {
  try {
    const value = JSON.parse(saved ?? '{}');
    return {
      monitorDown: typeof value?.monitorDown === 'boolean' ? value.monitorDown : true,
      probeDown: typeof value?.probeDown === 'boolean' ? value.probeDown : true,
      vibrate: typeof value?.vibrate === 'boolean' ? value.vibrate : true,
    };
  } catch { return { ...defaultAlertSounds }; }
}

export function isOutagePush(data: Record<string, unknown> = {}) {
  return data.type === 'monitor_down' || data.type === 'probe_offline' || data.type === 'gateway_offline';
}

// One cursor per foreground session. Never replay a backlog on launch/resume.
export class AlertSoundController {
  private generation = 0;
  private active = false;
  private pending = false;
  private cursor?: string;
  private read: (path: string) => Promise<SoundCue>;
  private preferences: () => AlertSoundPreferences;
  private play: (sound: AlertSound, current: () => boolean) => Promise<void>;

  constructor(
    read: (path: string) => Promise<SoundCue>,
    preferences: () => AlertSoundPreferences,
    play: (sound: AlertSound, current: () => boolean) => Promise<void>,
  ) { this.read = read; this.preferences = preferences; this.play = play; }

  resume() {
    this.pause();
    this.active = true;
    return this.poll();
  }

  pause() {
    this.active = false;
    this.generation++;
    this.pending = false;
    this.cursor = undefined;
  }

  async poll() {
    if (!this.active || this.pending) return;
    this.pending = true;
    const generation = this.generation;
    const current = () => this.active && this.generation === generation;
    const previous = this.cursor;
    try {
      const cue = await this.read(`/v2/status/sound${previous ? `?since=${encodeURIComponent(previous)}` : ''}`);
      if (!current() || !Number.isFinite(Date.parse(cue.cursor))) return;
      if (previous && Date.parse(cue.cursor) <= Date.parse(previous)) return;
      // Consume even muted/recovery cues, so enabling sound never replays them.
      this.cursor = cue.cursor;
      if (previous && (cue.play === 'monitorDown' || cue.play === 'probeDown')) {
        const preferences = this.preferences();
        if (preferences[cue.play] || preferences.vibrate) await this.play(cue.play, current);
      }
    } catch {
      // Transient API/audio failures must not interrupt the current screen.
    } finally {
      if (current()) this.pending = false;
    }
  }
}
