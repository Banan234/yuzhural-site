import os from 'os';
import { maintainImportFiles } from './lib/importMaintenance.js';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function runImport() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(projectRoot, 'scripts', 'importPrice.js'), '--if-changed'],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
        },
      }
    );

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Импорт остановлен сигналом ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const now = new Date();
  try {
    const logFiles =
      process.platform === 'darwin'
        ? [
            path.join(os.homedir(), 'Library/Logs/yuzhural-price-import.log'),
            path.join(
              os.homedir(),
              'Library/Logs/yuzhural-price-import.error.log'
            ),
          ]
        : [];
    await maintainImportFiles({ projectRoot, logFiles });
  } catch (error) {
    console.error('[import-maintenance] Очистка не выполнена:', error.message);
  }

  console.log(
    `[scheduled-import] Checking price source at ${now.toISOString()}.`
  );
  const exitCode = await runImport();
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href)
  main().catch((error) => {
    console.error('[scheduled-import] Error:', error.message);
    process.exitCode = 1;
  });
