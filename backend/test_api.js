const axios = require('axios');

async function test() {
  try {
    const session_id = "debug_5001_" + Date.now();
    const API = 'http://127.0.0.1:5001/chat';
    
    console.log('--- TURN 1 ---');
    await axios.post(API, { message: "Gift for sister. Emotional/adventurous.", session_id });

    console.log('--- TURN 2 ---');
    await axios.post(API, { message: "She loves travel and photography.", session_id });

    console.log('--- TURN 3 ---');
    const res = await axios.post(API, { message: "Appreciation goal, emotional tone.", session_id });
    console.log('Context 3:', JSON.stringify(res.data.context, null, 2));

    console.log('--- SERVER LOG ---');
    const logs = await axios.get('http://127.0.0.1:5001/log');
    console.log(logs.data);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
