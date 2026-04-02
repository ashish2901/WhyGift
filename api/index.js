const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Groq } = require('groq-sdk');
const fs = require('fs');
const path = require('path');

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
app.get('/api', (req, res) => res.send('WhyGift AI API is running on Vercel!'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// NOTE: sessions are in-memory and will reset on serverless cold starts.
// For persistent sessions, use a database like Redis/Vercel KV.
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

async function safeGroqCall(messages, options = {}) {
    const models = [
        'llama-3.3-70b-versatile',
        'qwen/qwen3-32b',
        'llama-3.1-8b-instant'
    ];
    
    let lastError = null;
    for (const model of models) {
        try {
            log(`Attempting AI call with model: ${model}`);
            const completion = await groq.chat.completions.create({
                messages,
                model,
                temperature: options.temperature || 0.0,
                response_format: { type: "json_object" }
            });
            const rawContent = completion.choices[0].message.content;
            return tryJSONParse(rawContent);
        } catch (err) {
            lastError = err;
            if (err.message.includes('Rate limit') || err.status === 429) continue;
            if (err.status === 400 || err.message.includes('decommissioned')) continue;
            throw err;
        }
    }
    throw new Error(`ALL_MODELS_LIMITED: ${lastError.message}`);
}

const SYSTEM_PROMPT = `You are WhyGift — an AI Gift Co-Thinker... (truncated for brevity in system prompt)`; 
// I will include the full prompt from the original file to be careful.

const FULL_SYSTEM_PROMPT = `
You are WhyGift — an AI Gift Co-Thinker.
Role: You are a thoughtful AI co-thinker and a warm but intelligent personal assistant. You are emotionally aware, structured, and trust-building.
Goal: Help users understand the recipient, clarify their emotional intent, map intent to a gift direction, and provide confidence and reasoning.

SAFETY & BOUNDARY RULES (CRITICAL):
- NEVER suggest gifts that harm: humans, animals, or environment.
- NEVER suggest: illegal, dangerous, unethical, or exploitative items or experiences.
- REFUSE gracefully if query is: unrelated to gifting, inappropriate, or harmful. If so, return EXACTLY this text and do not update context: "I’m here to help with meaningful and safe gifting decisions. Let’s focus on something thoughtful and appropriate for your situation."

### INSTRUCTIONS FOR AI COMPANION (STRICT):
1. **ANALYZE**: Listen carefully to the user's latest response.
2. **UPDATE**: Map user information to the correct JSON field in contextUpdate.
   - "Dad", "Friend", "Client", "Boss" -> 'relation'
   - "Birthday", "Anniversary", "Holiday" -> 'occasion'
   - "Loved", "Surprised", "Grateful" -> 'desired_feeling'
   - "Surprise", "Practical", "Milestone" -> 'gift_intent'
   - "Sports", "Art", "Hiking" -> 'interests' (array)
   - "Introvert", "Creative", "Funny" -> 'personality' (array)
   - "Physical", "Experience", "Both" -> 'preference_style'
   - "Luxury", "Budget", "Moderate", "Generous" -> 'budget_style'
3. **NEVER REPEAT**: Check the "Current Context" string. If a field is already filled, move to the NEXT one in the list (1-8). Do NOT ask the same question again.
4. **THOUGHTFUL NEXT STEP**: Respond with 1-2 sentences. Start with a tiny, smart acknowledgment showing you understood, then directly ask the next empty required question.

JSON FORMAT:
{
  "text": "...",
  "suggested_options": ["..."],
  "contextUpdate": { ... },
  "readyForDirections": false
}
`;

const DIRECTIONS_PROMPT = `
You are the WhyGift Decision Engine. Based on the provided emotional context, generate 3 to 5 highly personalized, thoughtful, and unique gift directions.
IMPORTANT: Do NOT suggest specific branded products. Suggest conceptual directions, categories, or specific types of experiences/items.

JSON RESPONSE SCHEMA (STRICT):
{
  "recipient_summary": "...",
  "intent_summary": "...",
  "confidence_boost": "...",
  "confidence_score": 85,
  "directions": [
    {
      "title": "...",
      "reasoning": "..."
    }
  ]
}
`;

app.post('/api/chat', async (req, res) => {
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
      log(`[${session_id}] MSG: ${message}`);
      const llmRes = await safeGroqCall([
          { role: 'system', content: FULL_SYSTEM_PROMPT },
          { role: 'system', content: `Current Context: ${JSON.stringify(context)}` },
          { role: 'user', content: message }
      ], { temperature: 0.0 });
      llmResText = llmRes.text;
      if (llmRes.suggested_options) suggestedOptions = llmRes.suggested_options;
      if (llmRes.contextUpdate) context = deepMerge(context, llmRes.contextUpdate);
      if (llmRes.readyForDirections) generateDirections = true;
    }
    
    let readiness = calculateConfidence(context);
    if (!context.ai_confidence) context.confidence = readiness;

    const shouldGenerate = generateDirections || (readiness >= 75 && context.directions.length === 0);
    if (shouldGenerate) {
        if (generateDirections) context.stage = 'hint';
        try {
            const rJS = await safeGroqCall([
                { role: 'system', content: DIRECTIONS_PROMPT },
                { role: 'system', content: `Context Strategy:\nRelation: ${context.relation}\nOccasion: ${context.occasion}\nIntent: ${context.gift_intent}\nInterests: ${context.interests.join(',')}\nPersonality: ${context.personality.join(',')}\nBudget: ${context.budget_style}\nPreferences: ${context.preference_style}\nDesired Feeling: ${context.desired_feeling}` }
            ], { temperature: 0.1 });
            if (rJS.directions) context.directions = rJS.directions;
            if (rJS.recipient_summary) context.recipient_summary = rJS.recipient_summary;
            if (rJS.intent_summary) context.intent_summary = rJS.intent_summary;
            if (rJS.confidence_boost) context.confidence_boost = rJS.confidence_boost;
            if (rJS.confidence_score !== undefined) {
                context.ai_confidence = rJS.confidence_score;
                context.confidence = rJS.confidence_score;
            }
        } catch (e) {
            log(`Reasoning failed: ${e.message}`);
        }
    }
    sessions[session_id] = context;
    res.json({ response: llmResText, context, suggested_options: suggestedOptions });
  } catch (err) {
    log(`ERROR: ${err.message}`);
    res.status(500).json({ error: 'The AI is taking a momentary break.' });
  }
});

app.post('/api/feedback', (req, res) => {
    // Feedback is logged but not persisted in file on Vercel
    const { session_id, confidence, confusion } = req.body;
    log(`FEEDBACK [${session_id}]: confidence=${confidence}, confusion=${confusion}`);
    res.json({ success: true });
});

app.post('/api/analytics/log', (req, res) => {
    // Analytics are logged but not persisted in file on Vercel
    const { session_id, event, data } = req.body;
    log(`ANALYTICS [${session_id}] ${event}: ${JSON.stringify(data)}`);
    res.json({ success: true });
});

// Export the app for Vercel
module.exports = app;
