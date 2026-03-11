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

const {
  isLikelyEchoTranscript,
  pruneTranscriptEchoCandidates,
} = loadTsModule(
  path.join(__dirname, '..', 'electron', 'audio', 'echoSuppression.ts')
);

console.log('\n=== Audio Echo Suppression Regression ===\n');

const now = Date.now();
const recentInterviewer = [
  {
    text: "That's a good point. You didn't have the data, right?",
    timestamp: now - 1500,
    final: true,
  },
];

assertEqual(
  isLikelyEchoTranscript(
    "That's a good point. You didn't have the data, right?",
    recentInterviewer,
    now
  ),
  true,
  'Should suppress exact duplicate interviewer speech echoed into the mic channel'
);
console.log('  OK exact duplicate suppressed');

assertEqual(
  isLikelyEchoTranscript(
    "You didn't have the data, right? That's a good point.",
    recentInterviewer,
    now
  ),
  true,
  'Should suppress high-overlap interviewer speech echoed with slightly different order'
);
console.log('  OK high-overlap duplicate suppressed');

assertEqual(
  isLikelyEchoTranscript(
    'I would explain that I used a fallback batch process while the upstream data was incomplete.',
    recentInterviewer,
    now
  ),
  false,
  'Should keep legitimate user speech that is different from interviewer audio'
);
console.log('  OK legitimate user speech preserved');

assertEqual(
  pruneTranscriptEchoCandidates(recentInterviewer, now + 10000).length,
  0,
  'Should discard interviewer echo candidates after the suppression window expires'
);
console.log('  OK stale candidates pruned');

console.log('\nAudio echo suppression regression checks passed\n');
