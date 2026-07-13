import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/email-alerts/route";

const original = { secret: process.env.CRON_SECRET, enabled: process.env.EMAIL_ALERTS_ENABLED, delivery: process.env.EMAIL_ALERT_DELIVERY_ENABLED };

afterEach(() => {
  if (original.secret == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original.secret;
  if (original.enabled == null) delete process.env.EMAIL_ALERTS_ENABLED; else process.env.EMAIL_ALERTS_ENABLED = original.enabled;
  if (original.delivery == null) delete process.env.EMAIL_ALERT_DELIVERY_ENABLED; else process.env.EMAIL_ALERT_DELIVERY_ENABLED = original.delivery;
});

describe("email alert cron safety gate", () => {
  it("requires cron authentication", async () => {
    process.env.CRON_SECRET = "cron-test";
    const response = await GET(new Request("https://dealstack.test/api/cron/email-alerts"));
    expect(response.status).toBe(401);
  });

  it("performs no delivery while either switch is off", async () => {
    process.env.CRON_SECRET = "cron-test";
    process.env.EMAIL_ALERTS_ENABLED = "true";
    process.env.EMAIL_ALERT_DELIVERY_ENABLED = "false";
    const response = await GET(new Request("https://dealstack.test/api/cron/email-alerts", { headers: { Authorization: "Bearer cron-test" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ran: false, skipped: "disabled" });
  });
});
