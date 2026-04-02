const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Groq } = require('groq-sdk');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const sessions = {};

const LOG_FILE = path.join(__dirname, 'debug.log');
function log(msg) {
    const timestamp = new Date().toISOString();
    try {
        // Vercel file system is read-only, but logging for compatibility
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch (e) { }
    console.log(`[${timestamp}] ${msg}`);
}

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
  if (context.relation) s += 20;
  if (context.occasion) s += 20;
  if (context.gift_intent) s += 20;
  if (context.interests && context.interests.length > 0) s += 10;
  if (context.personality && context.personality.length > 0) s += 10;
  if (context.preference_style) s += 10;
  if (context.budget_style) s += 5;
  if (context.desired_feeling || context.conveyed_emotion || context.notes) s += 5;
  return Math.min(Math.max(s, 0), 100);
}

function tryJSONParse(text) {
    try { return JSON.parse(text); }
    catch (e) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            try { return JSON.parse(text.substring(start, end + 1)); }
            catch (e2) { throw new Error("Could not repair JSON response"); }
        }
        throw e;
    }
}

async function safeGroqCall(messages, options = {}) {
    const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    let lastError = null;
    for (const model of models) {
        try {
            const completion = await groq.chat.completions.create({
                messages,
                model,
                temperature: options.temperature || 0.0,
                response_format: { type: "json_object" }
            });
            return tryJSONParse(completion.choices[0].message.content);
        } catch (err) {
            lastError = err;
            continue;
        }
    }
    throw new Error(`AI_UNAVAILABLE: ${lastError.message}`);
}

const SYSTEM_PROMPT = `
You are WhyGift — an AI Gift Co-Thinker.
Role: You are a thoughtful AI co-thinker and a warm but intelligent personal assistant. You are emotionally aware, structured, and trust-building.
Goal: Help users understand the recipient, clarify their emotional intent, map intent to a gift direction, and provide confidence and reasoning.

SAFETY & BOUNDARY RULES (CRITICAL):
- NEVER suggest gifts that harm: humans, animals, or environment.
- NEVER suggest: illegal, dangerous, unethical, or exploitative items or experiences.

### INSTRUCTIONS FOR AI COMPANION (STRICT):
1. **ANALYZE**: Listen carefully to the user's latest response.
2. **UPDATE**: Map user information to the correct JSON field in contextUpdate.
3. **NEVER REPEAT**: Check the "Current Context" string. If a field is already filled, move to the NEXT one in the list (1-8). Do NOT ask the same question again.
4. **THOUGHTFUL NEXT STEP**: Respond with 1-2 sentences. 
   - Flow: 1: Relation | 2: Occasion | 3: Intent/Purpose | 4: Interests | 5: Personality | 6: Style | 7: Budget | 8: Feeling/Notes

JSON FORMAT:
{
  "text": "A brief acknowledgment + next direct question.",
  "suggested_options": ["Option 1", "Option 2"],
  "contextUpdate": { "relation": "...", "occasion": "...", "desired_feeling": "...", "gift_intent": "...", "interests": [], "personality": [], "preference_style": "...", "notes": "..." },
  "readyForDirections": false
}
`;

const DIRECTIONS_PROMPT = `
You are the WhyGift Decision Engine. Generate personalized gift directions.
JSON RESPONSE SCHEMA (STRICT):
{
  "recipient_summary": "Summary of who they are.",
  "intent_summary": "Summary of emotional goal.",
  "confidence_boost": "Affirming sentence.",
  "confidence_score": 85,
  "directions": [{ "title": "...", "reasoning": "..." }]
}
`;

app.post('/api/chat', async (req, res) => {
  try {
    let { message, session_id = 'default', contextOverride, isReset, generateDirections } = req.body;
    if (isReset) { sessions[session_id] = JSON.parse(JSON.stringify(INITIAL_CONTEXT)); return res.json({ success: true }); }
    if (!sessions[session_id]) sessions[session_id] = JSON.parse(JSON.stringify(INITIAL_CONTEXT));
    let context = sessions[session_id];
    if (contextOverride) context = deepMerge(context, contextOverride);

    let llmResText = "";
    let suggestedOptions = [];

    if (message && message.trim()) {
      log(`[${session_id}] MSG: ${message}`);
      const llmRes = await safeGroqCall([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `Current Context: ${JSON.stringify(context)}` },
          { role: 'user', content: message }
      ]);
      llmResText = llmRes.text;
      suggestedOptions = llmRes.suggested_options || [];
      if (llmRes.contextUpdate) context = deepMerge(context, llmRes.contextUpdate);
      if (llmRes.readyForDirections) generateDirections = true;
    }
    
    let readiness = calculateConfidence(context);
    if (!context.ai_confidence) context.confidence = readiness;

    if (generateDirections || readiness >= 75) {
        if (generateDirections) context.stage = 'hint';
        try {
            const rJS = await safeGroqCall([
                { role: 'system', content: DIRECTIONS_PROMPT },
                { role: 'system', content: `Context: ${JSON.stringify(context)}` }
            ], { temperature: 0.1 });
            if (rJS.directions) context.directions = rJS.directions;
            if (rJS.recipient_summary) context.recipient_summary = rJS.recipient_summary;
            if (rJS.intent_summary) context.intent_summary = rJS.intent_summary;
            if (rJS.confidence_boost) context.confidence_boost = rJS.confidence_boost;
            if (rJS.confidence_score !== undefined) context.confidence = rJS.confidence_score;
        } catch (e) { log(`Reasoning failed: ${e.message}`); }
    }

    sessions[session_id] = context;
    res.json({ response: llmResText, context, suggested_options: suggestedOptions });
  } catch (err) {
    log(`ERROR: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/feedback', (req, res) => res.json({ success: true }));
app.post('/api/analytics/log', (req, res) => res.json({ success: true }));

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => log(`Server running on ${PORT}`));
}

module.exports = app;
