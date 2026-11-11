// Only explicitly selected diagnostic fields cross the watchdog IPC channel.
const events = [];
const stageEvents = [];
let stage = 'Подготовка';
const startedAt = Date.now();
let lastProgressAt = startedAt;
let heartbeatAt = startedAt;
let maxHeartbeatGapMs = 0;
const heartbeat = setInterval(() => {
  const now = Date.now();
  maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, now - heartbeatAt);
  heartbeatAt = now;
  if (process.connected) process.send({ type: 'import-telemetry', telemetry: telemetrySnapshot() }, () => {});
}, 5000);
heartbeat.unref();

export function safeDiagnosticUrl(value) {
  try {
    const url = new URL(value);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.href;
  } catch { return '[invalid URL]'; }
}

export function telemetrySnapshot() {
  const now = Date.now();
  return {
    startedAt: new Date(startedAt).toISOString(),
    capturedAt: new Date(now).toISOString(),
    stage, elapsedMs: now - startedAt,
    lastProgressAt: new Date(lastProgressAt).toISOString(),
    idleMs: now - lastProgressAt,
    maxHeartbeatGapMs: Math.max(maxHeartbeatGapMs, now - heartbeatAt),
    stages: stageEvents.map((event, index, stages) => ({ stage: event.stage, startedAt: event.at, durationMs: (stages[index + 1] ? Date.parse(stages[index + 1].at) : now) - Date.parse(event.at) })),
    events: [...events],
  };
}

export function recordImportEvent(type, fields = {}) {
  const now = Date.now();
  if (type === 'stage') {
    stage = fields.stage;
    stageEvents.push({ stage, at: new Date(now).toISOString() });
  }
  lastProgressAt = now;
  events.push({ at: new Date(now).toISOString(), type, ...fields });
  if (events.length > 300) events.shift();
  if (process.connected) process.send({ type: 'import-telemetry', telemetry: telemetrySnapshot() }, () => {});
}
export function setImportStage(stage) { recordImportEvent('stage', { stage }); }
