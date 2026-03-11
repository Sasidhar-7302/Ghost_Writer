const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filePath,
  }).outputText;

  const module = { exports: {} };
  const wrapped = new Function('require', 'module', 'exports', compiled);
  wrapped(require, module, module.exports);
  return module.exports;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

const { postProcessForInterview } = loadTsModule(
  path.join(__dirname, '..', 'electron', 'llm', 'postProcessor.ts')
);

console.log('\n=== Interview Naturalness Regression ===\n');

const repeatedOpening = postProcessForInterview(
  'So basically, I would start by clarifying the API boundary and then move to the data model.',
  'technical_concept',
  [
    'So basically, I would start by validating the requirements before deciding on the architecture.'
  ]
);

assertEqual(
  repeatedOpening,
  'I would start by clarifying the API boundary and then move to the data model.',
  'Should strip a recycled generic opener from a follow-up answer'
);
console.log('  OK recycled opener removed');

const repeatedFirstSentence = postProcessForInterview(
  'I led the migration from a monolith to services. The main lesson was that ownership boundaries mattered more than the framework choice.',
  'behavioral',
  [
    'I led the migration from a monolith to services.'
  ]
);

assertEqual(
  repeatedFirstSentence,
  'The main lesson was that ownership boundaries mattered more than the framework choice.',
  'Should drop a repeated opening sentence when the new value is in the next sentence'
);
console.log('  OK repeated opening sentence removed');

const freshAnswer = postProcessForInterview(
  'I usually start by identifying the bottleneck and then I test the simplest fix first.',
  'general',
  [
    'I focused on reducing deployment risk by using feature flags.'
  ]
);

assertEqual(
  freshAnswer,
  'I usually start by identifying the bottleneck and then I test the simplest fix first.',
  'Should preserve answers that are already fresh'
);
console.log('  OK fresh answer preserved');

console.log('\nInterview naturalness regression checks passed\n');
