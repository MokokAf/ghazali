import { setCors } from './_cors.js';
import { readFile, writeFile } from 'node:fs/promises';

const cache = globalThis.__ghazaliNameMeaningCache || new Map();
globalThis.__ghazaliNameMeaningCache = cache;
const CACHE_VERSION = 'v2';
const TMP_CACHE_PATH = `/tmp/ghazali-name-meanings-${CACHE_VERSION}.json`;
const MAX_PERSISTED_NAMES = 1000;
const GENERIC_FALLBACK_MARKERS = [
  'porte une douceur discrete',
  'presence qui cherche le vrai',
  'ce qui se cache deja en toi',
  'allah eclairer',
];

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

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericFallback(text) {
  const normalized = normalizeText(text);
  return GENERIC_FALLBACK_MARKERS.some((marker) => normalized.includes(marker));
}

function isUsableMeaning(text, name) {
  const meaning = cleanGeneratedText(text);
  if (!meaning || isGenericFallback(meaning)) return false;

  const normalizedMeaning = normalizeText(meaning);
  const normalizedName = normalizeText(name).split(' ')[0];
  return normalizedName.length < 2 || normalizedMeaning.includes(normalizedName);
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
  if (meaning && !isGenericFallback(meaning)) {
    cache.set(key, meaning);
    return meaning;
  }
  return null;
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

function buildNameMeaningPrompt(name, strict = false) {
  return [
    {
      role: 'system',
      content: [
        'Tu écris pour Ghazali, une PWA spirituelle islamique en français.',
        'Ta mission est d’expliquer le sens réel du prénom donné, pas de produire une méditation générique.',
        'Réponds avec chaleur, délicatesse et profondeur personnelle, mais ancre toujours le texte dans le prénom lui-même.',
        'Donne au moins un point concret: sens, racine, origine linguistique, référence culturelle ou association connue.',
        'Si l’étymologie est incertaine, dis-le simplement, puis explique une résonance plausible liée au son, à l’usage ou aux associations connues du prénom.',
        'Évite les phrases qui pourraient convenir à n’importe quel prénom.',
        'Ne prétends jamais connaître avec certitude une étymologie incertaine.',
        'Ne mentionne jamais IA, modèle, OpenAI, système, prompt ou génération.',
        strict
          ? 'Réécris de façon plus spécifique: commence par le prénom, puis donne son sens ou son origine avant la touche spirituelle.'
          : 'Commence par le prénom lui-même.',
        'Réponds en un seul court paragraphe de 45 à 70 mots.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Prénom à interpréter: ${name}`,
    },
  ];
}

async function generateMeaning(name, apiKey, strict = false) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_NAME_MODEL || 'gpt-4.1-mini',
      max_output_tokens: 210,
      temperature: strict ? 0.35 : 0.45,
      input: buildNameMeaningPrompt(name, strict),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI name meaning failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  return cleanGeneratedText(extractResponseText(data));
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

    const memoryMeaning = cache.get(key);
    const cachedMeaning = !isGenericFallback(memoryMeaning) && memoryMeaning
      ? memoryMeaning
      : await getPersistedMeaning(key);

    if (cachedMeaning) {
      return res.json({ meaning: cachedMeaning, cached: true });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Name meaning unavailable' });
    }

    let meaning;
    try {
      meaning = await generateMeaning(name, apiKey);
      if (!isUsableMeaning(meaning, name)) {
        meaning = await generateMeaning(name, apiKey, true);
      }
    } catch (err) {
      console.error('OpenAI name meaning failed:', err);
      return res.status(502).json({ error: 'Name meaning unavailable' });
    }

    if (!isUsableMeaning(meaning, name)) {
      return res.status(502).json({ error: 'Name meaning was too generic' });
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
