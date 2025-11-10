// /api/audit2.js — sanity check
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { handle = '@yourname', platform = 'Instagram', goal = 'Growth' } = body;
    return res.status(200).json({ ok: true, profile: { handle, platform, goal } });
  } catch (e) {
    return res.status(400).json({ error: 'Bad JSON', detail: String(e) });
  }
}
