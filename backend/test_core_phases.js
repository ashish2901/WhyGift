async function testPhases() {
  console.log("=== STARTING PHASE 2 & 3 VALIDATION ===");
  const headers = { 'Content-Type': 'application/json' };
  const sessionId = 'test_phase23_' + Date.now();

  try {
    console.log("\n[1] Sending Initial Input...");
    let res = await fetch('http://127.0.0.1:5000/chat', {
        method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, message: 'I need a gift for my Dad.' })
    });
    let data = await res.json();
    console.log("-> AI Reply:", data.response);
    
    console.log("\n[2] Testing PHASE 2: Context Extraction (Traits & Interests)...");
    res = await fetch('http://127.0.0.1:5000/chat', {
        method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, message: 'He is practical and a homebody. He loves gardening and cooking.' })
    });
    data = await res.json();
    console.log("-> AI Reply:", data.response);
    console.log("-> Extracted Traits:", data.context.recipient.personality);
    console.log("-> Extracted Interests:", data.context.recipient.interests);
    if(data.context.recipient.personality.length > 0 && data.context.recipient.interests.length > 0) {
        console.log("✅ PHASE 2: Context parsing is working flawlessly.");
    } else {
        console.log("❌ PHASE 2: Context parsing failed.");
    }

    console.log("\n[3] Testing PHASE 3: Decision Engine Trigger (Intent & Confidence)...");
    res = await fetch('http://127.0.0.1:5000/chat', {
        method: 'POST', headers, body: JSON.stringify({ session_id: sessionId, message: 'I want to show appreciation. A sentimental tone is perfect.' })
    });
    data = await res.json();
    console.log("-> AI Reply:", data.response);
    console.log("-> Intent Captured:", data.context.intent);
    console.log("-> Generated Attributes:", data.context.attributes);
    console.log("-> Generated Directions:", data.context.directions.map(d => d.title));
    console.log("-> Confidence Score:", data.context.confidence + "/10");
    
    if(data.context.confidence > 0 && data.context.directions.length > 0 && data.context.attributes.length > 0) {
        console.log("✅ PHASE 3: Decision Engine successfully generated directions, attributes, and scored confidence.");
    } else {
        console.log("❌ PHASE 3: Decision Engine failed to trigger or populate outputs.");
    }

    console.log("\n=== ALL TESTS COMPLETED ===");
  } catch(e) {
    console.error("Test Error:", e);
  }
}

testPhases();
