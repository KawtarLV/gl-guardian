// Server-only OpenAI helpers. Never import from client code.
import { GL_CATEGORIES, CATEGORY_HINTS_DUTCH, type GlCategory } from "./categories";

const OPENAI_URL = "https://api.openai.com/v1";

function key() {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set");
  return k;
}

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${OPENAI_URL}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding as number[];
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
- Output strict JSON: {"category": "<one of allowed>", "confidence": 0.0-1.0, "reasoning": "<short>", "needs_review": true|false}.
- needs_review must be true when confidence < 0.75.
- Never invent a category; if unsure use "Other".`;

  const user = `Account number: ${accountNumber ?? "(none)"}
Description: ${description}`;

  const res = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI classify failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const raw = JSON.parse(data.choices[0].message.content);
  const category = GL_CATEGORIES.includes(raw.category) ? raw.category : "Other";
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
  const res = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? "gpt-4o-mini",
      temperature: opts.temperature ?? 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI chat failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

/** Call Lovable AI Gateway (default: Gemini 3 Flash). Returns null when LOVABLE_API_KEY is not set. */
export async function lovableAi(
  prompt: string,
  opts: { model?: string; system?: string; temperature?: number } = {},
): Promise<string | null> {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) return null;
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": k,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages,
      temperature: opts.temperature ?? 0,
    }),
  });
  if (!res.ok) throw new Error(`Lovable AI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}

// pgvector accepts a text representation like '[0.1,0.2,...]'
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
