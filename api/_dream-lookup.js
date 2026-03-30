import { DREAM_ENTRIES } from './_dream-data.js';

let dreamDict = null;
let lookupIndex = null; // Map<lowercase_word, Set<entry_key>>
let mainEntryNames = null; // Set of simple (non-compound) entry names

function loadData() {
  if (dreamDict) return;
  if (!DREAM_ENTRIES) {
    console.error('Dream dictionary not available');
    dreamDict = {};
    return;
  }
  dreamDict = DREAM_ENTRIES;
  lookupIndex = new Map();
  mainEntryNames = new Set();

  // primaryAliases: for each entry, the set of single-word aliases that ARE the entry
  // (vs compound entries where a word is just part of the name)
  const primaryAliases = new Map(); // entry_key -> Set<word>

  for (const [key, entry] of Object.entries(dreamDict)) {
    if (!key.includes(' ') && !key.includes('-')) {
      mainEntryNames.add(key);
    }

    const primaries = new Set([key]);
    const aliases = entry.lookup_aliases || { en: [key] };
    for (const lang of Object.keys(aliases)) {
      for (const word of aliases[lang]) {
        const normalized = word.toLowerCase().trim();
        if (!normalized) continue;
        addToIndex(normalized, key);
        // If the alias is a single word, it's a primary alias for this entry
        if (!normalized.includes(' ')) {
          primaries.add(normalized);
        }
        for (const part of normalized.split(/\s+/)) {
          if (part.length >= 2) {
            addToIndex(part, key);
          }
        }
      }
    }
    primaryAliases.set(key, primaries);
  }

  // Store primaryAliases on the module-level for use in scoring
  dreamDict._primaryAliases = primaryAliases;

  // Patch missing aliases: common synonyms/verb forms → existing entries
  const aliasPatch = {
    // English
    'chasing': 'pursuit', 'chase': 'pursuit', 'chased': 'pursuit',
    'cried': 'crying', 'cry': 'crying', 'weeping': 'crying', 'weep': 'crying', 'tears': 'crying',
    'naked': 'nakedness', 'nude': 'nakedness',
    'falling': 'fall', 'fell': 'fall',
    'swimming': 'swimming', 'swam': 'swimming',
    'climbing': 'ascending in the skies',
    'drowning': 'drowning', 'drowned': 'drowning',
    'praying': 'prayers', 'prayer': 'prayers', 'pray': 'prayers',
    'stealing': 'theft', 'stole': 'theft',
    'singing': 'singing', 'sang': 'singing',
    'laughing': 'laughter', 'laugh': 'laughter',
    'eating': 'food', 'ate': 'food',
    'killing': 'killing', 'killed': 'killing',
    'dying': 'death', 'died': 'death', 'dead': 'death',
    'pregnant': 'pregnancy',
    'lost': 'lost',
    'ocean': 'sea', 'river': 'river', 'lake': 'lake',
    'baby': 'child', 'babies': 'child', 'infant': 'child', 'newborn': 'child',
    // French
    'tombais': 'fall', 'tombe': 'fall', 'tomber': 'fall',
    'volais': 'flying', 'voler': 'flying',
    'pleurais': 'crying', 'pleure': 'crying', 'pleurer': 'crying',
    'courais': 'running away', 'courir': 'running away',
    'nageais': 'swimming', 'nager': 'swimming',
    'parlait': 'speaking', 'parler': 'speaking',
    'mère': 'mother', 'père': 'father', 'frère': 'brother', 'soeur': 'sister',
    'maison': 'house', 'porte': 'door', 'portes': 'door',
    'bébé': 'child', 'enfant': 'child',
    'mer': 'sea', 'océan': 'sea',
    'cheval': 'horse', 'chevaux': 'horse',
    'blanc': 'colors', 'blanche': 'colors', 'vert': 'colors', 'verte': 'colors',
    'noir': 'black', 'noire': 'black',
    'or': 'gold', 'eau': 'water', 'puits': 'well',
    'nuit': 'night', 'destin': 'night of power',
    // Arabic common verb forms / nouns
    'أبكي': 'crying', 'بكاء': 'crying', 'يبكي': 'crying',
    'يطاردني': 'pursuit', 'مطاردة': 'pursuit',
    'طيران': 'flying', 'أطير': 'flying', 'يطير': 'flying',
    'سقوط': 'fall', 'أسقط': 'fall', 'يسقط': 'fall', 'تسقط': 'fall',
    'غرق': 'drowning',
    'المنام': 'dream', 'حلم': 'dream', 'حلمت': 'dream',
    'بيت': 'house', 'منزل': 'house', 'دار': 'house',
    'باب': 'door', 'أبواب': 'door',
    'ذهب': 'gold',
    'سكين': 'knife',
    'أبي': 'father', 'أمي': 'mother', 'أخي': 'brother',
    // Turkish
    'bebek': 'child', 'çocuk': 'child',
    'ağlıyordum': 'crying', 'ağlıyordu': 'crying', 'ağlama': 'crying',
    'düşüyordum': 'fall', 'düşmek': 'fall',
    'uçuyordum': 'flying', 'uçmak': 'flying',
    'koşuyordum': 'running away', 'koşmak': 'running away',
    'taşıyordum': 'carrying',
    'ev': 'house', 'kapı': 'door',
    'deniz': 'sea', 'nehir': 'river',
    'gece': 'night',
    // German
    'gelaufen': 'running away', 'laufen': 'running away',
    'geflogen': 'flying', 'fliegen': 'flying',
    'gefallen': 'fall',
    'geweint': 'crying', 'weinen': 'crying',
    'öffentlichkeit': 'marketplace',
    'haus': 'house', 'tür': 'door',
  };
  for (const [alias, target] of Object.entries(aliasPatch)) {
    if (dreamDict[target]) {
      addToIndex(alias, target);
    }
  }
}

