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
  // Core Fields (Most Important) - 70 points
  if (context.relation) s += 15;
  if (context.occasion) s += 15;
  if (context.desired_feeling) s += 15; // New importance
  if (context.gift_intent) s += 15;     // New importance
  if (context.budget_style) s += 10;

  // Contextual Fields - 30 points
  if (context.interests && context.interests.length > 0) s += 10;
  if (context.personality && context.personality.length > 0) s += 10;
  if (context.preference_style) s += 10;
  
  return Math.min(Math.max(s, 0), 100);
}

/**
 * Robust JSON extraction for models that might return conversational text
 */
function tryJSONParse(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        // Find the first { and the last }
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
 * Bulletproof Groq Call with fallbacks and state repair
 */
async function safeGroqCall(messages, options = {}) {
    const models = [
        'llama-3.3-70b-versatile',
        'qwen/qwen3-32b',
        'meta-llama/llama-4-scout-17b-16e-instruct',
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
            if (err.message.includes('Rate limit') || err.status === 429) {
                log(`WARN: Model ${model} rate limited. Trying fallback...`);
                continue;
            }
            if (err.status === 400 || err.message.includes('decommissioned')) {
                log(`WARN: Model ${model} unavailable. Trying fallback...`);
                continue;
            }
            // If it's a different error, break and throw
            throw err;
        }
    }
    // If we've hit total limits, return a structured error that the frontend can read
    throw new Error(`ALL_MODELS_LIMITED: ${lastError.message}`);
}

const SYSTEM_PROMPT = `
You are WhyGift — an AI Gift Co-Thinker.
Role: You are a thoughtful, warm, and highly intelligent personal gifting assistant. You are emotionally aware and structured.
Goal: Help users understand the recipient, clarify their emotional intent, map intent to a gift direction, and provide confidence and reasoning.

SAFETY & BOUNDARY RULES (CRITICAL):
- NEVER suggest gifts that harm: humans, animals, or environment.
- NEVER suggest: illegal, dangerous, unethical, or exploitative items or experiences.
- REFUSE gracefully if query is: unrelated to gifting, inappropriate, or harmful. If so, return EXACTLY this text and do not update context: "I’m here to help with meaningful and safe gifting decisions. Let’s focus on something thoughtful and appropriate for your situation."

### DISCOVERY FLOW (STRICT SEQUENCE):
1. Relationship with Recipient (e.g., Mom, Boss, Friend)
2. Occasion / Context (e.g., Birthday, Promotion, Thank You)
3. Primary Emotional Intent (What should the recipient feel? e.g., Loved, Empowered, Pampered)
4. Underlying Gift Purpose (e.g., Surprise, Practical, Sentiment/Memory-building, Professional)
5. Recipient Interests (What do they love or spend time on?)
6. Recipient Personality Traits (How would you describe their essence?)
7. Gifting Preference (Physical Item, Experience, or a Mix of both?)
8. Budget Style (Luxury, Practical/Budget, Generous, Thoughtful/Low-cost)

### INSTRUCTIONS FOR AI COMPANION (STRICT):
1. **ONE-SHOT ANALYSIS**: Analyze the user's latest response. Extract ALL relevant info and update the `contextUpdate` object. If multiple details are provided, skip all those steps.
2. **NEVER REPEAT**: Check the "Current Context" string. If a field (1-8) has a value, move to the NEXT empty one. NEVER ask a question if the answer is already in the context.
3. **SMART TRANSITION**: Respond with 1-2 sentences. Start with a warm acknowledgment of what you just learned, then ask the NEXT question in the 1-8 sequence. 
4. **ENHANCED OPTIONS**: For EVERY question, provide 4-6 high-quality, relevant options as chips.

CONSTRAINTS:
- Keep text brief (Max 2 sentences).
- Use a trust-building, co-thinking tone.
- Do NOT jump to directions until at least 7 steps are filled, unless the user specifically says "Give me suggestions".

JSON FORMAT:
{
  "text": "A brief acknowledgment and the next direct question. Max 2 sentences.",
  "suggested_options": ["Relevant option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
  "contextUpdate": { "relation": "...", "occasion": "...", "desired_feeling": "...", "gift_intent": "...", "interests": [], "personality": [], "preference_style": "...", "budget_style": "..." },
  "readyForDirections": false
}
`;

