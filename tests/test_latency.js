const { execFile } = require('child_process');
const path = require('path');

console.log('Testing Whisper medium on GPU...');
const bin = path.join(process.env.APPDATA, 'Ghost Writer', 'whisper', 'bin', 'Release', 'whisper-cli.exe');
const model = path.join(process.env.APPDATA, 'Ghost Writer', 'whisper', 'models', 'ggml-medium.bin');
const wav = path.join(process.env.TEMP, 'gw_test_tts.wav');
const start = Date.now();
execFile(bin, ['--model', model, '--file', wav, '--language', 'en', '--no-timestamps', '--no-prints', '--threads', '4'], { cwd: path.dirname(bin) }, (err, stdout, stderr) => {
  const time = Date.now() - start;
  console.log('Whisper medium GPU - Time: ' + time + 'ms, Transcript: "' + stdout.trim() + '"');
  if (err) console.log('Error:', err.message);

  // Now test Ollama
  console.log('Testing Ollama minimax-m2:cloud...');
  const fetch = require('node-fetch'); // Assuming installed, or use built-in
  const start2 = Date.now();
  fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'minimax-m2:cloud',
      prompt: 'Summarize this transcript: ' + stdout.trim(),
      stream: false
    })
  }).then(res => res.json()).then(data => {
    const time2 = Date.now() - start2;
    console.log('Ollama minimax-m2:cloud - Time: ' + time2 + 'ms, Response: "' + (data.response || '').substring(0, 100) + '..."');
    console.log('Total latency: ' + (time + time2) + 'ms');
  }).catch(e => console.log('Ollama error:', e.message));
});