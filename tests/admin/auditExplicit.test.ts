import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/admin/audit-context", () => ({
  getAdminAuditActor: mocks.actor,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}));

import { logAudit } from "@/lib/admin/repos/audit";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockReturnValue("admin@dealstack.test");
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert });
});

describe("explicit audit for tables without the transactional trigger", () => {
  it("preserves the existing actor short-circuit for ordinary callers", async () => {
    await logAudit({
      actorEmail: "admin@dealstack.test",
      action: "update",
      tableName: "stores",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("writes when a catalogue action explicitly opts in", async () => {
    await logAudit({
      actorEmail: "admin@dealstack.test",
      action: "update",
      tableName: "gift_card_products",
      rowId: "tcn-shop",
      forceExplicit: true,
    });
    expect(mocks.from).toHaveBeenCalledWith("audit_log");
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_email: "admin@dealstack.test",
        action: "update",
        table_name: "gift_card_products",
        row_id: "tcn-shop",
      }),
    );
  });
});
