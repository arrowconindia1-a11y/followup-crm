import { after } from "next/server";
import { NextRequest } from "next/server";
import { processWebhookPayload } from "@/lib/whatsapp-webhook";

/**
 * Meta WhatsApp Cloud API webhook — SANDBOX test number.
 * GET  = subscription verification handshake.
 * POST = events; we ack 200 immediately (Meta retries otherwise) and
 *        process via Next `after()`.
 */

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token && token === expected) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);

  after(async () => {
    try {
      await processWebhookPayload(payload);
    } catch (e) {
      console.error("[whatsapp-webhook]", (e as Error).message);
    }
  });

  // Always ack quickly — Meta retries non-200 responses.
  return new Response("EVENT_RECEIVED", { status: 200 });
}
