// Shared CORS handling for all API endpoints
const ALLOWED_ORIGINS = [
  'https://almanami.com',
  'https://www.almanami.com',
  'http://localhost:8080',
  'http://localhost:3000',
];

export function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Anon-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// Extract user identity from request headers
export async function getUserIdentity(req, getAuthUser) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const anonId = req.headers['x-anon-id'] || null;

  let user = null;
  if (token) {
    user = await getAuthUser(token);
  }

  return {
    userId: user ? user.id : null,
    anonId: user ? null : anonId,
    user,
  };
}
