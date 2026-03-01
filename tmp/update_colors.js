const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'src', 'components', 'SetupWizard.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// The "Ghost & Quill" Color Palette
// Deep Background: #12122B
// Subtle Shadow / Cards: #2D2D5A
// Primary Glow: #5FFBF1
// Secondary Glow: #A1FFFE
// Core Highlight: #F0FFFF

const colorMap = {
    // Backgrounds
    'bg-gray-900': 'bg-[#12122B]',
    'bg-gray-800': 'bg-[#2D2D5A]',
    'bg-gray-800/50': 'bg-[#2D2D5A]/50',
    'bg-gray-800/30': 'bg-[#2D2D5A]/30',

    // Borders
    'border-gray-800': 'border-[#2D2D5A]',
    'border-gray-700': 'border-[#2D2D5A]',
    'border-gray-700/50': 'border-[#2D2D5A]/50',
    'border-gray-600': 'border-[#2D2D5A]',

    // Primary Accents (Cyan/Blue -> Electric Cyan / Soft Aquamarine)
    'bg-cyan-500': 'bg-[#5FFBF1]',
    'bg-cyan-600': 'bg-[#A1FFFE]', // Hover state
    'bg-cyan-500/20': 'bg-[#5FFBF1]/20',
    'bg-cyan-500/10': 'bg-[#5FFBF1]/10',
    'bg-cyan-500/5': 'bg-[#5FFBF1]/5',
    'text-cyan-400': 'text-[#5FFBF1]',
    'text-cyan-500': 'text-[#5FFBF1]',
    'text-cyan-600': 'text-[#A1FFFE]',
    'border-cyan-500/20': 'border-[#5FFBF1]/20',
    'border-cyan-500/50': 'border-[#5FFBF1]/50',
    'shadow-cyan-500/20': 'shadow-[#5FFBF1]/20',

    // Green -> Secondary Glow for OK states
    'bg-green-500/20': 'bg-[#A1FFFE]/20',
    'bg-green-500/10': 'bg-[#A1FFFE]/10',
    'bg-green-500/5': 'bg-[#A1FFFE]/5',
    'text-green-400': 'text-[#A1FFFE]',
    'border-green-500/20': 'border-[#A1FFFE]/20',

    // Purple -> Secondary Glow for other elements
    'bg-purple-500/20': 'bg-[#A1FFFE]/20',
    'bg-purple-500/10': 'bg-[#A1FFFE]/10',
    'text-purple-400': 'text-[#A1FFFE]',
    'border-purple-500/20': 'border-[#A1FFFE]/20',
    'ring-purple-500/10': 'ring-[#A1FFFE]/10',

    // Text modifications
    'text-white': 'text-[#F0FFFF]',
    'text-gray-200': 'text-[#F0FFFF]/90',
    'text-gray-300': 'text-[#F0FFFF]/80',
    'text-gray-400': 'text-[#F0FFFF]/60',
    'text-gray-500': 'text-[#F0FFFF]/40',
};

for (const [oldClass, newClass] of Object.entries(colorMap)) {
    // Regex safely matches full class names only
    const regex = new RegExp(`(?<=[\\s"'\\\`])` + oldClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + `(?=[\\s"'\\\`])`, 'g');
    content = content.replace(regex, newClass);
}

// Text replacements for meetings/interviews context
content = content.replace(/interview and meeting assistant/g, "meeting and interview assistant");
content = content.replace(/interviews and meetings/g, "meetings and interviews");
content = content.replace(/high-stakes interviews/g, "high-stakes meetings");
content = content.replace(/interviewer's voice/g, "speaker's voice");

// Just fix hover colors that use Tailwind classes directly (like bg-gray-800 -> bg-[#2D2D5A] in hovers)
content = content.replace(/hover:bg-gray-800/g, 'hover:bg-[#2D2D5A]');

// Write back
fs.writeFileSync(targetFile, content, 'utf8');
console.log('SetupWizard updated successfully with custom Ghost & Quill colors.');
