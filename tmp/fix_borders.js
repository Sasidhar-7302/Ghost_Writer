const fs = require('fs');
const file = 'c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/src/components/SetupWizard.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace all focus:border-cyan-500
content = content.replace(/focus:border-cyan-500/g, 'focus:border-[#5FFBF1]');

// Final check for bg-cyan-500 that might have been missed
content = content.replace(/bg-cyan-500 hover:bg-cyan-600/g, 'bg-[#5FFBF1] hover:bg-[#A1FFFE] text-[#12122B]');
content = content.replace(/text-cyan-500/g, 'text-[#12122B]');
content = content.replace(/bg-cyan-500/g, 'bg-[#5FFBF1]');

fs.writeFileSync(file, content);
console.log('Fixed border colors.');
