import { setCors } from './_cors.js';
import { readFile, writeFile } from 'node:fs/promises';

const CACHE_VERSION = 'v3';
const MEMORY_CACHE_KEY = `__ghazaliNameMeaningCache_${CACHE_VERSION}`;
const cache = globalThis[MEMORY_CACHE_KEY] || new Map();
globalThis[MEMORY_CACHE_KEY] = cache;
const TMP_CACHE_PATH = `/tmp/ghazali-name-meanings-${CACHE_VERSION}.json`;
const MAX_PERSISTED_NAMES = 1000;

function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\s'-]/gu, '')
    .replace(/\s+/g, ' ');
}

function cleanGeneratedText(text) {
  return String(text || '')
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function extractResponseText(data) {
  if (data?.output_text) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
      if (content.type === 'text' && content.text) parts.push(content.text);
    }
  }
  return parts.join(' ');
}

async function readPersistedCache() {
  try {
    const text = await readFile(TMP_CACHE_PATH, 'utf8');
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function getPersistedMeaning(key) {
  const persisted = await readPersistedCache();
  const meaning = persisted[key]?.meaning;
  if (meaning) cache.set(key, meaning);
  return meaning || null;
}

async function setPersistedMeaning(key, meaning) {
  const persisted = await readPersistedCache();
  persisted[key] = {
    meaning,
    created_at: new Date().toISOString(),
  };

  const entries = Object.entries(persisted)
    .sort((a, b) => String(b[1].created_at).localeCompare(String(a[1].created_at)))
    .slice(0, MAX_PERSISTED_NAMES);

  await writeFile(TMP_CACHE_PATH, JSON.stringify(Object.fromEntries(entries)), 'utf8');
}

function buildNameMeaningSystemPrompt(name) {
  return [
    'Tu écris pour Ghazali, une PWA spirituelle islamique en français.',
    'Explique le prénom donné avec chaleur, simplicité et profondeur personnelle.',
    'Donne le sens, la racine, l’origine linguistique, ou une association culturelle connue quand elle existe.',
    'Si le sens exact est incertain, dis-le clairement puis propose une résonance douce sans inventer de certitude.',
    'Ne prétends jamais connaître avec certitude une étymologie incertaine.',
    'Ne mentionne jamais IA, modèle, OpenAI, Anthropic, Claude, système, prompt ou génération.',
    `Commence par le prénom "${name}".`,
    'Réponds en un seul court paragraphe de 45 à 75 mots.',
  ].join(' ');
}

function buildOpenAIInput(name) {
  return [
    {
      role: 'system',
      content: buildNameMeaningSystemPrompt(name),
    },
    {
      role: 'user',
      content: `Prénom à interpréter: ${name}`,
    },
  ];
}

function extractAnthropicText(data) {
  return (data?.content || [])
    .filter(part => part?.type === 'text' && part.text)
    .map(part => part.text)
    .join(' ');
}

async function generateMeaningWithOpenAI(name, apiKey) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_NAME_MODEL || 'gpt-4.1-mini',
      max_output_tokens: 210,
      temperature: 0.45,
      input: buildOpenAIInput(name),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI name meaning failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const meaning = cleanGeneratedText(extractResponseText(data));
  if (!meaning) throw new Error('OpenAI returned an empty name meaning');
  return meaning;
}

async function generateMeaningWithAnthropic(name, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_NAME_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 210,
      temperature: 0.45,
      system: buildNameMeaningSystemPrompt(name),
      messages: [
        {
          role: 'user',
          content: `Prénom à interpréter: ${name}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic name meaning failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const meaning = cleanGeneratedText(extractAnthropicText(data));
  if (!meaning) throw new Error('Anthropic returned an empty name meaning');
  return meaning;
}

async function generateMeaning(name) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    try {
      return await generateMeaningWithOpenAI(name, openaiKey);
    } catch (err) {
      if (!anthropicKey) throw err;
      console.error('OpenAI name meaning failed, trying Anthropic fallback:', err);
    }
  }

  if (anthropicKey) {
    return generateMeaningWithAnthropic(name, anthropicKey);
  }

  throw new Error('No name meaning provider configured');
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
    const name = rawName.trim().replace(/\s+/g, ' ');
    const key = normalizeName(name);

    if (!key || key.length < 2 || key.length > 60) {
      return res.status(400).json({ error: 'Invalid name' });
    }

    const cachedMeaning = cache.get(key) || await getPersistedMeaning(key);
    if (cachedMeaning) {
      return res.json({ meaning: cachedMeaning, cached: true });
    }

    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'Name meaning unavailable' });
    }

    let meaning = '';
    try {
      meaning = await generateMeaning(name);
    } catch (err) {
      console.error('Name meaning provider failed:', err);
      return res.status(502).json({ error: 'Name meaning unavailable' });
    }

    cache.set(key, meaning);
    await setPersistedMeaning(key, meaning);

    res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=86400');
    return res.json({ meaning, cached: false });
  } catch (err) {
    console.error('Name meaning error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
