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
  relation: '',
  occasion: '',
  emotional_intent: '',
  gift_purpose: '',
  interests: [],
  personality: [],
  gifting_preference: '',
  budget: '',
  recipient_summary: '',
  intent_summary: '',
  directions: [],
  confidence: 0
};

function deepMerge(target, source) {
  if (!source) return target;
  for (const key in source) {
    const val = source[key];
    // Rule: Never overwrite existing data with empty strings or nulls
    if (val === "" || val === null || val === undefined) continue;

    if (val instanceof Object && !Array.isArray(val)) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

function calculateConfidence(context) {
  let s = 0;
  if (context.relation) s += 15;
  if (context.occasion) s += 15;
  if (context.emotional_intent) s += 15;
  if (context.gift_purpose) s += 15;
  if (context.interests?.length > 0) s += 10;
  if (context.personality?.length > 0) s += 10;
  if (context.gifting_preference) s += 10;
  if (context.budget) s += 10;
  return Math.min(s, 100);
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

### DISCOVERY SEQUENCE (STRICT):
1. Relationship (relation)
2. Occasion (occasion)
3. Emotional Intent (emotional_intent)
4. Gift Purpose (gift_purpose)
5. Recipient Interests (interests)
6. Recipient Personality (personality)
7. Gifting Preference (gifting_preference)
8. Budget (budget)

### REPETITION CONTROL (CRITICAL):
- BEFORE ASKING: Check the 'Current Context' JSON.
- IF A FIELD HAS A VALUE: It is considered "Answered". Do NOT ask about it again.
- IF USER PROVIDES MULTIPLE ANSWERS: Extract ALL of them into 'contextUpdate' and skip those steps.
- CLARIFICATION RULE: Only ask for clarification if the user's response is completely irrelevant (e.g., gibberish). If they provide a valid but brief answer (e.g., "Friend"), ACCEPT IT and move to the next step immediately.

### CORE LOGIC:
- EXTRACT: Map user input to its corresponding 8-step field in 'contextUpdate'.
- ASK: Find the very first field in the 1-8 sequence that is EMPTY and ask ONLY that question.
- SUMMARIZE: Always update 'recipient_summary' and 'intent_summary' with the latest details.
- OVERRULE: If user says "skip", "recommend gifts", or "show ideas", set 'readyForDirections' to true.

JSON FORMAT:
{
  "text": "acknowledgment + the single next missing question",
  "suggested_options": ["Option 1", "Option 2", "..."],
  "contextUpdate": { 
    "relation": "...", 
    "occasion": "...",
    "emotional_intent": "...",
    "gift_purpose": "...",
    "interests": [],
    "personality": [],
    "gifting_preference": "...",
    "budget": "...",
    "recipient_summary": "Short summary of who they are",
    "intent_summary": "Short summary of the gifting goal"
  },
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
