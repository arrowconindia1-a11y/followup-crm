/**
 * WhatsApp Cloud API core — SANDBOX TEST NUMBER ONLY (Phase 4).
 *
 * Safety model (owner requirement: never touch a real Business number):
 *  1. Credentials come from SERVER env vars only.
 *  2. WHATSAPP_ALLOWED_RECIPIENTS is a fail-closed allowlist: with no
 *     allowlist entries, NO message can ever be sent — even if a
 *     production token were pasted by mistake.
 *  3. Sends additionally require an opted_in consent row.
 */

const DEFAULT_API_VERSION = "v23.0";

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  verifyToken: string | null;
  allowedRecipients: string[]; // normalized digit strings
  apiVersion: string;
}

/** Normalize to digits only: "+91 98100-12345" → "919810012345".
 *  Strips a leading 00 international prefix. Returns "" if no digits. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;

  const allowedRecipients = (process.env.WHATSAPP_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((s) => normalizePhone(s))
    .filter((s) => s.length >= 8);

  return {
    token,
    phoneNumberId,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
    allowedRecipients,
    apiVersion: process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION,
  };
}

/** Fail-closed: empty allowlist blocks everything. */
export function isRecipientAllowed(
  toDigits: string,
  allowedRecipients: string[]
): boolean {
  if (!toDigits || allowedRecipients.length === 0) return false;
  return allowedRecipients.includes(toDigits);
}

export const STOP_KEYWORDS = [
  "stop",
  "unsubscribe",
  "opt out",
  "optout",
  "opt-out",
  "cancel messages",
];

export const REOPTIN_KEYWORDS = ["start", "yes", "subscribe", "opt in", "optin"];

export function classifyInbound(body: string): "stop" | "restart" | "normal" {
  const text = body.trim().toLowerCase();
  if (STOP_KEYWORDS.some((k) => text === k || text.startsWith(`${k} `))) return "stop";
  if (REOPTIN_KEYWORDS.some((k) => text === k)) return "restart";
  return "normal";
}

export type SendResult =
  | { ok: true; wamid: string }
  | { ok: false; code: string; message: string };

/** Send a plain text message via the Cloud API (test number). */
export async function sendWhatsAppText(
  cfg: WhatsAppConfig,
  toDigits: string,
  body: string
): Promise<SendResult> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toDigits,
          type: "text",
          text: { body },
        }),
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const err = data?.error;
      return {
        ok: false,
        code: `WHATSAPP_SEND_FAILED_${res.status}`,
        message: err?.message ?? `Cloud API error ${res.status}`,
      };
    }

    const wamid: string | undefined = data?.messages?.[0]?.id;
    if (!wamid) {
      return {
        ok: false,
        code: "WHATSAPP_NO_WAMID",
        message: "Cloud API accepted the request but returned no message id.",
      };
    }
    return { ok: true, wamid };
  } catch (e) {
    return {
      ok: false,
      code: "WHATSAPP_NETWORK_ERROR",
      message: (e as Error).message,
    };
  }
}
