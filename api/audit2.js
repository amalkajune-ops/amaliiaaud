// /api/audit2.js — production
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { handle, platform = 'Instagram', goal = 'Growth' } = body;
    if (!handle) return res.status(400).json({ error: 'Missing handle' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server missing OPENAI_API_KEY' });

    const system = `
You are Amaliia — a sharp, no-fluff social profile auditor (luxury Miami vibe).
Score the profile by: bio, hooks, visual, cadence, hashtags, CTA.
Return short, actionable bullets and percentages.
Return STRICT JSON with:
{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]}
}`.trim();

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Platform: ${platform}\nHandle: ${handle}\nGoal: ${goal}` }
        ]
      })
    });

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'LLM empty response', raw: data });

    const json = JSON.parse(content);
    return res.status(200).json({ profile: { handle, platform, goal }, ...json });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
