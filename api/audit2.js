// /api/audit2.js — filled findings/actions based on provided signals
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { handle, platform = 'Instagram', goal = 'Growth', signals = null } = body;
    if (!handle) return res.status(400).json({ error: 'Missing handle' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Server missing OPENAI_API_KEY',
        hint: 'Set OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables'
      });
    }

    const system = `
You are "Amaliia" — a sharp, no-fluff social profile auditor (luxury Miami vibe).
You MUST ground your output in provided SIGNALS. If a claim is not supported by signals, either omit it or add a "Need: …" request in actions_next7days.
Return STRICT JSON with keys exactly as schema and do not add extra keys:

{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]}
}

SCORING RULES (use signals):
- cadence: use signals.posts_last_30d and signals.posting_days_last_30d. Daily posting (>=25 posts or >=20 posting days) → 85–95.
- hashtags: use signals.niche_hashtag_ratio (0..1) and avg_hashtags_per_post; if ratio >= 0.6 mark as niche OK.
- content/visual: use signals.format_mix and signals.cover_text_ratio (covers with readable text).
- bio: use signals.bio_has_offer, bio_first_line_hook, link_visible.
- hooks: use signals.hook_rate (0..1).
- cta: use signals.cta_rate (0..1).
- overall = weighted sum: bio 15, hooks 20, visual 20, cadence 15, hashtags 15, cta 15.

OUTPUT REQUIREMENTS:
- Language: English.
- findings.bio/content/cadence/hashtags: 2–4 short bullets each (use signals; no fluff).
- actions_next7days: 5–8 concrete, verifiable actions. If signals missing for a section, include a "Need: …" bullet.
- ready_to_copy.hooks: 3 hooks tailored to the Goal and Platform.
- ready_to_copy.hashtags: 5 niche-leaning example tags (lowercase, no spaces).
`.trim();

    // Build the user message including raw signals (so the model can quote them)
    const user = [
      `Platform: ${platform}`,
      `Handle: ${handle}`,
      `Goal: ${goal}`,
      `SIGNALS JSON: ${JSON.stringify(signals)}`
    ].join('\n');

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
          { role: 'user', content: user }
        ]
      }),
      // so we don't cache stale results
      cache: 'no-store'
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '(no body)');
      return res.status(r.status).json({ error: 'OpenAI API error', status: r.status, body: safeJson(text) });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'LLM empty response', raw: data });

    let json;
    try { json = JSON.parse(content); }
    catch {
      return res.status(502).json({ error: 'LLM returned non-JSON', sample: content?.slice?.(0, 500) });
    }

    return res.status(200).json({ profile: { handle, platform, goal, signals }, ...json });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return String(s); } }