const DIRECTIONS_PROMPT = `
You are the WhyGift Decision Engine. Based on the provided context, generate 3 to 5 highly personalized, thoughtful, and unique gift directions.
IMPORTANT: Do NOT suggest specific branded products. Suggest conceptual directions, categories, or specific types of experiences/items.
Connect the "Emotional Intent" and "Gift Purpose" to your reasoning.

JSON RESPONSE SCHEMA (STRICT):
{
  "recipient_summary": "A warm, 1-2 sentence summary of who they are.",
  "intent_summary": "A warm, 1-2 sentence summary of the emotional goal.",
  "confidence_boost": "A short affirming sentence validating their thoughtful approach.",
  "confidence_score": 85,
  "directions": [
    {
      "title": "Clear Name of Gift Direction",
      "reasoning": "Explain why this fits BOTH the recipient's essence and your emotional goal."
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

    if (contextOverride) {
        context = deepMerge(context, contextOverride);
    }

    let llmResText = "";
    let suggestedOptions = [];
    // If it's a standard chat message
    if (message && message.trim()) {
      log(`[${session_id}] MSG: ${message}`);
      
      const llmRes = await safeGroqCall([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `Current Context: ${JSON.stringify(context)}` },
          { role: 'user', content: message }
      ], { temperature: 0.0 });

      log(`[${session_id}] RESP: ${llmRes.text}`);
      llmResText = llmRes.text;
      
      if (llmRes.suggested_options) {
          suggestedOptions = llmRes.suggested_options;
      }
      
      if (llmRes.contextUpdate) {
          context = deepMerge(context, llmRes.contextUpdate);
      }
      
      if (llmRes.readyForDirections) {
          generateDirections = true; 
      }
    }
    
    let readiness = calculateConfidence(context);
    if (!context.ai_confidence) {
        context.confidence = readiness;
    }

    // Dynamic Decision Engine Pass - Only run if explicitly flagged or if it's the first time reaching 75%
    const shouldGenerate = generateDirections || (readiness >= 75 && context.directions.length === 0);
    
    if (shouldGenerate) {
        if (generateDirections) context.stage = 'hint';
        try {
            const rJS = await safeGroqCall([
                { role: 'system', content: DIRECTIONS_PROMPT },
                { role: 'system', content: `Context Strategy:\nRelation: ${context.relation}\nOccasion: ${context.occasion}\nIntent: ${context.gift_intent}\nInterests: ${context.interests.join(',')}\nPersonality: ${context.personality.join(',')}\nBudget: ${context.budget_style}\nPreferences: ${context.preference_style}\nDesired Feeling: ${context.desired_feeling}` }
            ], { temperature: 0.1 });

            log(`[${session_id}] Decision Engine generated directions.`);
            
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
    // Return the response and context
    res.json({ response: llmResText, context, suggested_options: suggestedOptions });

  } catch (err) {
    log(`ERROR: ${err.message}`);
    // Check if it was a rate limit and provide a better message
    if (err.message.includes('Rate limit')) {
        return res.json({ 
            response: "I'm thinking quite hard right now and need a minute to breathe. Please try again in a few moments!", 
            context: sessions[session_id] || INITIAL_CONTEXT,
            suggested_options: ["Retry"] 
        });
    }
    res.status(500).json({ error: 'The AI is taking a momentary break. Please try clicking "Retry" or refresh the page.' });
  }
});

app.get('/api/log', (req, res) => {
    // Vercel doesn't persist logs in files, but we can return some info
    res.send('Logs are available in the Vercel Dashboard real-time logs.');
});

app.post('/api/analytics/log', (req, res) => {
  try {
    const { session_id, event, timestamp = Date.now(), data = {} } = req.body;
    if (!session_id || !event) return res.status(400).json({ error: "Missing fields" });
    log(`ANALYTICS: [${session_id}] ${event} - ${JSON.stringify(data)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Analytics failed" }); }
});

app.post('/api/feedback', (req, res) => {
  try {
    const { session_id, confidence, confusion } = req.body;
    if (!session_id || !confidence) return res.status(400).json({ error: "Missing fields" });
    log(`FEEDBACK: [${session_id}] confidence: ${confidence}, confusion: ${confusion}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "Feedback failed" }); }
});

// Export the app for Vercel
module.exports = app;
