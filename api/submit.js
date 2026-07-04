export default async function handler(req, res) {
  // Allow CORS for browser calls
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, mainCat, subCat } = req.body;
  if (!text || !mainCat || !subCat) {
    return res.status(400).json({ error: 'Missing required fields: text, mainCat, subCat' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured on server.' });
  }

  const systemPrompt = `You are an AI Civic Agent for a Member of Parliament in India.
Analyze the citizen complaint along with their selected Category and Sub-category context.

CRITICAL RULES:
1. If the complaint mentions harassment, violence, threats, women/child safety, or police misconduct, set "requires_police" to true.
2. Assign "urgency" as EXACTLY one of: "Standard", "Urgent", "Critical".
3. Assign "budget_source" as EXACTLY one of:
   - "NMC Budget" (local roads, garbage, water, streetlights)
   - "State MLA Fund" (state highways, state hospitals)
   - "Central MP Fund" (railways, national highways, airports)
   - "Home Ministry (State)" (security/crime/police issues)
4. Assign "department" as EXACTLY one of:
   - "Police Department"
   - "NMC (Municipal)"
   - "PWD / State Infrastructure"
   - "Health Ministry"
   - "Railways / National Highways Authority"

Reply ONLY in valid JSON:
{ "urgency": "...", "requires_police": boolean, "department": "...", "budget_source": "...", "agent_action": "..." }`;

  const aiContextText = `[Context: Category: ${mainCat}, Issue: ${subCat}]. Complaint: ${text}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `System Instruction: ${systemPrompt}\n\nComplaint: ${aiContextText}` }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(502).json({ error: err.error?.message || 'Gemini API error' });
    }

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text
      .replace(/```json/g, '').replace(/```/g, '').trim();
    const aiResult = JSON.parse(rawText);
    return res.status(200).json(aiResult);

  } catch (e) {
    console.error('submit.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
