const fs = require('fs');
let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/WhatToAnswerLLM.ts', 'utf8');

// 1. Change fallback mode from 'answer' to 'ragMeeting'
file = file.replace(
    "mode: isMeeting ? 'answer' : 'whatToAnswer',",
    "mode: isMeeting ? 'ragMeeting' : 'whatToAnswer',"
);

// 2. Update extractLastQuestion to handle PERSON
file = file.replace(
    /if \(line\.startsWith\('\[INTERVIEWER'\)\) \{/g,
    "if (line.startsWith('[INTERVIEWER') || line.startsWith('[PERSON')) {"
);

file = file.replace(
    /const match = line\.match\(\/\\\[INTERVIEWER\[\^\\\]\]\*\\\]:\\s\*\(\.\+\)\/\);/g,
    "const match = line.match(/\\[(?:INTERVIEWER|PERSON[^\\]]*)\\]:\\s*(.+)/);"
);

fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/WhatToAnswerLLM.ts', file);
console.log('WhatToAnswerLLM updated successfully.');
