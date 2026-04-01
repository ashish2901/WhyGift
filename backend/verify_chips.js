const axios = require('axios');

async function test() {
  try {
    const session_id = "chip_fix_" + Date.now();
    const API = 'http://localhost:5000/chat';
    
    console.log('--- Step 1: Relation ---');
    let res = await axios.post(API, { message: "Gift for my father", session_id });
    
    console.log('--- Step 2: Occasion ---');
    res = await axios.post(API, { message: "Birthday", session_id });
    
    console.log('--- Step 3: Intent ---');
    res = await axios.post(API, { message: "Surprise", session_id });
    
    console.log('--- Step 5: Personality ---');
    res = await axios.post(API, { message: "He is a creative person", session_id });
    
    console.log('--- Step 6: Interests (Confidence should hit 80+ now) ---');
    res = await axios.post(API, { message: "He loves photography and art", session_id });
    
    console.log('AI Text:', res.data.response);
    console.log('Current Stage:', res.data.context.stage);
    console.log('Confidence:', res.data.context.confidence);
    console.log('Suggested Chips:', res.data.suggested_options);
    console.log('Directions Count:', res.data.context.directions.length);
    
    const isGenericRefinement = res.data.suggested_options.includes("This feels right") || res.data.suggested_options.includes("More practical");
    
    if (!isGenericRefinement && res.data.context.stage === 'entry' && res.data.context.directions.length > 0) {
        console.log('SUCCESS: Directions exist in background, but chips remain conversational and stage is still entry!');
    } else {
        console.log('FAILURE: Stage jumped to hint or chips were overridden or directions failed to generate.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
