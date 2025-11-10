// /api/audit2.js — robust + domain lock
export default async function handler(req, res) {
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
        hint: 'Add it in Vercel → Project → Settings → Environment Variables → OPENAI_API_KEY'
      });
    }

    const system = `
You are "Amaliia" — a sharp, no-fluff social profile auditor (luxury Miami vibe).
You ALWAYS ground your output in provided SIGNALS. If a claim is not supported by signals, omit it or ask for that signal.

DOMAIN LOCK (mandatory):
- signals.topic defines the niche/industry (e.g., "fitness, women’s sport, calisthenics").
- All wording (findings, hooks, hashtags) MUST reflect this topic.
- If signals.topic is empty, do NOT guess a domain. Add "Need: Provide topic/niche" to actions_next7days and keep copy generic.
- Hashtags: niche-aligned, lowercase, no spaces (e.g., #womensfitness, #calisthenics, #mobilitytraining, optional geo like #miamisports if signals.geo).

SCORING RULES (use signals, do not invent):
- cadence: use signals.posts_last_30d and signals.posting_days_last_30d; daily posting (>=25 posts / >=20 days) = 85–95 unless other issues.
- hashtags: use signals.niche_hashtag_ratio (0..1) and avg_hashtags_per_post; if ratio >= 0.6 mark as "niche OK".
- content: use signals.format_mix ({"reels":..,"photos":..,"carousels":..}) and signals.cover_text_ratio.
- bio: use signals.bio_has_offer (true/false), bio_first_line_hook (true/false), link_visible (true/false).
- hooks: use signals.hook_rate (0..1).
- cta: use signals.cta_rate (0..1).

Output STRICT JSON with keys exactly:
{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]}
}
overall = weighted: bio 15, hooks 20, visual 20, cadence 15, hashtags 15, cta 15.
English only.
`.trim();

    const userContent =
`Platform: ${platform}
Handle: ${handle}
Goal: ${goal}
Signals JSON:
${JSON.stringify(signals, null, 2)}`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ]
      }),
      cache: 'no-store'
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '(no body)');
      return res.status(r.status).json({ error: 'OpenAI API error', status: r.status, body: safeJson(text) });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'LLM empty response', raw: data });

    let json; try { json = JSON.parse(content); }
    catch (e) { return res.status(502).json({ error: 'LLM returned non-JSON', sample: String(content).slice(0, 600) }); }

    return res.status(200).json({ profile: { handle, platform, goal, signals }, ...json });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
function safeJson(s){ try{ return JSON.parse(s) }catch{ return String(s) } }
