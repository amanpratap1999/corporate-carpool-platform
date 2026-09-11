const fs = require('fs');

// data-store.ts
let code = fs.readFileSync('src/services/data-store.ts', 'utf8');
code = code.replace(/export function calculateHaversineDistanceMeters[\s\S]+?return R \* c;\n}/, '');
code = "import { calculateHaversineDistanceMeters } from '../domain/geo';\n" + code;
fs.writeFileSync('src/services/data-store.ts', code, 'utf8');

// postgres-store.ts
let pcode = fs.readFileSync('src/services/postgres-store.ts', 'utf8');
pcode = pcode.replace(
  'import { calculateHaversineDistanceMeters } from "./data-store";',
  'import { calculateHaversineDistanceMeters } from "../domain/geo";'
);
fs.writeFileSync('src/services/postgres-store.ts', pcode, 'utf8');

console.log("Geo imports updated!");
