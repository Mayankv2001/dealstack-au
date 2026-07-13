import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import type { AlertOutboxRow } from "./repo";

export interface EmailDeliveryConfig {
  endpoint: string;
  token: string | null;
}

export interface EmailDeliveryPayload {
  to: string;
  template: "dealstack-confirm-alert" | "dealstack-current-alert";
  data: Record<string, unknown>;
}

export function buildEmailDeliveryPayload(row: AlertOutboxRow): EmailDeliveryPayload {
  return {
    to: row.recipient_email,
    template: row.message_kind === "confirmation" ? "dealstack-confirm-alert" : "dealstack-current-alert",
    data: row.payload,
  };
}

export async function deliverAlertEmail(row: AlertOutboxRow, config: EmailDeliveryConfig, fetcher: typeof fetch = fetch): Promise<void> {
  const endpoint = safeHttpsUrl(config.endpoint);
  if (!endpoint) throw new Error("Email delivery endpoint must be a safe HTTPS URL.");
  const headers = new Headers({ "Content-Type": "application/json" });
  if (config.token) headers.set("Authorization", `Bearer ${config.token}`);
  const response = await fetcher(endpoint, { method: "POST", headers, body: JSON.stringify(buildEmailDeliveryPayload(row)), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Email delivery returned HTTP ${response.status}.`);
}
