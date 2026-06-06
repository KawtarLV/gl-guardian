// Server-only AI helpers — all calls route through Lovable AI Gateway.
// Never import from client code.
import { GL_CATEGORIES, CATEGORY_HINTS_DUTCH, type GlCategory } from "./categories";

const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

function lovableKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY is not set");
  return k;
}

async function callLovable(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(LOVABLE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey(),
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached — please retry in a moment");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Workspace → Usage");
    throw new Error(`Lovable AI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "") as string;
}

// Embeddings are not used in the current flow. Callers wrap this in try/catch
// and fall back to the rule engine + AI classification path.
export async function embedText(_text: string): Promise<number[]> {
  throw new Error("Embeddings disabled — using rule engine + AI fallback instead");
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export interface AiClassification {
  category: GlCategory;
  confidence: number;
  reasoning: string;
  needs_review: boolean;
}

export async function classifyAccount(
  description: string,
  accountNumber?: string | null,
): Promise<AiClassification> {
  const system = `You classify general ledger accounts from Dutch and English construction-company bookkeeping into a fixed taxonomy.
Allowed categories (return EXACTLY one): ${GL_CATEGORIES.join(", ")}.
${CATEGORY_HINTS_DUTCH}
Rules:
- Primary signal is the account DESCRIPTION (not the number).
- Output strict JSON ONLY (no prose, no code fences): {"category": "<one of allowed>", "confidence": 0.0-1.0, "reasoning": "<short>", "needs_review": true|false}.
- needs_review must be true when confidence < 0.75.
- Never invent a category; if unsure use "Other".`;

  const user = `Account number: ${accountNumber ?? "(none)"}
Description: ${description}`;

  const content = await callLovable({
    model: DEFAULT_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  // Strip code fences if the model added them
  const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  const jsonStr = jsonStart >= 0 ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;

  let raw: { category?: string; confidence?: number; reasoning?: string; needs_review?: boolean };
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    raw = {};
  }
  const category = (GL_CATEGORIES as readonly string[]).includes(raw.category ?? "")
    ? (raw.category as GlCategory)
    : ("Other" as GlCategory);
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  return {
    category,
    confidence,
    reasoning: String(raw.reasoning ?? ""),
    needs_review: confidence < 0.75 || !!raw.needs_review,
  };
}

export async function chatCompletion(
  system: string,
  user: string,
  opts: { model?: string; temperature?: number } = {},
): Promise<string> {
  return await callLovable({
    model: opts.model ?? DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
}

/** Legacy helper kept for compatibility with universal-parser.functions.ts. */
export async function lovableAi(
  prompt: string,
  opts: { model?: string; system?: string; temperature?: number } = {},
): Promise<string | null> {
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  try {
    return await callLovable({
      model: opts.model ?? DEFAULT_MODEL,
      messages,
      temperature: opts.temperature ?? 0,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes("LOVABLE_API_KEY is not set")) return null;
    throw e;
  }
}
