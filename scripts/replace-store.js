const fs = require('fs');
const path = require('path');

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (entry === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

const routeFiles = walk('src/app/api/v1');
let count = 0;
for (const file of routeFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let updated = content
    .replace(
      /import \{ PostgresStore \} from '@\/services\/postgres-store';/g,
      "import { getRepository } from '@/services/repository-factory';"
    )
    .replace(/PostgresStore\.getInstance\(\)/g, 'getRepository()');
  
  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log('Updated: ' + file);
    count++;
  }
}
console.log(`Done. Updated ${count} files.`);
