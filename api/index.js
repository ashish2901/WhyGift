const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Groq } = require('groq-sdk');

dotenv.config();

// Vercel Serverless Adaptation: Use console.log for cloud logs
function log(msg) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
}

const app = express();
app.use(cors());
app.use(express.json());

// Main entry route
app.get('/', (req, res) => res.send('WhyGift AI API is running on Vercel!'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// NOTE: sessions are in-memory and will reset on serverless cold starts.
const sessions = {};

const INITIAL_CONTEXT = {
  stage: 'entry',
  relation: '',
  occasion: '',
  desired_feeling: '',
  conveyed_emotion: '',
  gift_intent: '',
  interests: [],
  personality: [],
  gifting_frequency: '',
  budget_style: '',
  preference_style: '',
  uncertainty: '',
  notes: '',
  recipient_summary: '',
  intent_summary: '',
  directions: [],
  confidence: 0,
  confidence_boost: '',
  ai_confidence: null
};

function deepMerge(target, source) {
  if (!source) return target;
  for (const key in source) {
    if (source[key] instanceof Object && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function calculateConfidence(context) {
  let s = 0;
  if (context.relation) s += 15;
  if (context.occasion) s += 15;
  if (context.desired_feeling) s += 15;
  if (context.gift_intent) s += 15;
  if (context.budget_style) s += 10;
  if (context.interests && context.interests.length > 0) s += 10;
  if (context.personality && context.personality.length > 0) s += 10;
  if (context.preference_style) s += 10;
  return Math.min(Math.max(s, 0), 100);
}

function tryJSONParse(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            try {
                return JSON.parse(text.substring(start, end + 1));
            } catch (e2) {
                throw new Error("Could not repair JSON response");
            }
        }
        throw e;
    }
}

/**
 * Bulletproof Groq Call with timeouts and fallbacks
 */
async function safeGroqCall(messages, options = {}) {
    const isDiscovery = options.isDiscovery || false;
    const models = isDiscovery ? 
        ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'] : 
        ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    
    let lastError = null;
    for (const model of models) {
        try {
            log(`Attempting AI call with model: ${model}`);
            
            // 8 Second safety timeout for Vercel Hobby (max 10s)
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('TIMEOUT')), 8000)
            );

            const completionPromise = groq.chat.completions.create({
                messages,
                model,
                temperature: options.temperature || 0.0,
                response_format: { type: "json_object" }
            });

            const completion = await Promise.race([completionPromise, timeoutPromise]);
            const rawContent = completion.choices[0].message.content;
            return tryJSONParse(rawContent);
            
        } catch (err) {
            lastError = err;
            log(`WARN: Model ${model} failed: ${err.message}`);
            if (err.message === 'TIMEOUT' || err.status === 429) continue;
            throw err;
        }
    }
    throw new Error(`STABILITY_ERROR: ${lastError.message}`);
}

const SYSTEM_PROMPT = `
You are WhyGift — an AI Gift Co-Thinker.
Role: Thoughtful, warm, and highly intelligent personal gifting assistant.
Goal: Map user intent to gift directions via an 8-step discovery flow.

### DISCOVERY FLOW (STRICT SEQUENCE):
1. Relationship
2. Occasion
3. Primary Emotional Intent
4. Underlying Gift Purpose
5. Recipient Interests
6. Recipient Personality
7. Gifting Preference
8. Budget Style

INSTRUCTIONS:
- ONE-SHOT: Extract ALL info from user message. Skip redundant steps.
- NEVER REPEAT: Don't ask what's already in the context.
- OPTIONS: Provide 4-6 chips for EVERY question.

FORMAT:
{
  "text": "acknowledgment + next question",
  "suggested_options": ["Option 1", "Option 2", "..."],
  "contextUpdate": { ... },
  "readyForDirections": false
}
`;

const DIRECTIONS_PROMPT = `
You are the WhyGift Decision Engine. Generate 3-5 gift directions based on context.
Connect Emotional Intent and Purpose to your reasoning.
FORMAT: { "recipient_summary": "...", "directions": [{ "title": "...", "reasoning": "..." }] }
`;

app.post('/chat', async (req, res) => {
  try {
    let { message, session_id = 'default', contextOverride, isReset, generateDirections } = req.body;
    
    if (isReset) {
      sessions[session_id] = JSON.parse(JSON.stringify(INITIAL_CONTEXT));
      return res.json({ success: true });
    }

    if (!sessions[session_id]) sessions[session_id] = JSON.parse(JSON.stringify(INITIAL_CONTEXT));
    let context = sessions[session_id];
    if (contextOverride) context = deepMerge(context, contextOverride);

    let llmResText = "";
    let suggestedOptions = [];

    if (message && message.trim()) {
      const llmRes = await safeGroqCall([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `Current Context: ${JSON.stringify(context)}` },
          { role: 'user', content: message }
      ], { temperature: 0.0, isDiscovery: true });

      llmResText = llmRes.text;
      suggestedOptions = llmRes.suggested_options || [];
      if (llmRes.contextUpdate) context = deepMerge(context, llmRes.contextUpdate);
      if (llmRes.readyForDirections) generateDirections = true;
    }
    
    let readiness = calculateConfidence(context);
    context.confidence = readiness;

    if (generateDirections || (readiness >= 75 && context.directions.length === 0)) {
        try {
            const rJS = await safeGroqCall([
                { role: 'system', content: DIRECTIONS_PROMPT },
                { role: 'system', content: `Context: ${JSON.stringify(context)}` }
            ], { temperature: 0.1 });
            if (rJS.directions) context.directions = rJS.directions;
            if (rJS.recipient_summary) context.recipient_summary = rJS.recipient_summary;
        } catch (e) { log(`Reasoning failed: ${e.message}`); }
    }

    sessions[session_id] = context;
    res.json({ response: llmResText, context, suggested_options: suggestedOptions });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    res.status(500).json({ error: 'The AI is taking a momentary break. Please try clicking "Retry" or refresh the page.' });
  }
});

module.exports = app;
