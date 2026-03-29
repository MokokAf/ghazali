import { supabaseQuery, getAuthUser } from './_supabase.js';
import { setCors, getUserIdentity } from './_cors.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  try {
    const { conversation_id, content } = req.body;

    if (!conversation_id || !content) {
      return res.status(400).json({ error: 'conversation_id and content are required' });
    }

    await supabaseQuery('messages', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        conversation_id,
        role: 'assistant',
        content,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Save response error:', err);
    res.status(500).json({ error: 'Failed to save response' });
  }
}
