// /api/audit2.js — robust + SIGNALS + GET support
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // читаем тело (POST) и/или query (?handle=...&platform=...&goal=...&signals=JSON)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = Object.fromEntries(url.searchParams.entries());

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const handle   = rawBody.handle   ?? q.handle;
    const platform = rawBody.platform ?? q.platform ?? 'Instagram';
    const goal     = rawBody.goal     ?? q.goal     ?? 'Growth';

    // signals можно передать объектом в POST или как строку JSON в ?signals=
    let signals = rawBody.signals;
    if (!signals && q.signals) {
      try { signals = JSON.parse(q.signals); } catch {}
    }

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
You ALWAYS ground your output in provided SIGNALS. If a claim is not supported by signals, either omit it or ask to provide that signal.
Return STRICT JSON with keys exactly as schema:

{
 "scores":{"bio":0-100,"hooks":0-100,"visual":0-100,"cadence":0-100,"hashtags":0-100,"cta":0-100,"overall":0-100},
 "findings":{"bio":[],"content":[],"cadence":[],"hashtags":[]},
 "actions_next7days":[],
 "ready_to_copy":{"hooks":[],"hashtags":[]}
}

SCORING RULES (must use signals):
- cadence: use signals.posts_last_30d and signals.posting_days_last_30d; daily posting (>=25 posts / >=20 days) = 85–95 unless other issues.
- hashtags: use signals.niche_hashtag_ratio (0..1) and avg_hashtags_per_post; if ratio >= 0.6 mark as "niche OK".
- content: use signals.format_mix (e.g., {"reels":0.6,"photos":0.3,"carousels":0.1}) and signals.cover_text_ratio.
- bio: check signals.bio_has_offer (true/false), bio_first_line_hook (true/false), link_visible (true/false).
- hooks: use signals.hook_rate (0..1) from recent posts (title/first 8–12 words with question/tension).
- cta: use signals.cta_rate (0..1).

CONSTRAINTS:
- Do NOT invent claims. If signal is missing, write a neutral phrasing or add 1 actionable data-request item (prefixed with "Need: ...") in actions_next7days.
- Tailor tone to short, punchy, Miami-lux vibe; no fluff.
- overall = weighted: bio 15, hooks 20, visual 20, cadence 15, hashtags 15, cta 15.

Output English only.`.trim();

    // ВАЖНО: тут делаем реальный запрос в OpenAI (этого блока у тебя не было)
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
          { role: 'user', content:
            `Platform: ${platform}\n` +
            `Handle: ${handle}\n` +
            `Goal: ${goal}\n` +
            `SIGNALS: ${JSON.stringify(signals || {})}`
          }
        ]
      }),
      cache: 'no-store'
    });

    // прозрачные ошибки от OpenAI
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
    try { json = JSON.parse(content); }
    catch {
      return res.status(502).json({
        error: 'LLM returned non-JSON',
        sample: String(content).slice(0, 500)
      });
    }

    return res.status(200).json({
      profile: { handle, platform, goal, signals: signals ?? null },
      ...json
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return String(s); }
}
