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
app.get('/api/health', (req, res) => res.send({ status: 'healthy', timestamp: new Date().toISOString() }));

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
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is not configured in environment.");
    }

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
                temperature: options.temperature || 0.1,
                max_tokens: isDiscovery ? 1024 : 3000, // Explicit limit to prevent loop errors
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
IMPORTANT: Your response must be in valid JSON format.

### CORE LOGIC:
1. READ the 'Current Context' provided. 
2. IF a value (e.g., relation, occasion, emotional intent) is already present in 'Current Context', YOU MUST NOT ASK about it again. 
3. EXTRACT all new information from the user's latest message and fill the corresponding fields in 'contextUpdate'.
4. IDENTIFY the first MISSING piece of information from this sequence: [1. Relationship, 2. Occasion, 3. Emotional Intent, 4. Purpose, 5. Interests, 6. Personality, 7. Preference, 8. Budget].
5. ASK only for that next missing piece.

### RULES:
- NEVER REPEAT: If the 'Current Context' has 'occasion: Birthday', skip to asking about Intent or Interests.
- SUGGESTED OPTIONS: Provide 4-6 helpful, contextually relevant chips for the NEXT question you are asking.
- CONCISE: Be warm but very brief.

JSON OUTPUT FORMAT:
{
  "text": "Short acknowledgement + the single next missing question.",
  "suggested_options": ["Option 1", "Option 2", "..."],
  "contextUpdate": { "relation": "...", "occasion": "..." },
  "readyForDirections": false
}
`;

const DIRECTIONS_PROMPT = `
You are the WhyGift Decision Engine. 
IMPORTANT: Your response must be in valid JSON format.
Generate 3-5 gift directions based on context.
FORMAT: { "recipient_summary": "...", "directions": [{ "title": "...", "reasoning": "..." }] }
`;

const handleChat = async (req, res) => {
  try {
    let { message, session_id = 'default', contextOverride, isReset, generateDirections } = req.body;
    
    if (isReset) {
      sessions[session_id] = JSON.parse(JSON.stringify(INITIAL_CONTEXT));
      return res.json({ success: true, context: INITIAL_CONTEXT });
    }

    if (!sessions[session_id]) sessions[session_id] = JSON.parse(JSON.stringify(INITIAL_CONTEXT));
    let context = sessions[session_id];
    if (contextOverride) {
        context = deepMerge(context, contextOverride);
    }

    let llmResText = "Thinking...";
    let suggestedOptions = [];

    if (message && message.trim()) {
      const llmRes = await safeGroqCall([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `Current Context: ${JSON.stringify(context)}` },
          { role: 'user', content: message }
      ], { temperature: 0.1, isDiscovery: true });

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
            ], { temperature: 0.2 });
            if (rJS.directions) context.directions = rJS.directions;
            if (rJS.recipient_summary) context.recipient_summary = rJS.recipient_summary;
        } catch (e) { log(`Reasoning failed: ${e.message}`); }
    }

    sessions[session_id] = context;
    res.json({ response: llmResText, context, suggested_options: suggestedOptions });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    const errMsg = err.message.includes('apiKey') ? 'Configuration Error: API Key missing in Vercel.' : 'Assistant is busy. Please try again.';
    res.status(500).json({ error: errMsg });
  }
};

// Map both for absolute compatibility
app.post('/api/chat', handleChat);
app.post('/chat', handleChat);

app.get('/api/log', (req, res) => res.send('Check Vercel Dashboard for live logs.'));
app.get('/log', (req, res) => res.send('Check Vercel Dashboard for live logs.'));

app.post('/api/feedback', (req, res) => res.json({ success: true }));
app.post('/api/analytics/log', (req, res) => res.json({ success: true }));

module.exports = app;
