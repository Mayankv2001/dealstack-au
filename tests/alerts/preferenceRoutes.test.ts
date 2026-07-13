import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const confirmEmailAlert = vi.hoisted(() => vi.fn());
const unsubscribeEmailAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/alerts/repo", () => ({ confirmEmailAlert, unsubscribeEmailAlert }));
vi.mock("@/lib/env", () => ({ emailAlertTokenSecret: () => "test-token-secret", siteUrl: () => "https://app.example" }));

import { GET as confirm } from "@/app/api/alerts/confirm/route";
import { GET as unsubscribe } from "@/app/api/alerts/unsubscribe/route";

beforeEach(() => {
  confirmEmailAlert.mockReset();
  unsubscribeEmailAlert.mockReset();
});

describe("email alert confirmation and unsubscribe routes", () => {
  const token = "a".repeat(43);

  it("confirms one pending subscription", async () => {
    confirmEmailAlert.mockResolvedValue(true);
    const response = await confirm(new NextRequest(`https://app.example/api/alerts/confirm?token=${token}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/alerts?status=confirmed");
    expect(confirmEmailAlert).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it("honours unsubscribe links even without a public account", async () => {
    unsubscribeEmailAlert.mockResolvedValue(true);
    const response = await unsubscribe(new NextRequest(`https://app.example/api/alerts/unsubscribe?token=${token}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/alerts?status=unsubscribed");
    expect(unsubscribeEmailAlert).toHaveBeenCalledOnce();
  });

  it("does not query persistence for malformed tokens", async () => {
    const response = await confirm(new NextRequest("https://app.example/api/alerts/confirm?token=short"));
    expect(response.headers.get("location")).toContain("status=invalid");
    expect(confirmEmailAlert).not.toHaveBeenCalled();
  });
});
