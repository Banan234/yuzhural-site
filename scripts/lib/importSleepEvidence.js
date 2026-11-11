import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const powerTransition =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4}) (Sleep\s+Entering Sleep state|DarkWake\s+DarkWake from|Wake\s+(?:Wake from|DarkWake to FullWake from))/;

export function analyzeImportSleep(log, startedAt, completedAt, deadlineAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  const deadline = Date.parse(deadlineAt);
  const intervals = [];
  let sawTransition = false;
  let sleepAt;

  for (const line of log.split('\n')) {
    const match = powerTransition.exec(line);
    if (!match) continue;
    const [, day, time, offset, transition] = match;
    const at = Date.parse(`${day}T${time}${offset}`);
    if (!Number.isFinite(at)) continue;
    sawTransition = true;
    if (transition.startsWith('Sleep')) {
      sleepAt = at;
    } else if (sleepAt != null) {
      const overlapMs = Math.min(at, end) - Math.max(sleepAt, start);
      if (overlapMs > 0) {
        intervals.push({
          sleepAt: new Date(sleepAt).toISOString(),
          wakeAt: new Date(at).toISOString(),
          wakeType: transition.startsWith('DarkWake') ? 'dark-wake' : 'wake',
          overlapMs,
          includedDeadline: deadline >= sleepAt && deadline < at && deadline <= end,
        });
      }
      sleepAt = undefined;
    }
  }

  if (!sawTransition) return { source: 'pmset', status: 'unavailable' };
  return {
    source: 'pmset',
    status: intervals.length ? 'overlap' : 'no-overlap-observed',
    totalOverlapMs: intervals.reduce((total, interval) => total + interval.overlapMs, 0),
    intervals,
  };
}

export async function collectImportSleepEvidence(report) {
  if (process.platform !== 'darwin') return { status: 'unsupported' };
  try {
    const { stdout } = await execFileAsync('/usr/bin/pmset', ['-g', 'log'], {
      timeout: 5000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return analyzeImportSleep(
      stdout,
      report.startedAt || report.generatedAt,
      report.watchdogAt || report.completedAt,
      report.deadlineAt
    );
  } catch {
    return { source: 'pmset', status: 'unavailable' };
  }
}
