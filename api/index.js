
// Main entry route
app.get('/', (req, res) => res.send('WhyGift AI API is running on Vercel!'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// NOTE: sessions are in-memory and will reset on serverless cold starts.
// For persistent sessions, use a database like Redis/Vercel KV.
const sessions = {};

// ... (INITIAL_CONTEXT remains same)
// ... (deepMerge remains same)
// ... (calculateConfidence remains same)
// ... (tryJSONParse remains same)
// ... (safeGroqCall remains same)
// ... (SYSTEM_PROMPT remains same)
// ... (DIRECTIONS_PROMPT remains same)

app.post('/chat', async (req, res) => {
  // logic...
});

app.get('/log', (req, res) => {
    res.send('Logs are available in the Vercel Dashboard real-time logs.');
});

app.post('/analytics/log', (req, res) => {
  // logic...
});

app.post('/feedback', (req, res) => {
  // logic...
});

// Export the app for Vercel
module.exports = app;
