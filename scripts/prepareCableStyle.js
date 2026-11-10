import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCableImageStyle,
  prepareCableStyleRequest,
} from './lib/cableImageStyle.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const style = await loadCableImageStyle(root);
const refs = JSON.parse(
  await fs.readFile(
    path.join(
      root,
      'outputs/cable-visualization-types-2026-11-08/reference-plan.json'
    )
  )
);
const ids = [
  'simple-round',
  'multicore-dense',
  'layered-tape-armour',
  'combined-tape-armour',
];
const requests = [];
for (const id of ids) {
  const profile = refs.find((r) => r.id === id).candidate.visualProfile;
  requests.push(await prepareCableStyleRequest(root, profile));
}
const out = path.join(root, 'outputs/cable-style-standard', style.version);
await fs.mkdir(out, { recursive: true });
await fs.writeFile(
  path.join(out, 'requests-dry-run.json'),
  JSON.stringify(requests, null, 2)
);
console.log(
  JSON.stringify(
    {
      version: style.version,
      references: 4,
      apiRequests: 0,
      automaticBinding: false,
      requests: path.join(out, 'requests-dry-run.json'),
    },
    null,
    2
  )
);
