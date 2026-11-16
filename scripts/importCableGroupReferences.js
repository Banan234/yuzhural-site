import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildCableGallery } from './lib/cableGallery.js';
import { importCableReferenceGroups } from './lib/cableReferenceTransfer.js';

const {values,positionals} = parseArgs({
  allowPositionals:true, options:{apply:{type:'boolean'},'dry-run':{type:'boolean'},'replace-conflicts':{type:'boolean'}},
});
if (positionals.length!==1 || (values.apply && values['dry-run']))
  throw Error('Использование: node scripts/importCableGroupReferences.js снимок.json [--dry-run | --apply] [--replace-conflicts]');
const snapshot = JSON.parse(await fs.readFile(positionals[0],'utf8'));
const library = await buildCableGallery(fileURLToPath(new URL('..',import.meta.url)),{queueEnabled:false});
const report = await importCableReferenceGroups(library,snapshot,{apply:values.apply,replaceConflicts:values['replace-conflicts']});
console.log(JSON.stringify(report,null,2));
if (report.conflicts.length || report.errors.length) process.exitCode = 1;
