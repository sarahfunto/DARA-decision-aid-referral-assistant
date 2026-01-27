// server.js (ESM / "type": "module")
import 'dotenv/config';
import { safeArray, toText } from './utils.js';

import express from 'express';
import cors from 'cors';

import { runDecisionEngine } from './decisionEngine.js';
import { generateExplanation } from './llmExplain.js';

console.log('✅ RUNNING server.js (DARA) — ALWAYS 200 /cases');

const app = express();

// -------------------------
// CORS (for demo)
// -------------------------
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / tools / file:// (origin === null)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // IMPORTANT: do not throw; return error to CORS middleware
      return callback(new Error('CORS blocked origin: ' + origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

app.use(express.json({ limit: '1mb' }));

// -------------------------
// Handle invalid JSON bodies gracefully (prevent Express default 400)
// -------------------------
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('❌ Invalid JSON body:', err.message);
    return res.status(200).json({
      fallback: true,
      error: 'Invalid JSON body (cannot parse).',
      llm_status: 'error',
      llm_explanation: 'Request body was not valid JSON. Returning fallback response.',
    });
  }
  return next(err);
});

// -------------------------
// Health check
// -------------------------
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    name: 'DARA backend',
    port: Number(process.env.PORT || 3001),
  });
});

// -------------------------
// Main endpoint: ALWAYS returns 200
// -------------------------
app.post('/cases', async (req, res) => {
  console.log('➡️ HIT /cases');

  const payload = req.body || {};

  // 1) Deterministic decision ALWAYS first
  let decisionResult;
  try {
    decisionResult = runDecisionEngine(payload);
  } catch (err) {
    console.error('❌ Decision engine error:', err);
    return res.status(200).json({
      fallback: true,
      error: err?.message || 'Decision engine error',
      llm_status: 'skipped',
      llm_explanation: 'Decision engine failed. No LLM call was made.',
    });
  }

  // 2) LLM explanation NEVER blocks /cases
  let llm_explanation =
    'GenAI explanation disabled (OPENAI_API_KEY not set). Returning deterministic decision only.';
  let llm_status = 'disabled';

  // Optional demo switch: set LLM_ENABLED=false to skip LLM even if key exists
  const llmEnabled = process.env.LLM_ENABLED !== 'false';

  if (llmEnabled && process.env.OPENAI_API_KEY) {
    llm_status = 'ok';
    try {
      llm_explanation = await generateExplanation({
        pathway: decisionResult.pathway,
        age: payload.patient_age,
        score: decisionResult.priority_score ?? decisionResult.score,
        recommendation: decisionResult.triage, // ✅ matches llmExplain.js
        reasons: safeArray(decisionResult.reasons),
        missingInfo: safeArray(decisionResult.missing_info),
      });
    } catch (e) {
      // Any OpenAI error (429/quota/etc) is swallowed into a fallback explanation
      const msg = toText(e);
      console.error('⚠️ LLM error (ignored):', msg);

      llm_status = 'error';
      llm_explanation =
        'GenAI explanation unavailable right now (quota/limit). ' +
        'Showing deterministic decision output only.';
    }
  }

  // ✅ ALWAYS 200
  return res.status(200).json({
    ...decisionResult,
    llm_status,
    llm_explanation,
  });
});

// -------------------------
// Global error handler (catch anything else) — ALWAYS 200
// -------------------------
app.use((err, req, res, next) => {
  console.error('❌ GLOBAL ERROR HANDLER:', err);
  return res.status(200).json({
    fallback: true,
    error: err?.message || String(err),
    llm_status: 'error',
    llm_explanation: 'Unhandled server error. Returning fallback response.',
  });
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ DARA backend running on http://localhost:${PORT}`);
  console.log(`✅ CORS allowed origins: ${allowedOrigins.join(', ')}`);
});
