import { setCors } from './_cors.js';

export default function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!url || !anonKey) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ supabaseUrl: url, supabaseAnonKey: anonKey });
}
