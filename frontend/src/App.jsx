import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sparkles, Compass, Heart, Layers, UserCircle2, Gift, RotateCcw, ChevronRight, Send, Star } from 'lucide-react';

import Header from './components/Header';
import About from './pages/About';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Contact from './pages/Contact';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:5000' : '/api');

const INITIAL_OPTIONS = [
  'Partner / Spouse', 'Boyfriend / Girlfriend', 'Friend', 'Best Friend',
  'Mother', 'Father', 'Sister', 'Brother', 'Son / Daughter',
  'Colleague', 'Boss / Manager', 'Mentor / Teacher', 'Client',
  'Relative', 'Someone New / Not Sure', 'Other'
];

function App() {
  const [flowStarted, setFlowStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [suggestedOptions, setSuggestedOptions] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [context, setContext] = useState({
    stage: 'entry',
    relation: '',
    occasion: '',
    recipient_summary: '',
    intent_summary: '',
    directions: [],
    confidence: 0,
    confidence_boost: ''
  });
  
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const scrollRef = useRef(null);

  // Generate a unique session ID
  const [sessionId, setSessionId] = useState(() => 'user_' + Math.random().toString(36).substr(2, 9));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const startFlow = () => {
    setFlowStarted(true);
    resetFlow();
  };

  const resetFlow = async () => {
    const newSession = 'user_' + Math.random().toString(36).substr(2, 9);
    setSessionId(newSession);

    setMessages([
      { role: 'assistant', content: "Hi! I'm WhyGift — your AI gift co-thinker.\nI'll help you understand who you're gifting, why, and what kind of gift would truly land.\nLet's start simple — who are you gifting?" }
    ]);
    setSuggestedOptions(INITIAL_OPTIONS);

    setContext({
      stage: 'entry', relation: '', occasion: '', recipient_summary: '', intent_summary: '', directions: [], confidence: 0, confidence_boost: ''
    });
    setFeedbackSent(false);
    setUserRating(0);
    setFeedbackComment('');

    try {
      await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReset: true, session_id: newSession }),
      });
    } catch (e) { }
  };

  const sendMessage = async (overrideMsg = null) => {
    const textToSend = overrideMsg || input;
    if (!textToSend.trim() && !overrideMsg) return;

    const lowerText = textToSend.trim().toLowerCase();
    if (["start again", "new gift", "another person", "reset"].includes(lowerText)) {
      resetFlow();
      return;
    }

    const userMsg = { role: 'user', content: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSuggestedOptions([]); // Clear options while loading
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: textToSend, 
          session_id: sessionId,
          contextOverride: context 
        }),
      });
      if (!response.ok) throw new Error("API error");
      const data = await response.json();

      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        if (data.suggested_options && Array.isArray(data.suggested_options)) {
          setSuggestedOptions(data.suggested_options);
        }



        if (data.context) setContext(data.context);
      }
    } catch (err) {
      log(`Error sending message: ${err.message}`);
      // Show the actual error if it's from the backend
      const errorMsg = err.message.includes('ALL_MODELS_LIMITED') 
        ? "I'm thinking quite hard right now and all my primary circuits are busy. Please try again in 1 minute!" 
        : "Something went wrong. Let's try again!";
        
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      setSuggestedOptions(['Retry']);
    }
    setIsLoading(false);
  };

  const submitFeedback = async () => {
    if (userRating === 0) return;
    setIsSubmittingFeedback(true);
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: sessionId, 
          confidence: userRating, 
          confusion: feedbackComment 
        }),
      });
      setFeedbackSent(true);
    } catch (e) {
      console.error("Feedback failed", e);
    }
    setIsSubmittingFeedback(false);
  };

  // Render Main Flow
  const MainView = () => {
    if (!flowStarted) {
      return (
        <div className="landing-container">
          <Header />
          <main className="landing-hero">
            <h2 className="hero-headline">Choose with heart.<br />Decide with confidence.</h2>
            <p className="hero-subtext">An AI companion that helps you choose the right gift — clearly, confidently, and meaningfully.</p>

            <div className="cta-group">
              <button className="start-btn" onClick={startFlow}>
                Start Gifting <ChevronRight size={20} />
              </button>
              <button className="secondary-btn" onClick={() => document.querySelector('.explainer-strip').scrollIntoView({ behavior: 'smooth' })}>
                See How It Works
              </button>
            </div>

            <div className="trust-cues">
              <span>✨ Emotion-aware gifting guidance</span>
              <span>✨ Thoughtful suggestions with reasoning</span>
              <span>✨ Built for meaningful decisions, not endless browsing</span>
            </div>
          </main>

          <section className="explainer-strip">
            <h3>How WhyGift works</h3>
            <div className="steps-container">
              <div className="step-card">
                <div className="step-num">1</div>
                <p>Understand the person</p>
              </div>
              <div className="step-card">
                <div className="step-num">2</div>
                <p>Clarify your intention</p>
              </div>
              <div className="step-card">
                <div className="step-num">3</div>
                <p>Read the emotional context</p>
              </div>
              <div className="step-card">
                <div className="step-num">4</div>
                <p>Get a gift direction with confidence</p>
              </div>
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="app-container">
        {/* GLOBAL HEADER */}
        <div className="global-nav">
          <div className="nav-brand">
            <Gift size={24} color="var(--accent)" />
            <span>WhyGift</span>
          </div>
          <button className="reset-btn" onClick={resetFlow}>
            <RotateCcw size={16} /> Start New Gift
          </button>
        </div>

        <div className="main-content">
          {/* LEFT PANEL: CHAT */}
          <div className="chat-panel">
            <div className="messages-container" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`message ${m.role}`}>
                  <div className="avatar">
                    {m.role === 'assistant' && <Gift size={20} color="var(--accent)" fill="#fef08a" />}
                  </div>
                  <div className="bubble" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="avatar"><Gift size={20} color="var(--accent)" /></div>
                  <div className="bubble">Thinking deeply...</div>
                </div>
              )}
            </div>

            <div className="input-area">

              {/* Contextual Chips */}
              {!isLoading && suggestedOptions.length > 0 && (
                <div className="quick-replies">
                  {suggestedOptions.map(opt => (
                    <button key={opt} className="qr-chip" onClick={() => sendMessage(opt)}>{opt}</button>
                  ))}
                </div>
              )}

              <div className="input-box-wrapper">
                <input
                  type="text"
                  placeholder="Type your thoughts..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button className="send-btn" onClick={() => sendMessage()}>
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: GIFT COMPASS */}
          <div className="state-panel">
            <div className="compass-header">
              <h2><Compass size={22} color="var(--primary)" /> Gift Compass</h2>
              <p>Step-by-step discovery...</p>
            </div>

            {/* PROGRESS */}
            <div className="progress-section">
              <div className="progress-header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span className="target-icon">🎯 Progress</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--primary)' }}>{context.confidence}%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${context.confidence}%` }}></div>
              </div>
            </div>

            {/* WHO & WHY SUMMARIES */}
            <div className="compass-section">
              <div className="section-title"><UserCircle2 size={16} color="#6b7280" /> THE RECIPIENT</div>
              <div className="summary-text">
                {context.recipient_summary ? context.recipient_summary : (context.relation ? `Gifting your ${context.relation}...` : "Waiting for details...")}
              </div>
            </div>

            <div className="compass-section">
              <div className="section-title"><Heart size={16} color="#ef4444" fill="#fca5a5" /> THE INTENT</div>
              <div className="summary-text">
                {context.intent_summary ? context.intent_summary : (context.occasion ? `For their ${context.occasion}...` : "What should this gift convey?")}
              </div>
            </div>


            {/* DIRECTIONS */}
            <div className="compass-section directions-section">
              <div className="section-title"><Sparkles size={16} color="#eebc3f" /> GIFT DIRECTIONS</div>

              {context.directions && context.directions.length > 0 ? (
                <div className="direction-list">
                  {context.directions.map((d, i) => (
                    <div key={i} className="direction-card">
                      <h4>{d.title}</h4>
                      <p>{d.reasoning}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p className="small-text">Complete the 8 steps to see meaningful directions.</p>
                </div>
              )}
            </div>

            {/* FEEDBACK SECTION */}
            {context.directions && context.directions.length > 0 && (
              <div className="compass-section feedback-section">
                <div className="section-title"><Sparkles size={16} color="var(--accent)" /> FEEDBACK</div>
                
                {!feedbackSent ? (
                  <div className="feedback-form">
                    <p className="feedback-prompt">How was your gifting assistance experience?</p>
                    <div className="star-rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          className={`star-btn ${userRating >= star ? 'active' : ''}`}
                          onClick={() => setUserRating(star)}
                        >
                          <Star size={20} fill={userRating >= star ? "var(--accent)" : "transparent"} stroke={userRating >= star ? "var(--accent)" : "var(--text-muted)"} />
                        </button>
                      ))}
                    </div>
                    <textarea 
                      placeholder="What could be better? (Optional)"
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                    />
                    <button 
                      className={`submit-feedback-btn ${userRating > 0 ? 'ready' : ''}`}
                      disabled={userRating === 0 || isSubmittingFeedback}
                      onClick={submitFeedback}
                    >
                      {isSubmittingFeedback ? "Sending..." : "Submit Feedback"}
                    </button>
                  </div>
                ) : (
                  <div className="feedback-success">
                    <Heart size={24} color="#ef4444" fill="#fca5a5" />
                    <p>Thank you for your feedback!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Routes>
      <Route path="/" element={MainView()} />
      <Route path="/about" element={<div className="landing-container"><Header /><About /></div>} />
      <Route path="/blog" element={<div className="landing-container"><Header /><Blog /></div>} />
      <Route path="/blog/:id" element={<div className="landing-container"><Header /><BlogPost /></div>} />
      <Route path="/contact" element={<div className="landing-container"><Header /><Contact /></div>} />
    </Routes>
  );
}

export default App;
