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
    const startedAt = new Date().toISOString();
    const child = spawn(process.execPath, [file, ...args], {
      env: { ...env, PRICE_IMPORT_WATCHDOG_CHILD: '1' },
      stdio: [...(Array.isArray(stdio) ? stdio : stdio === 'inherit' ? ['inherit', 'inherit', 'pipe'] : [stdio, stdio, stdio]), 'ipc'],
    });
    let telemetry;
    child.on('message', (message) => {
      if (message?.type === 'import-telemetry') telemetry = message.telemetry;
    });
    let lastDownloadFailure;
    let stderrTail = '';
    child.stderr?.on('data', (chunk) => {
      if (stdio === 'inherit') process.stderr.write(chunk);
      stderrTail = (stderrTail + chunk.toString()).slice(-8192);
      const lines = stderrTail.split('\n');
      stderrTail = lines.pop();
      for (const line of lines) {
        if (/^Попытка \d+\/\d+ провалена /.test(line)) {
          lastDownloadFailure = line.slice(0, 1000);
        }
      }
    });
    let watchdogAt;
    const deadlineAt = new Date(Date.now() + timeoutMs).toISOString();
    let killTimer;
    const timer = setTimeout(() => {
      watchdogAt = new Date().toISOString();
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
      if (watchdogAt) {
        const error = new Error(
          `Превышено общее время импорта (${Math.round(timeoutMs / 1000)} секунд). Процесс завершён.`
        );
        error.code = 'IMPORT_TIMEOUT';
        error.startedAt = startedAt;
        error.completedAt = new Date().toISOString();
        error.timeoutMs = timeoutMs;
        error.deadlineAt = deadlineAt;
        error.watchdogAt = watchdogAt;
        error.diagnostic = lastDownloadFailure;
        error.telemetry = telemetry && { ...telemetry, idleMs: Date.now() - Date.parse(telemetry.lastProgressAt) };
        reject(error);
      } else resolve(code ?? (signal ? 1 : 0));
    });
  });
}
