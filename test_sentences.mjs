import { cleanAndSplitSentences, PersonaService } from './services/personas.js';
import { VoiceService } from './services/voice.js';

console.log('=== Running Sentence Segmentation & Spoken Announcement Tests ===\n');

const testCases = [
  {
    name: 'Abbreviations with St., U.S., c. and years',
    input: 'The St. Louis Art Museum is located on U.S. Route 66 in St. Louis, Missouri. Founded in c. 1879, it welcomes over 500,000 visitors annually. It features historic paintings and sculptures.',
    concise: 'The St. Louis Art Museum is located on U.S. Route 66 in St. Louis, Missouri.',
    rich: 'The St. Louis Art Museum is located on U.S. Route 66 in St. Louis, Missouri. Founded in c. 1879, it welcomes over 500,000 visitors annually.'
  },
  {
    name: 'Honorifics Dr., Jr., and decimals with units 14.5 sq. mi.',
    input: 'Dr. Martin Luther King Jr. Blvd passes by approx. 14.5 sq. mi. of parkland. The park was opened in 1968. It contains a botanical garden.',
    concise: 'Dr. Martin Luther King Jr. Blvd passes by approx. 14.5 sq. mi. of parkland.',
    rich: 'Dr. Martin Luther King Jr. Blvd passes by approx. 14.5 sq. mi. of parkland. The park was opened in 1968.'
  },
  {
    name: 'Citation bracket stripping ([1], [note 2])',
    input: 'Built in 1935 across the Periyar River.[1][note 2] Known as the Gateway to the High Ranges. It remains an active bridge.',
    concise: 'Built in 1935 across the Periyar River.',
    rich: 'Built in 1935 across the Periyar River. Known as the Gateway to the High Ranges.'
  },
  {
    name: 'OSM description without trailing period',
    input: 'Scenic viewpoint overlooking the winding river valley below',
    concise: 'Scenic viewpoint overlooking the winding river valley below.',
    rich: 'Scenic viewpoint overlooking the winding river valley below.'
  },
  {
    name: 'Multiple initials (e.g. John F. Kennedy)',
    input: 'The John F. Kennedy Memorial was dedicated in 1970. It was designed by Philip Johnson. It is made of concrete.',
    concise: 'The John F. Kennedy Memorial was dedicated in 1970.',
    rich: 'The John F. Kennedy Memorial was dedicated in 1970. It was designed by Philip Johnson.'
  }
];

let failed = 0;

for (const tc of testCases) {
  console.log(`Testing: ${tc.name}`);
  const conciseResult = cleanAndSplitSentences(tc.input, 1);
  const richResult = cleanAndSplitSentences(tc.input, 2);

  if (conciseResult !== tc.concise) {
    console.error(`  [FAIL CONCISE]\n    Expected: "${tc.concise}"\n    Got:      "${conciseResult}"`);
    failed++;
  } else {
    console.log(`  [PASS CONCISE] "${conciseResult}"`);
  }

  if (richResult !== tc.rich) {
    console.error(`  [FAIL RICH]\n    Expected: "${tc.rich}"\n    Got:      "${richResult}"`);
    failed++;
  } else {
    console.log(`  [PASS RICH] "${richResult}"`);
  }
  console.log('');
}

// Test PersonaService formatSpeech
console.log('Testing PersonaService formatSpeech...');
const personas = new PersonaService('wanderer');
const samplePoi = {
  id: 'wiki-99',
  title: 'St. Peter Basilica',
  dist: 1200,
  extract: 'St. Peter Basilica is located in Vatican City. It was designed primarily by Donato Bramante and Michelangelo. Construction began in 1506.'
};

const spokenConcise = personas.formatSpeech(samplePoi, { isConcise: true, unitSystem: 'metric', relativeBearing: 'on your right' });
console.log('  Spoken Concise:', spokenConcise.text);
if (!spokenConcise.text.includes('St. Peter Basilica is located in Vatican City.')) {
  console.error('  [FAIL] Did not contain complete first sentence!');
  failed++;
} else {
  console.log('  [PASS] Spoken output contains complete sentence without mid-sentence cutoff.');
}

const spokenRich = personas.formatSpeech(samplePoi, { isConcise: false, unitSystem: 'metric', relativeBearing: 'on your right' });
console.log('  Spoken Rich:   ', spokenRich.text);
if (!spokenRich.text.includes('It was designed primarily by Donato Bramante and Michelangelo.')) {
  console.error('  [FAIL] Did not contain complete second sentence!');
  failed++;
} else {
  console.log('  [PASS] Spoken Rich output contains both full sentences.');
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\n=== ALL SENTENCE SEGMENTATION & ANNOUNCEMENT TESTS PASSED! ===');
}
