const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');

// background
ctx.fillStyle = '#1a1a1a';
ctx.fillRect(0, 0, 1024, 1024);

// text
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 500px sans-serif';
  ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText('GW', 512, 512);

const out = fs.createWriteStream(path.join(__dirname, 'icon.png'));
const stream = canvas.createPNGStream();
stream.pipe(out);
out.on('finish', () => console.log('Icon generated successfully'));
