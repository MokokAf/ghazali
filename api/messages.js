import { supabaseQuery, getAuthUser } from './_supabase.js';
import { setCors, getUserIdentity } from './_cors.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Supabase not configured' });
  }

  const conversationId = req.query.conversation_id;
  if (!conversationId) {
    return res.status(400).json({ error: 'conversation_id is required' });
  }

  const identity = await getUserIdentity(req, getAuthUser);
  const { userId, anonId } = identity;

  if (!userId && !anonId) {
    return res.status(401).json({ error: 'No user identity' });
  }

  try {
    // Verify conversation ownership
    const userFilter = userId ? `user_id=eq.${userId}` : `anon_id=eq.${anonId}`;
    const conv = await supabaseQuery(
      `conversations?id=eq.${conversationId}&${userFilter}&select=id`,
    );
    if (!conv || conv.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await supabaseQuery(
      `messages?conversation_id=eq.${conversationId}&select=id,role,content,created_at&order=created_at.asc`,
    );

    return res.json(messages || []);
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Failed to get messages' });
  }
}
