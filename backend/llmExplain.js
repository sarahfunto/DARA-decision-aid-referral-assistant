// llmExplain.js
import OpenAI from "openai";

/**
 * Modes:
 * - LLM_ENABLED=false            -> LLM disabled
 * - LLM_ENABLED=true + LLM_MODE=demo -> demo explanation (no API call)
 * - LLM_ENABLED=true + LLM_MODE=live -> real OpenAI call
 *
 * Returned shape:
 * {
 *   enabled: boolean,
 *   mode: "disabled" | "demo" | "live" | "fallback",
 *   explanation: string | null
 * }
 */
const LLM_ENABLED = process.env.LLM_ENABLED === "true";
const LLM_MODE = process.env.LLM_MODE || "disabled"; // demo | live | disabled

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function generateExplanation({
  pathway,
  age,
  score,
  recommendation,
  reasons = [],
  missingInfo = [],
}) {
  // -------------------------
  // LLM DISABLED
  // -------------------------
  if (!LLM_ENABLED) {
    return {
      enabled: false,
      mode: "disabled",
      explanation: null,
    };
  }

  // -------------------------
  // DEMO / MOCK MODE (NO API)
  // -------------------------
  if (LLM_MODE === "demo") {
    return {
      enabled: true,
      mode: "demo",
      explanation: `
This explanation is generated in DEMO mode (no API call).

Based on the confirmed clinical findings and patient context, the decision engine identified genetic red flags that may justify a referral for genetic counseling.

This explanation is provided for educational purposes only.
Final clinical decisions remain the responsibility of the physician.
      `.trim(),
    };
  }

  // -------------------------
  // LIVE MODE (OPENAI)
  // -------------------------
  try {
    const client = getClient();
    if (!client) {
      return {
        enabled: true,
        mode: "fallback",
        explanation: null,
      };
    }

    const prompt = `
You are a medical education assistant.
Explain the decision-support output clearly and briefly for a physician.

Pathway: ${pathway}
Patient age: ${age ?? "unknown"}
Score: ${score ?? "N/A"}
Recommendation: ${recommendation ?? "N/A"}

Reasons:
- ${reasons.join("\n- ") || "None"}

Missing information:
- ${missingInfo.join("\n- ") || "None"}

Do not give medical advice.
Do not diagnose.
Use a neutral, educational tone.
`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Educational explanation only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    return {
      enabled: true,
      mode: "live",
      explanation: resp.choices?.[0]?.message?.content?.trim() || null,
    };
  } catch (error) {
    // -------------------------
    // FALLBACK (quota / network / any error)
    // -------------------------
    return {
      enabled: true,
      mode: "fallback",
      explanation: null,
    };
  }
}
