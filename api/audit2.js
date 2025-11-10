// api/audit2.js

// ЯВНО ГОВОРИМ Vercel: это Node.js serverless, не Edge
export const config = {
  runtime: 'nodejs18.x',   // или 'nodejs20.x' если у вас 20й
  regions: ['iad1'],       // опционально, но стабильнее на Вост. берегу
};

export default async function handler(req, res) {
  // Простая CORS поддержка
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { handle, platform = 'Instagram', goal = 'Growth', signals = null } = body || {};
    if (!handle) return res.status(400).json({ error: 'Missing handle' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Эта ветка отработает ТОЛЬКО если переменная реально не выставлена в данной среде (Preview/Prod)
      return res.status(500).json({
        error: 'Server missing OPENAI_API_KEY',
        hint: 'Vercel → Project → Settings → Environment Variables → add OPENAI_API_KEY for Preview & Production, then redeploy.'
      });
    }

    const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // можно переопределить из Dashboard

    const system = `
You MUST return a concrete 7-day content grid. No generic advice.

Return JSON with an extra key:
"plan_7d": [
  {
    "day": 1,
    "post_type": "reel|photo|carousel|story",
    "angle": "the specific idea tied to signals.topic",
    "hook": "≤12 words, tension or curiosity, no clichés",
    "storyboard": ["shot 1", "shot 2", "shot 3"],
    "caption_outline": ["line1", "line2", "line3"],
    "cta": "one crystal-clear action",
    "hashtag_cluster": ["tag1","tag2","tag3","tag4","tag5"],
    "time_window": "local time, e.g., 18:00–21:00",
    "kpi": "numeric target e.g. saves≥15 or comments≥10"
  }
]

RULES:
- Domain lock: every angle/hook/hashtag must reflect signals.topic (fitness / luxury / calisthenics etc.).
- No vague verbs without the exact "how".
- Ban words “ultimate”, “secrets”, “journey”, “unlock” unless tied to a concrete angle.
- Hashtags: 5–9 items, mostly niche (10k–100k). If user tags are too broad, replace and explain why in findings.hashtags.
- CTAs: one per post (action-first: “Comment A/B…”, “Save this…”, “DM 'PLAN'…”).
- KPIs: set a small numeric target per day.

If key signals are missing, fill with safe defaults but add a single “Need: …” in actions_next7days.

Tone: short, concrete, Miami-lux vibe. No fluff. English only.

SCORING (only from signals):
- cadence: posts_last_30d, posting_days_last_30d (>=25 / >=20) → 85–95.
- hashtags: niche_hashtag_ratio (>=0.6 OK) and avg_hashtags_per_post.
- content: format_mix, cover_text_ratio.
- bio: bio_has_offer, bio_first_line_hook, link_visible.
- hooks: hook_rate.  cta: cta_rate.
overall = weighted: bio15, hooks20, visual20, cadence15, hashtags15, cta15.

OUTPUT KEYS (strict):
{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]},
 "plan_7d":[ ... as above ... ]
}
`.trim();

    const userContent =
`Platform: ${platform}
Handle: ${handle}
Goal: ${goal}
Signals JSON:
${JSON.stringify(signals ?? {}, null, 2)}`;

    // Вызов OpenAI
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ]
      })
    });

    const raw = await r.text().catch(() => '');
    if (!r.ok) {
      // Покажем клиенту, что именно ответил OpenAI (часто 401/429/400)
      let parsed; try { parsed = JSON.parse(raw) } catch { parsed = raw }
      return res.status(r.status).json({ error: 'OpenAI API error', status: r.status, body: parsed });
    }

    let data; try { data = JSON.parse(raw) } catch { data = null }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'LLM empty response', raw: data || raw });
    }

    let json; try { json = JSON.parse(content); }
    catch (e) {
      return res.status(502).json({ error: 'LLM returned non-JSON', sample: String(content).slice(0, 800) });
    }

    return res.status(200).json({ profile: { handle, platform, goal, signals }, ...json });
  } catch (e) {
    // Лог в Vercel (увидите в "Functions → Logs")
    console.error('audit2 failure:', e);
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
