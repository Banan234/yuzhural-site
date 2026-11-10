import { it, expect } from 'vitest';
import { safeDiagnosticUrl, setImportStage, telemetrySnapshot } from './importTelemetry.js';
it('removes credentials, queries and fragments from diagnostic URLs', () => {
  expect(safeDiagnosticUrl('https://user:secret@example.com/price.xls?token=secret#secret')).toBe('https://example.com/price.xls');
});
it('records stages and their duration without environment values', () => {
  setImportStage('Чтение Excel');
  setImportStage('Проверка');
  expect(telemetrySnapshot()).toMatchObject({stage:'Проверка',stages:expect.arrayContaining([{stage:'Чтение Excel',startedAt:expect.any(String),durationMs:expect.any(Number)}])});
});
