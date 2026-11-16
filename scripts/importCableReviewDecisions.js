import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { importCableReviewDecisions } from './lib/cableReviewImport.js';

const { values, positionals } = parseArgs({
  allowPositionals: true, options: { apply: { type: 'boolean' } },
});
if (positionals.length !== 1) throw Error('Usage: node scripts/importCableReviewDecisions.js decisions.json [--apply]');
const root = fileURLToPath(new URL('..', import.meta.url));
const payload = JSON.parse(await fs.readFile(positionals[0], 'utf8'));
console.log(JSON.stringify({
  applied: values.apply === true,
  decisions: await importCableReviewDecisions({ root, payload, apply: values.apply }),
}, null, 2));
