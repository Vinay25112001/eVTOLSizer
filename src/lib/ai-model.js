/* =====================================================================
   WHICH MODEL THE AI FEATURES CALL — one decision, in one place
   =====================================================================
   THE MODEL ID WAS WRITTEN OUT IN THREE PLACES and two of them named a
   model Groq had already switched off, so the assistant answered every
   question with

       AI 404: The model `llama-3.1-8b-instant` does not exist or you do
       not have access to it.

   The error is two claims joined by "or", and the first one is the true
   one: Groq DECOMMISSIONED it. From their own deprecations page —

       llama-3.1-8b-instant    shut down 16 Aug 2026 -> openai/gpt-oss-20b
       llama-3.3-70b-versatile shut down 16 Aug 2026 -> openai/gpt-oss-120b

   so the IDs below are Groq's OWN documented replacements rather than a
   guess at a similar-sounding model. Both are on the FREE plan: 30
   requests/min, 1,000/day, 8,000 tokens/min, 200,000 tokens/day.

   NOTHING HERE IS PERMANENT, AND THE FILE IS BUILT ON THAT ASSUMPTION.
   Groq retires models on a schedule and has done so repeatedly —
   `qwen/qwen3.6-27b` was replaced about a month after it appeared. Their
   policy distinguishes PRODUCTION models, which get "a clear migration
   path and recommended replacement model", from PREVIEW models, which
   "may be discontinued at short notice"; these two are production. What
   this module buys is that the next retirement is a one-line edit here
   instead of three edits plus whatever prose quotes the name, and that
   `describeModelError` turns the failure into something a user can act
   on rather than a raw 404.
   ===================================================================== */

/* FAST is the conversational path — short summaries, chat turns, the
   regulatory check. LARGE is for the one call that asks for structured
   JSON across a whole component category, where the small model's
   formatting is not reliable enough. */
export const GROQ_MODEL_FAST = "openai/gpt-oss-20b";
export const GROQ_MODEL_LARGE = "openai/gpt-oss-120b";

/* What to show a human next to the answer. Kept here so a label can
   never name a different model from the one that produced the text —
   the failure this module exists to prevent, in its cosmetic form. */
export const GROQ_MODEL_LABEL = {
  [GROQ_MODEL_FAST]: "GPT-OSS 20B via Groq",
  [GROQ_MODEL_LARGE]: "GPT-OSS 120B via Groq",
};

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";

/* Turn a failed call into a sentence that says what to do about it.

   A decommissioned model and an unfunded key produce the SAME HTTP 404
   from Groq, with "does not exist or you do not have access to it", so
   the message alone cannot tell a user which of the two happened. This
   asks the API which models the key CAN reach and reports that, which
   separates the two cases: a list that comes back means the key is fine
   and the model is gone. */
export async function describeModelError(status, bodyText, apiKey) {
  const modelGone = status === 404 || /does not exist|do not have access/i.test(bodyText || "");
  if (!modelGone)
    return `The AI service returned ${status}. ${(bodyText || "").slice(0, 200)}`;

  let available = null;
  try {
    const r = await fetch(GROQ_MODELS_ENDPOINT, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (r.ok) {
      const j = await r.json();
      available = (j.data || []).map((m) => m.id).filter(Boolean).sort();
    }
  } catch { /* offline, or the key cannot list models; fall through */ }

  if (available && available.length)
    return `This build asks for a model your API key cannot reach — most likely one Groq has `
         + `retired. Your key currently has: ${available.join(", ")}. Set the ID in `
         + `src/lib/ai-model.js to one of those.`;
  return `The model this build asks for is unavailable, and the key could not list what it `
       + `can reach — so either the key is invalid or the service is unreachable. `
       + `Groq's deprecations page lists current replacements.`;
}
