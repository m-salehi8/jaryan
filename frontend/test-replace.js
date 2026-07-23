const fs = require('fs');
const path = require('path');

const replacements = {
  'bg-white': 'bg-card',
  'bg-neutral-50': 'bg-muted',
  'bg-neutral-100': 'bg-muted',
  'border-neutral-200': 'border-border',
  'border-neutral-300': 'border-border',
  'text-neutral-900': 'text-foreground',
  'text-neutral-800': 'text-foreground',
  'text-neutral-700': 'text-muted-foreground',
  'text-neutral-600': 'text-muted-foreground',
  'text-neutral-500': 'text-muted-foreground',
  'text-neutral-400': 'text-muted-foreground',
  'hover:bg-neutral-50': 'hover:bg-muted',
  'hover:bg-neutral-100': 'hover:bg-muted',
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${search}\\b`, 'g');
    content = content.replace(regex, replace);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('src/pages/Dashboard.js');