function addToIndex(word, entryKey) {
  if (!lookupIndex.has(word)) {
    lookupIndex.set(word, new Set());
  }
  lookupIndex.get(word).add(entryKey);
}

function resolveRedirects(key, depth = 0) {
  if (depth > 5) return null;
  const entry = dreamDict[key];
  if (!entry) return null;
  if (entry.redirect && !entry.text) {
    return resolveRedirects(entry.redirect, depth + 1);
  }
  return entry;
}

/**
 * Strip common Arabic possessive/pronoun suffixes for fuzzy matching.
 */
function arabicStemVariants(word) {
  const variants = [word];
  // Suffix stripping: possessive pronouns
  const suffixes = ['ي', 'ها', 'هم', 'هن', 'نا', 'كم', 'كن', 'ه', 'ك'];
  for (const suf of suffixes) {
    if (word.endsWith(suf) && word.length > suf.length + 2) {
      variants.push(word.slice(0, -suf.length));
    }
  }
  // Prefix stripping: ال (the), ب (with/in), و (and), ف (so), ل (for/to), ك (like)
  const prefixes = ['ال', 'بال', 'وال', 'فال', 'لل'];
  for (const pre of prefixes) {
    if (word.startsWith(pre) && word.length > pre.length + 2) {
      variants.push(word.slice(pre.length));
    }
  }
  // Single-char prefixes: ب و ف ل ك
  const singlePrefixes = ['ب', 'و', 'ف', 'ل', 'ك'];
  for (const pre of singlePrefixes) {
    if (word.startsWith(pre) && word.length > 3) {
      variants.push(word.slice(1));
    }
  }
  return variants;
}

/**
 * Generate stem variants for French/Turkish/German/English fuzzy matching.
 */
function latinStemVariants(word) {
  const variants = [word];
  // English: -ing, -ed, -s
  if (word.endsWith('ing') && word.length > 5) {
    variants.push(word.slice(0, -3)); // running → runn (might not help, but combined with index)
    variants.push(word.slice(0, -3) + 'e'); // chasing → chase
  }
  // French: plurals, conjugation
  if (word.endsWith('s') && word.length > 3) variants.push(word.slice(0, -1));
  if (word.endsWith('ent') && word.length > 5) variants.push(word.slice(0, -3) + 'er');
  if (word.endsWith('ait') && word.length > 5) variants.push(word.slice(0, -3) + 'er');
  // German: plural forms
  if (word.endsWith('en') && word.length > 4) variants.push(word.slice(0, -2));
  if (word.endsWith('er') && word.length > 4) variants.push(word.slice(0, -2));
  // Turkish: common suffixes
  if (word.endsWith('ler') && word.length > 4) variants.push(word.slice(0, -3));
  if (word.endsWith('lar') && word.length > 4) variants.push(word.slice(0, -3));
  if (word.endsWith('da') && word.length > 3) variants.push(word.slice(0, -2));
  if (word.endsWith('de') && word.length > 3) variants.push(word.slice(0, -2));
  if (word.endsWith('ı') && word.length > 3) variants.push(word.slice(0, -1));
  if (word.endsWith('i') && word.length > 3) variants.push(word.slice(0, -1));
  return variants;
}

function isArabic(word) {
  return /[\u0600-\u06FF]/.test(word);
}

// Islamic prayer formulas to strip from dream text before matching
const ISLAMIC_FORMULAS = [
  'الله يرحمها', 'الله يرحمه', 'الله يرحمهم',
  'رحمه الله', 'رحمها الله', 'رحمهم الله',
  'إن شاء الله', 'ان شاء الله',
  'بسم الله', 'بسم الله الرحمن الرحيم',
  'سبحان الله', 'الحمد لله', 'لا إله إلا الله',
  'صلى الله عليه وسلم', 'عليه السلام', 'عليها السلام',
  'ما شاء الله', 'لا حول ولا قوة إلا بالله',
  'أعوذ بالله', 'استغفر الله', 'جزاك الله',
  'بارك الله', 'تبارك الله',
  // Transliterated forms commonly used in French/English
  'alhamdulillah', 'al hamdoulillah', 'hamdoulilah',
  'inshallah', 'insha allah', 'inch allah',
  'mashallah', 'masha allah', 'macha allah',
  'bismillah', 'subhanallah', 'astaghfirullah',
  'sallallahu alayhi wasallam',
];

