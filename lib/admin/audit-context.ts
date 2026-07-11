import { AsyncLocalStorage } from "node:async_hooks";

interface AdminAuditContext {
  actorEmail: string;
}

const storage = new AsyncLocalStorage<AdminAuditContext>();

/** Called only after the session and admins-table allowlist both succeed. */
export function setAdminAuditActor(actorEmail: string): void {
  storage.enterWith({ actorEmail: actorEmail.trim().toLowerCase() });
}

export function getAdminAuditActor(): string | null {
  return storage.getStore()?.actorEmail ?? null;
}

