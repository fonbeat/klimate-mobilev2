import { ApiError } from './api.ts';

export type AlertSound = 'monitorDown' | 'probeDown';
export type AlertSoundPreferences = Record<AlertSound, boolean> & { vibrate: boolean };
export const defaultAlertSounds: AlertSoundPreferences = { monitorDown: true, probeDown: true, vibrate: true };
export type SoundCue = { play: string; cursor: string; message?: string };
export type AlertEventPage = { cursor: string; hasMore: boolean; events: { id: string; type: string }[] };
export type ForegroundAlertResponse = SoundCue | AlertEventPage;
const eventPath = '/v3/status/alertEvents';

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
  private legacy = false;
  private outages = new Set<AlertSound>();
  private read: (path: string) => Promise<ForegroundAlertResponse>;
  private preferences: () => AlertSoundPreferences;
  private play: (sound: AlertSound, current: () => boolean) => Promise<void>;

  constructor(
    read: (path: string) => Promise<ForegroundAlertResponse>,
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
    this.outages.clear();
    this.legacy = false;
  }

  async poll() {
    if (!this.active || this.pending) return;
    this.pending = true;
    const generation = this.generation;
    const current = () => this.active && this.generation === generation;
    try {
      if (!this.legacy) {
        try {
          await this.pollEvents(current);
          return;
        } catch (error) {
          if (!current()) return;
          if (error instanceof ApiError && error.code === 'ALERT_CURSOR_EXPIRED') {
            this.cursor = undefined;
            this.outages.clear();
            return;
          }
          if (this.cursor || !(error instanceof ApiError) || error.status !== 404) throw error;
          this.legacy = true;
        }
      }
      await this.pollLegacy(current);
    } catch {
      // Transient API/audio failures must not interrupt the current screen.
    } finally {
      if (current()) this.pending = false;
    }
  }

  private async pollEvents(current: () => boolean) {
    // Continuation pages share a server high-water mark. Retain the group if a
    // later page fails or a large batch needs more than one polling interval.
    for (let page = 0; page < 5; page++) {
      const previous = this.cursor;
      const result = await this.read(eventPath + (previous ? '?cursor=' + encodeURIComponent(previous) : ''));
      if (!current() || !('events' in result) || !result.cursor || result.cursor === previous) return;
      this.cursor = result.cursor;
      if (!previous) return;
      for (const event of result.events) {
        if (event.type === 'monitorDown' || event.type === 'probeDown') this.outages.add(event.type);
      }
      if (result.hasMore) continue;
      const preferences = this.preferences();
      const ordered = (['probeDown', 'monitorDown'] as const).filter((sound) => this.outages.has(sound));
      this.outages.clear();
      const cue = ordered.find((sound) => preferences[sound]) ?? (preferences.vibrate ? ordered[0] : undefined);
      if (cue) await this.play(cue, current);
      return;
    }
  }

  private async pollLegacy(current: () => boolean) {
    const previous = this.cursor;
    const cue = await this.read('/v2/status/sound' + (previous ? '?since=' + encodeURIComponent(previous) : ''));
    if (!current() || !('play' in cue) || !Number.isFinite(Date.parse(cue.cursor))) return;
    if (previous && Date.parse(cue.cursor) <= Date.parse(previous)) return;
    this.cursor = cue.cursor;
    if (previous && (cue.play === 'monitorDown' || cue.play === 'probeDown')) {
      const preferences = this.preferences();
      if (preferences[cue.play] || preferences.vibrate) await this.play(cue.play, current);
    }
  }
}
