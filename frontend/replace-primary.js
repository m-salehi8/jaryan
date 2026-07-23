const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;

      // Replace bg-neutral-900 and text-white pairs
      content = content.replace(/bg-neutral-900(\s+)text-white/g, 'bg-primary$1text-primary-foreground');
      content = content.replace(/text-white(\s+)bg-neutral-900/g, 'text-primary-foreground$1bg-primary');
      
      // Replace remaining bg-neutral-900 with bg-primary
      content = content.replace(/\bbg-neutral-900\b/g, 'bg-primary');

      // Note: we leave alone isolated text-white because it might be on a brand background.
      
      if (original !== content) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir('src');
