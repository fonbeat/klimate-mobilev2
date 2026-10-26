import { serialQueue, sessionScope } from './session-authority.ts';
import type { Session } from './types';

export function singleFlightInstallation(read: () => Promise<string | null>, write: (id: string) => Promise<void>, create: () => string) {
  let pending: Promise<string> | undefined;
  return (allowCreate = true): Promise<string | null> => {
    if (pending) return pending;
    if (!allowCreate) return read();
    const operation = (async () => {
      const saved = await read();
      if (saved) return saved;
      const id = create();
      await write(id);
      return id;
    })();
    pending = operation;
    void operation.finally(() => { if (pending === operation) pending = undefined; }).catch(() => undefined);
    return operation;
  };
}

export type PendingPushRemoval = { scope: string; installationId: string };
export type PushLease = { current: () => boolean; session: () => Session };
type Options = {
  prepareTimeoutMs?: number;
  installation: (create?: boolean) => Promise<string | null>;
  load: () => Promise<PendingPushRemoval[]>;
  save: (pending: PendingPushRemoval[]) => Promise<void>;
  remove: (session: Session, installationId: string, current?: () => boolean) => Promise<void>;
};

/** The queue covers native token preparation and all device mutations. Logout
 * invalidates leases immediately, then deletes after any in-flight PUT. */
export class PushLifecycle {
  private session: Session | null = null;
  private generation = 0;
  private enqueue = serialQueue();
  private metadata = serialQueue();
  private options: Options;
  constructor(options: Options) { this.options = options; }
  private updatePending(update: (items: PendingPushRemoval[]) => PendingPushRemoval[]) {
    return this.metadata(async () => { await this.options.save(update(await this.options.load())); });
  }
  activate(session: Session | null) {
    if (sessionScope(session) !== sessionScope(this.session)) this.generation++;
    this.session = session;
  }
  capture(): PushLease {
    const generation = this.generation;
    const current = () => generation === this.generation && !!this.session;
    return { current, session: () => { if (!current()) throw new Error('The push session changed.'); return this.session!; } };
  }
  register(lease: PushLease, prepare: () => Promise<string>, put: (session: Session, installationId: string, token: string) => Promise<void>) {
    return this.enqueue(async () => {
      if (!lease.current()) return false;
      const token = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Push token preparation timed out. Please try again.')), this.options.prepareTimeoutMs ?? 15_000);
        void Promise.resolve().then(prepare).then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
      });
      if (!lease.current()) return false;
      const installationId = await this.options.installation();
      if (!installationId || !lease.current()) return false;
      const pending = await this.metadata(() => this.options.load());
      if (!lease.current()) return false;
      for (const removal of pending.filter((item) => item.scope === sessionScope(lease.session()))) {
        if (!lease.current()) return false;
        await this.options.remove(lease.session(), removal.installationId, lease.current);
        if (!lease.current()) return false;
        await this.updatePending((items) => items.filter((item) => item.scope !== removal.scope || item.installationId !== removal.installationId));
      }
      if (!lease.current()) return false;
      await put(lease.session(), installationId, token);
      // The API binds one owner per installation. A successful PUT supersedes
      // old-owner cleanup for this installation without using another user's token.
      await this.updatePending((items) => lease.current() ? items.filter((item) => item.installationId !== installationId) : items);
      return lease.current();
    });
  }
  retire(session: Session) {
    // Persist logout intent without waiting for native token/network work. If the
    // app is terminated with an old PUT in flight, cleanup is still remembered.
    const intent = this.metadata(async () => {
      const installationId = await this.options.installation(false);
      if (!installationId) return null;
      const scope = sessionScope(session);
      const pending = await this.options.load();
      if (!pending.some((item) => item.scope === scope && item.installationId === installationId)) await this.options.save([...pending, { scope, installationId }]);
      return installationId;
    });
    void intent.catch(() => undefined);
    return this.enqueue(async () => {
      const installationId = await intent;
      if (!installationId) return;
      const scope = sessionScope(session);
      // DELETE is idempotent. Retry transient failures once, before remote logout.
      try { await this.options.remove(session, installationId); }
      catch { await this.options.remove(session, installationId); }
      await this.updatePending((pending) => pending.filter((item) => item.scope !== scope || item.installationId !== installationId));
    });
  }
}
