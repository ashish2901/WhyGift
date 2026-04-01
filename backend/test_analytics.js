async function testAnalytics() {
  const API = 'http://127.0.0.1:5000';
  const headers = { 'Content-Type': 'application/json' };
  
  console.log("=== WRITING TELEMETRY DATA ===");
  await fetch(`${API}/analytics/log`, { method: 'POST', headers, body: JSON.stringify({ session_id: 'auto_test_7', event: 'Session Started' }) });
  await fetch(`${API}/analytics/log`, { method: 'POST', headers, body: JSON.stringify({ session_id: 'auto_test_7', event: 'Input Selected', data: { category: 'personality', value: 'creative' } }) });
  await fetch(`${API}/feedback`, { method: 'POST', headers, body: JSON.stringify({ session_id: 'auto_test_7', confidence: 'Very confident', confusion: 'None at all' }) });
  
  console.log("=== FETCHING DASHBOARD DATA ===");
  const dRes = await fetch(`${API}/analytics/dashboard`);
  const data = await dRes.json();
  console.log(JSON.stringify(data, null, 2));
}
testAnalytics();
