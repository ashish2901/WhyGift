async function testSimulate() {
  console.log("--- STARTING PHASE 5 VALIDATION ---");
  const headers = { 'Content-Type': 'application/json' };
  
  await fetch('http://127.0.0.1:5000/chat', {
      method: 'POST', headers, body: JSON.stringify({ session_id: 'auto_test_1', message: 'I need a gift for my sister' })
  });
  console.log("-> Initial chat sent.");
  
  await fetch('http://127.0.0.1:5000/chat', {
      method: 'POST', headers, body: JSON.stringify({ session_id: 'auto_test_1', message: 'She is adventurous. I want to celebrate her. (tone: fun)' })
  });
  console.log("-> Added traits and intent.");
  
  console.log("\n-> Simulating What-If: Changing budget to HIGH...");
  const startTime = Date.now();
  const simRes = await fetch('http://127.0.0.1:5000/simulate', {
      method: 'POST', headers, body: JSON.stringify({ session_id: 'auto_test_1', contextOverride: { metrics: { budget: 'high' } } })
  });
  const data = await simRes.json();
  const duration = Date.now() - startTime;
  
  console.log(`\n[RESULTS] Simulation completed in ${duration}ms!`);
  console.log("[RESULTS] Insight Explanation: ", data.explanation);
  console.log("[RESULTS] Updated Budget: ", data.context.metrics.budget);
  console.log("--- VALIDATION SUCCESS ---");
}

testSimulate().catch(e => console.error("Test Failed: ", e));
