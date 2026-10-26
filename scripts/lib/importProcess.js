import { spawn } from 'child_process';

export function runImportProcess(
  file,
  args = [],
  {
    timeoutMs = 15 * 60 * 1000,
    killGraceMs = 10_000,
    env = process.env,
    stdio = 'inherit',
  } = {}
) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      env: { ...env, PRICE_IMPORT_WATCHDOG_CHILD: '1' },
      stdio,
    });
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs);
    }, timeoutMs);
    const forwardSignal = () => child.kill('SIGTERM');
    process.on('SIGTERM', forwardSignal);
    process.on('SIGINT', forwardSignal);
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.off('SIGTERM', forwardSignal);
      process.off('SIGINT', forwardSignal);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      cleanup();
      if (timedOut) {
        const error = new Error(
          `Превышено общее время импорта (${Math.round(timeoutMs / 1000)} секунд). Процесс завершён.`
        );
        error.code = 'IMPORT_TIMEOUT';
        reject(error);
      } else resolve(code ?? (signal ? 1 : 0));
    });
  });
}
