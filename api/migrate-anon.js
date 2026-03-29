import { supabaseQuery, getAuthUser } from './_supabase.js';
import { setCors } from './_cors.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  // Must be authenticated
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await getAuthUser(token);

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { anon_id } = req.body;
  if (!anon_id) {
    return res.status(400).json({ error: 'anon_id is required' });
  }

  try {
    // Update all conversations with this anon_id to the authenticated user
    await supabaseQuery(
      `conversations?anon_id=eq.${anon_id}`,
      {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: {
          user_id: user.id,
          anon_id: null,
        },
      },
    );

    res.json({ ok: true, migrated_for: user.id });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: 'Failed to migrate anonymous data' });
  }
}
