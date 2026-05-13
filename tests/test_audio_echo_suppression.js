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
  pruneTranscriptEchoCandidates(recentInterviewer, now + 21000).length,
  0,
  'Should discard interviewer echo candidates after the suppression window expires'
);
console.log('  OK stale candidates pruned');

const recentLoopback = [
  { text: 'and container', timestamp: now - 800, final: true },
];
assertEqual(
  isLikelyEchoTranscript('and', recentLoopback, now),
  true,
  'Should suppress short mic fragments that are already on loopback (speakerphone echo)'
);
console.log('  OK short loopback fragment suppressed');

assertEqual(
  isLikelyEchoTranscript('and', [{ text: 'unrelated topic', timestamp: now - 800, final: true }], now),
  false,
  'Should not suppress short user speech with no loopback match'
);
console.log('  OK unrelated short user speech preserved');

assertEqual(
  isLikelyEchoTranscript(
    "if my doctor demands talk",
    [{ text: "if my Docker daemon's stopped", timestamp: now - 500, final: true }],
    now
  ),
  true,
  'Should suppress near-simultaneous degraded speakerphone echo from the mic channel'
);
console.log('  OK degraded near-time echo suppressed');

assertEqual(
  isLikelyEchoTranscript(
    "if my doctor demands talk",
    [{ text: "if my Docker daemon's stopped", timestamp: now - 6000, final: true }],
    now
  ),
  false,
  'Should not use relaxed degraded-echo matching outside the near-time window'
);
console.log('  OK relaxed degraded matching is time-bounded');

assertEqual(
  isLikelyEchoTranscript(
    "messy I'm. the best of my C_I_ I_C_",
    [{ text: "messy I'm. I'm messy I.", timestamp: now - 500, final: true }],
    now
  ),
  true,
  'Should suppress near-time whisper artifact text from speakerphone echo'
);
console.log('  OK whisper artifact echo suppressed');

assertEqual(
  isLikelyEchoTranscript(
    'this approach is messy but unrelated to the speaker',
    [{ text: "messy I'm. I'm messy I.", timestamp: now - 500, final: true }],
    now
  ),
  false,
  'Should not suppress normal user text just because it shares one distinctive word'
);
console.log('  OK normal one-word-overlap user speech preserved');

console.log('\nAudio echo suppression regression checks passed\n');
