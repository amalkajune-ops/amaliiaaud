// /api/checkout.js
export const config = { runtime: 'nodejs' }; // допустимые: 'nodejs' | 'edge'

import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID; // создай продукт+price в Stripe и вставь ID вида price_***

    if (!secret || !priceId) {
      return res.status(500).json({
        error: 'Missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID env vars',
      });
    }

    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });

    const origin =
      (req.headers.origin && String(req.headers.origin)) ||
      'https://amaliiaaud.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/audit.html?success=1`,
      cancel_url: `${origin}/audit.html?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
