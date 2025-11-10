// /api/audit2.js — robust + domain lock + 7-day plan
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // body parse
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});
    const { handle, platform = 'Instagram', goal = 'Growth', signals = null } = body;

    if (!handle) return res.status(400).json({ error: 'Missing handle' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Server missing OPENAI_API_KEY',
        hint: 'Add it in Vercel → Project → Settings → Environment Variables → OPENAI_API_KEY'
      });
    }

    // SYSTEM PROMPT — жёсткие правила + обязательный plan_7d
    const system = `
You are "Amaliia" — a sharp, no-fluff social profile auditor with a luxury Miami vibe.
Speak in short, concrete sentences. No fluff, no motivational talk.

CRITICAL: You MUST return a concrete 7-day content grid under key "plan_7d".
It must reflect the provided signals (cadence, topic, hashtags, hook/CTA rates).

"plan_7d" schema (exact keys):
[
  {
    "day": 1,
    "post_type": "reel|photo|carousel|story",
    "angle": "specific idea tied to signals.topic",
    "hook": "≤12 words, tension/curiosity, no clichés",
    "storyboard": ["shot 1","shot 2","shot 3"],
    "caption_outline": ["line 1","line 2","line 3"],
    "cta": "one clear action",
    "hashtag_cluster": ["tag1","tag2","tag3","tag4","tag5"],
    "time_window": "local time, e.g., 18:00–21:00",
    "kpi": "small numeric target, e.g., saves ≥15"
  }
]

DOMAIN LOCK (mandatory):
- signals.topic defines niche/industry (e.g., "fitness, women’s sport, calisthenics").
- All wording (findings, hooks, hashtags, angles) MUST reflect signals.topic.
- If signals.topic is empty: keep copy generic and add a single "Need: Provide topic/niche" to actions_next7days.

HASHTAGS:
- Prefer 5–9 items. Majority niche (10k–100k). Lowercase, no spaces.
- If user passed broad/overused tags in signals.hashtags_entered (e.g., "miamiluxury"), replace with niche alternatives AND explain why in findings.hashtags (no sugarcoating).

SCORING (use signals; do NOT invent):
- cadence: use signals.posts_last_30d & posting_days_last_30d. If ≥25 / ≥20 → 85–95.
- hashtags: use signals.niche_hashtag_ratio and avg_hashtags_per_post.
- content: use signals.format_mix and cover_text_ratio.
- bio: use signals.bio_text, bio_has_offer, bio_first_line_hook, link_visible.
- hooks: use signals.hook_rate.
- cta: use signals.cta_rate.

If a numeric signal is missing, do NOT assume zero and do NOT infer inactivity.
Instead, add exactly one "Need: ..." line in actions_next7days asking for that signal.

OUTPUT (STRICT JSON KEYS):
{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]},
 "plan_7d":[...]   // see schema above
}

ACTIONS:
- Always return 4–6 concrete, testable actions tailored to signals/topic.
- If no obvious gaps, propose optimizations (A/B hook tests, CTA templates, cover-text passes, hashtag clusters, posting windows).
- overall = weighted sum: bio 15, hooks 20, visual 20, cadence 15, hashtags 15, cta 15.

English only.
`.trim();

    // USER message: отдаём модельке все сигналы как JSON
    const userContent =
`Platform: ${platform}
Handle: ${handle}
Goal: ${goal}
Signals JSON:
${JSON.stringify(signals, null, 2)}`;

    // OpenAI call
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${apiKey}\`,
        'Content-Type': 'application/json'
      },
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
      return res.status(r.status).json({
        error: 'OpenAI API error',
        status: r.status,
        body: safeJson(text)
      });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'LLM empty response', raw: data });
    }

    let json;
    try {
      json = JSON.parse(content);
    } catch (e) {
      return res.status(502).json({
        error: 'LLM returned non-JSON',
        sample: String(content).slice(0, 600)
      });
    }

    // safety: гарантируем, что план есть, даже если модель промолчала
    if (!Array.isArray(json.plan_7d)) json.plan_7d = [];

    return res.status(200).json({
      profile: { handle, platform, goal, signals },
      ...json
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}

// helper
function safeJson(s) {
  try { return JSON.parse(s); } catch { return String(s); }
}
