// /api/checkout.js
export const config = { runtime: 'nodejs' };
import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID;          // опционально
    const lookupKey = process.env.STRIPE_LOOKUP_KEY;      // предпочтительно

    if (!secret) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

    // Получаем цену: сначала по lookup_key, если нет — берём priceId
    let price;
    if (lookupKey) {
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1, expand: ['data.product'] });
      price = prices.data?.[0];
      if (!price) return res.status(400).json({ error: `No price for lookup_key: ${lookupKey}` });
    } else if (priceId) {
      price = await stripe.prices.retrieve(priceId);
    } else {
      return res.status(500).json({ error: 'Missing STRIPE_PRICE_ID or STRIPE_LOOKUP_KEY' });
    }

    const origin = (req.headers.origin && String(req.headers.origin)) || 'https://amaliiaaud.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/audit.html?success=1`,
      cancel_url: `${origin}/audit.html?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
