// Keep import/restore from switching the catalog between production build steps.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { acquirePriceImportLock } from './lib/importLock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// npm run build also runs postbuild, which prepares the matching SSR bundle.
const steps = ['build', 'prerender', 'sync:runtime-artifacts', 'precompress'];
function runStep(step, projectRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [process.env.npm_execpath, 'run', step],
      { cwd: projectRoot, stdio: 'inherit', env: process.env }
    );
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${step}: exit=${code}, signal=${signal || 'none'}`))
    );
  });
}
export async function buildProduction({
  projectRoot = root,
  run = runStep,
} = {}) {
  const release = await acquirePriceImportLock(
    path.join(projectRoot, 'data', '.price-import.lock')
  );
  if (!release) throw new Error('Импорт/backup/restore/build уже выполняется.');
  try {
    for (const step of steps) await run(step, projectRoot);
  } finally {
    await release();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  buildProduction().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
