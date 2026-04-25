import { setCors } from './_cors.js';
import { readFile, writeFile } from 'node:fs/promises';

const cache = globalThis.__ghazaliNameMeaningCache || new Map();
globalThis.__ghazaliNameMeaningCache = cache;
const TMP_CACHE_PATH = '/tmp/ghazali-name-meanings.json';
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

function fallbackMeaning(name) {
  return `${name} porte une douceur discrète: une présence qui cherche le vrai sans perdre sa délicatesse. Que ce prénom soit pour toi un rappel de revenir à ce qui apaise, d'avancer avec intention, et de laisser Allah éclairer ce qui se cache déjà en toi.`;
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const meaning = fallbackMeaning(name);
      cache.set(key, meaning);
      await setPersistedMeaning(key, meaning);
      return res.json({ meaning, cached: false, fallback: true });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_NAME_MODEL || 'gpt-4.1-mini',
        max_output_tokens: 180,
        input: [
          {
            role: 'system',
            content: [
              'Tu écris pour Ghazali, une PWA spirituelle islamique en français.',
              'Explique le prénom avec chaleur, délicatesse et profondeur personnelle.',
              'Ne prétends jamais connaître avec certitude une étymologie incertaine.',
              'Si le sens exact est incertain, parle de la résonance du prénom et de ce qu’il peut rappeler.',
              'Reste doux, sincère, jamais flatteur de façon excessive, jamais fataliste.',
              'Ne mentionne jamais IA, modèle, OpenAI, système, prompt ou génération.',
              'Réponds en un seul court paragraphe de 45 à 65 mots.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Prénom: ${name}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('OpenAI name meaning failed:', response.status, text);
      const meaning = fallbackMeaning(name);
      cache.set(key, meaning);
      await setPersistedMeaning(key, meaning);
      return res.json({ meaning, cached: false, fallback: true });
    }

    const data = await response.json();
    const meaning = cleanGeneratedText(extractResponseText(data)) || fallbackMeaning(name);
    cache.set(key, meaning);
    await setPersistedMeaning(key, meaning);

    res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=86400');
    return res.json({ meaning, cached: false });
  } catch (err) {
    console.error('Name meaning error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
