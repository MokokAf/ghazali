import { supabaseQuery, getAuthUser } from './_supabase.js';
import { setCors, getUserIdentity } from './_cors.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  const identity = await getUserIdentity(req, getAuthUser);
  const { userId, anonId } = identity;

  if (!userId && !anonId) {
    return res.status(401).json({ error: 'No user identity' });
  }

  const userFilter = userId ? `user_id=eq.${userId}` : `anon_id=eq.${anonId}`;

  if (req.method === 'GET') {
    try {
      const conversations = await supabaseQuery(
        `conversations?${userFilter}&select=id,title,created_at&order=created_at.desc`,
      );
      return res.json(conversations || []);
    } catch (err) {
      console.error('List conversations error:', err);
      return res.status(500).json({ error: 'Failed to list conversations' });
    }
  }

  if (req.method === 'DELETE') {
    const id = req.query.id || (req.body && req.body.id);
    if (!id) {
      return res.status(400).json({ error: 'Conversation id is required' });
    }

    try {
      // Verify ownership before deleting
      const existing = await supabaseQuery(
        `conversations?id=eq.${id}&${userFilter}&select=id`,
      );
      if (!existing || existing.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Delete messages first (cascade may handle this, but be explicit)
      await supabaseQuery(`messages?conversation_id=eq.${id}`, { method: 'DELETE' });
      await supabaseQuery(`conversations?id=eq.${id}`, { method: 'DELETE' });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Delete conversation error:', err);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
