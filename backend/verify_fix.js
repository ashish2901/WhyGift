const axios = require('axios');

async function test() {
  try {
    const session_id = "verify_" + Date.now();
    const API = 'http://localhost:5000/chat';
    const headers = { 'Content-Type': 'application/json' };
    
    console.log('--- Step 1: Relation ---');
    let res = await axios.post(API, { message: "Gift for my best friend", session_id });
    console.log('Update:', res.data.context.relation);

    console.log('--- Step 2: Occasion ---');
    res = await axios.post(API, { message: "It is for their wedding", session_id });
    console.log('Update:', res.data.context.occasion);

    console.log('--- Step 3: Budget (The problematic one) ---');
    res = await axios.post(API, { message: "My budget is generous", session_id });
    console.log('Update Budget:', res.data.context.budget_style);
    console.log('AI response:', res.data.response);
    
    console.log('--- Step 4: Intent ---');
    res = await axios.post(API, { message: "It is a surprise milestone gift", session_id });
    console.log('Update Intent:', res.data.context.gift_intent);

    console.log('--- Step 5: Interests ---');
    res = await axios.post(API, { message: "They love hiking and photography", session_id });
    console.log('Update Interests:', res.data.context.interests);

    console.log('--- Step 6: Personality ---');
    res = await axios.post(API, { message: "They are creative and introverted", session_id });
    console.log('Update Personality:', res.data.context.personality);

    console.log('--- FINAL Confidence & Directions ---');
    console.log('Confidence:', res.data.context.confidence);
    if (res.data.context.directions && res.data.context.directions.length > 0) {
        console.log('SUCCESS: Directions generated at turn 6!');
        console.log('Directions:', res.data.context.directions.map(d => d.title).join(', '));
    } else {
        console.log('FAILURE: No directions even at turn 6 (Confidence < 75?)');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) console.log(error.response.data);
  }
}

test();