// Stop words
const STOP_WORDS = new Set([
  // French
  'un','une','le','la','les','de','du','des','et','en','au','aux','ce','se',
  'ne','je','tu','il','on','ma','sa','ta','mon','son','ton','mes','ses','tes',
  'que','qui','dans','sur','par','pour','avec','pas','est','suis','ai','très',
  'elle','nous','vous','ils','mais','bien','tout','plus','comme','être','avoir',
  'fait','été','dit','vu','rêvé','aussi','ça','si','où','là','après','alors',
  'donc','car','ni','ou','chaque','autre','même','rien','jamais','précis',
  'pendant','avant',
  // English
  'the','and','was','were','has','had','have','are','been','being','this','that',
  'with','from','but','not','you','all','can','her','his','one','our','out','in',
  'its','who','how','did','get','got','may','too','own','she','him','why',
  'let','say','two','way','few','new','now','old','see','time','very',
  'when','come','make','like','some','into','than','them','then','what','will',
  'just','also','back','after','over','such','only','other','could','would',
  'should','about','which','their','there','these','those','where','before',
  'while','again','someone','something','felt','remember','details','peaceful',
  'bizarre','never',
  // German
  'der','die','das','ein','eine','und','ist','ich','sie','wir','ihr','mir',
  'den','dem','von','auf','für','mit','als','aus','bei','nach','noch','wie',
  'hat','bin','war','habe','sind','mein','dein','sein','sich',
  // Turkish
  'bir','ve','bu','da','de','ile','ben','sen','biz','siz','çok','var',
  'için','olan','gibi','ama','hem','ise',
  // Arabic common particles
  'من','في','على','إلى','عن','أن','هذا','هذه','ذلك','تلك','هو','هي',
  'لا','لم','لن','قد','كان','إن','ما','لي','كنت','كنا','كانت',
  'يا','ثم','أو','بل','حتى','منذ','بعد','قبل','عند','بين',
]);

/**
 * Extract dream context from user's dream text.
 * Returns formatted string for injection into user message, or null if no matches.
 */
export function getDreamContext(dreamText) {
  try {
    return _getDreamContextInner(dreamText);
  } catch (e) {
    console.error('getDreamContext error:', e.message);
    return null;
  }
}

function _getDreamContextInner(dreamText) {
  loadData();

  // Strip Islamic formulas before matching (they're not dream symbols)
  let cleanedText = dreamText;
  for (const formula of ISLAMIC_FORMULAS) {
    cleanedText = cleanedText.replace(new RegExp(formula, 'gi'), ' ');
  }

  const normalized = cleanedText.toLowerCase();
  const allTokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);
  const words = allTokens.filter(w => !STOP_WORDS.has(w));

  // Score entries by match quality
  const scores = new Map();

  // Check single words with stem variants
  for (const word of words) {
    const variants = isArabic(word) ? arabicStemVariants(word) : latinStemVariants(word);
    for (const variant of variants) {
      const matches = lookupIndex.get(variant);
      if (matches) {
        const stemPenalty = variant === word ? 1 : 0.8;
        const primaryAliases = dreamDict._primaryAliases;
        for (const key of matches) {
          // FIX #1: Strong bonus when the search word is a primary alias
          // "su" is a primary alias for "water" but not for "cold water"
          const isMainEntry = mainEntryNames.has(key);
          const isPrimaryMatch = primaryAliases.get(key)?.has(variant) || false;
          const nameMatch = isPrimaryMatch ? 3.0 : 1.0;
          const bonus = isMainEntry ? 1.5 : 1.0;
          const score = stemPenalty * nameMatch * bonus;
          scores.set(key, (scores.get(key) || 0) + score);
        }
      }
    }
  }

  // Check bigrams
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    const matches = lookupIndex.get(bigram);
    if (matches) {
      for (const key of matches) {
        const bonus = mainEntryNames.has(key) ? 1.3 : 1.0;
        scores.set(key, (scores.get(key) || 0) + 3 * bonus);
      }
    }
  }

  // Check trigrams
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    const matches = lookupIndex.get(trigram);
    if (matches) {
      for (const key of matches) {
        scores.set(key, (scores.get(key) || 0) + 5);
      }
    }
  }

  if (scores.size === 0) return null;

  // FIX #4: Filter — drop entries scoring < 30% of the top match
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topScore = sorted[0][1];
  const threshold = topScore * 0.3;
  const filtered = sorted.filter(([_, s]) => s >= threshold);

  if (filtered.length === 0) return null;

  // Take top 3
  const topEntries = filtered.slice(0, 3);

  // Build context string
  const parts = [];
  for (const [key] of topEntries) {
    const entry = resolveRedirects(key);
    if (!entry || !entry.text) continue;

    let text = entry.text;
    if (text.length > 1500) {
      text = text.slice(0, 1500).replace(/\s+\S*$/, '') + '…';
    }

    const title = key.charAt(0).toUpperCase() + key.slice(1);
    const aliases = entry.aliases?.length ? ` (${entry.aliases.join(', ')})` : '';
    parts.push(`### ${title}${aliases}\n${text}`);
  }

  if (parts.length === 0) return null;

  return parts.join('\n\n');
}
