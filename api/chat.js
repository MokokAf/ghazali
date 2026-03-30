import { SYSTEM_PROMPT } from './_system-prompt.js';
import { supabaseQuery, getAuthUser } from './_supabase.js';
import { setCors, getUserIdentity } from './_cors.js';
// import { getDreamContext } from './_dream-lookup.js';

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const supabaseConfigured = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { messages, conversation_id, anon_id: bodyAnonId } = req.body;

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (messages.length > 100) {
      return res.status(400).json({ error: 'Too many messages' });
    }
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: 'Each message must have role and content' });
      }
      if (typeof msg.content === 'string' && msg.content.length > 10000) {
        return res.status(400).json({ error: 'Message content too long' });
      }
    }

    // Identify user
    let userId = null;
    let anonId = bodyAnonId || req.headers['x-anon-id'] || null;

    if (supabaseConfigured) {
      const identity = await getUserIdentity(req, getAuthUser);
      userId = identity.userId;
      if (userId) anonId = null;

      // Rate limiting: 3 assistant replies per user per hour
      // Skip for whitelisted users (comma-separated emails in env var)
      const whitelist = (process.env.RATE_LIMIT_WHITELIST || '').split(',').map(e => e.trim()).filter(Boolean);
      const isWhitelisted = identity.user && whitelist.includes(identity.user.email);

      const userFilter = isWhitelisted ? null : userId
        ? `conversations.user_id=eq.${userId}`
        : anonId
          ? `conversations.anon_id=eq.${anonId}`
          : null;

      if (userFilter) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        try {
          const recentMessages = await supabaseQuery(
            `messages?select=id,conversation_id,conversations(user_id,anon_id)&role=eq.assistant&created_at=gte.${oneHourAgo}&${userFilter}`,
          );
          if (recentMessages && recentMessages.length >= 3) {
            return res.status(429).json({
              error: 'rate_limit',
              message: 'Ahlam ne peut répondre que trois fois par heure. Merci de revenir dans une heure.',
            });
          }
        } catch (e) {
          console.error('Rate limit check failed:', e);
          // Don't block the request if rate limit check fails
        }
      }

      // Create conversation if needed + save user message
      if (conversation_id) {
        const userMsg = messages[messages.length - 1];
        try {
          // Check if conversation exists
          const existing = await supabaseQuery(
            `conversations?id=eq.${conversation_id}&select=id`,
          );

          if (!existing || existing.length === 0) {
            // Create new conversation with title from first message
            const title = userMsg.content.slice(0, 50) + (userMsg.content.length > 50 ? '…' : '');
            await supabaseQuery('conversations', {
              method: 'POST',
              prefer: 'return=minimal',
              body: {
                id: conversation_id,
                user_id: userId,
                anon_id: anonId,
                title,
              },
            });
          }

          // Save user message
          await supabaseQuery('messages', {
            method: 'POST',
            prefer: 'return=minimal',
            body: {
              conversation_id,
              role: 'user',
              content: userMsg.content,
            },
          });
        } catch (e) {
          console.error('Failed to save user message:', e);
        }
      }
    }

    // Dream dictionary injection (temporarily disabled for debugging)
    const enrichedMessages = [...messages];

    // Call Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: enrichedMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    // Stream SSE through to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
