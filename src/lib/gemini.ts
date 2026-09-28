import { GEMINI_RESPONSE_SCHEMA } from "@/lib/ai/schema";
import { buildSystemPrompt } from "@/lib/ai/prompts";

/**
 * Server-side Gemini client (free tier: Flash models only).
 *  - GEMINI_API_KEY is read from process.env on the SERVER only —
 *    it is never exposed via NEXT_PUBLIC_* or sent to the browser.
 *  - Plain fetch against the REST API: zero added SDK dependencies.
 *  - 8.5 s abort keeps us inside Vercel's 10 s function timeout.
 *  - One retry with backoff on 429/503 (free-tier RPM bursts).
 */

const TIMEOUT_MS = 8500;
const DEFAULT_MODEL = "gemini-2.0-flash";

export interface GeminiOk {
  ok: true;
  jsonText: string;
  model: string;
  latencyMs: number;
  tokens: { prompt: number; candidates: number } | null;
}

export interface GeminiErr {
  ok: false;
  code:
    | "GEMINI_KEY_MISSING"
    | "GEMINI_RATE_LIMITED"
    | "GEMINI_TIMEOUT"
    | "GEMINI_ERROR";
  message: string;
}

export function getGeminiConfig(): { key: string; model: string } | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return { key, model: process.env.GEMINI_MODEL || DEFAULT_MODEL };
}

export async function generateCommandJson(
  userText: string
): Promise<GeminiOk | GeminiErr> {
  const config = getGeminiConfig();
  if (!config) {
    return {
      ok: false,
      code: "GEMINI_KEY_MISSING",
      message:
        "GEMINI_API_KEY is not set on the server. Get a free key at aistudio.google.com and add it to .env.local (or Vercel env vars), then restart/redeploy.",
    };
  }

  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  };

  const started = Date.now();
  let lastError: GeminiErr = {
    ok: false,
    code: "GEMINI_ERROR",
    message: "Gemini request failed.",
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.key,
          },
          body: JSON.stringify(body),
        }
      );

      if (res.status === 429 || res.status === 503) {
        lastError = {
          ok: false,
          code: "GEMINI_RATE_LIMITED",
          message:
            "Gemini free-tier rate limit hit — wait a few seconds and try again.",
        };
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        lastError = {
          ok: false,
          code: "GEMINI_ERROR",
          message: `Gemini API error ${res.status}: ${detail.slice(0, 200)}`,
        };
        break; // non-retryable
      }

      const data = await res.json();
      const jsonText: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonText) {
        lastError = {
          ok: false,
          code: "GEMINI_ERROR",
          message: "Gemini returned an empty completion.",
        };
        break;
      }

      const usage = data?.usageMetadata;
      return {
        ok: true,
        jsonText,
        model: config.model,
        latencyMs: Date.now() - started,
        tokens: usage
          ? {
              prompt: usage.promptTokenCount ?? 0,
              candidates: usage.candidatesTokenCount ?? 0,
            }
          : null,
      };
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        lastError = {
          ok: false,
          code: "GEMINI_TIMEOUT",
          message: "Gemini took too long to respond — try a shorter command.",
        };
        break;
      }
      lastError = {
        ok: false,
        code: "GEMINI_ERROR",
        message: `Gemini request failed: ${(e as Error).message}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return lastError;
}
