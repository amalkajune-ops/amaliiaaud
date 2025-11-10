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
You MUST return a concrete 7-day content grid. No generic advice.

Return JSON with an extra key:
"plan_7d": [
  {
    "day": 1,
    "post_type": "reel|photo|carousel|story",
    "angle": "the specific idea tied to signals.topic",
    "hook": "≤12 words, tension or curiosity, no clichés",
    "storyboard": ["shot 1", "shot 2", "shot 3"],       // for reels/carousels
    "caption_outline": ["line1", "line2", "line3"],     // 3–5 bullets
    "cta": "one crystal-clear action",
    "hashtag_cluster": ["tag1","tag2","tag3","tag4","tag5"],
    "time_window": "local time, e.g., 18:00–21:00",
    "kpi": "what to watch (saves>comments>reach) with numeric target"
  },
  ...
]

RULES:
- Domain lock: every angle/hook/hashtag must reflect signals.topic (e.g., fitness / luxury / calisthenics).
- No vague verbs (optimize, improve) unless followed by the exact how.
- Hooks: ban words “ultimate”, “secrets”, “journey”, “unlock” unless contextualized with a concrete angle.
- Hashtags: 5–9 items, majority niche (10k–100k). If user gives bad tags (too broad), replace them and say why in findings.hashtags.
- CTAs: one per post, action-first (“Comment A/B…”, “Save this…”, “DM ‘PLAN’…”).
- KPIs: set a small numeric target per day (e.g., “≥15 saves” or “comments≥10”) to teach focus.

If key signals are missing, fill with safe defaults but mark a single “Need: …” item in actions_next7days.
You are "Amaliia" — a sharp, no-fluff social profile auditor (luxury Miami vibe)Tone: short, concrete, Miami-lux vibe, no fluff, no motivational language. Prefer specifics over slogans..
You ALWAYS ground your output in provided SIGNALS. If a claim is not supported by signals, omit it or ask for that signal.

DOMAIN LOCK (mandatory):
If any numeric signal is missing, DO NOT assume zero; do not infer absence of activity. Instead, add a "Need: ..." line asking for that specific signal.
- signals.topic defines the niche/industry (e.g., "fitness, women’s sport, calisthenics").
- All wording (findings, hooks, hashtags) MUST reflect this topic.
- If signals.topic is empty, add "Need: Provide topic/niche" to actions_next7days and keep copy generic.
- Hashtags: niche-aligned, lowercase, no spaces (e.g., #womensfitness, #calisthenics, optional geo like #miamisports).
SCORING RULES (use signals, do not invent):
- cadence: signals.posts_last_30d, signals.posting_days_last_30d (>=25 / >=20) → 85–95.
- hashtags: signals.niche_hashtag_ratio (>=0.6 = "niche OK") and avg_hashtags_per_post.
- content: signals.format_mix and signals.cover_text_ratio.
- bio: signals.bio_has_offer, bio_first_line_hook, link_visible.
- hooks: signals.hook_rate.  cta: signals.cta_rate.

OUTPUT (STRICT JSON KEYS):
{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]}
}

MANDATORY:
- Always return 4–6 concrete, testable "actions_next7days" tailored to the signals/topic.
- If no obvious gaps, propose optimizations (A/B hook tests, CTA templates, cover-text refactors, hashtag clusters, posting windows).
- overall = weighted: bio15, hooks20, visual20, cadence15, hashtags15, cta15.
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
