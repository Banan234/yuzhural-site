import path from 'node:path';
import { readSourceState } from './importSourceState.js';
import { archiveAndNotifyImport } from './importNotification.js';
export async function checkImportFreshness({
  projectRoot,
  env = process.env,
  now = Date.now(),
  notify = archiveAndNotifyImport,
}) {
  const state = await readSourceState(
    path.join(projectRoot, 'data', '.price-source-state.json')
  );
  const lastSuccess = state?.verifiedAt || state?.publishedAt;
  const configured = Number(env.PRICE_IMPORT_STALE_HOURS || 24);
  const hours = Number.isFinite(configured) && configured > 0 ? configured : 24;
  if (!lastSuccess || !Number.isFinite(Date.parse(lastSuccess)))
    return { unknown: true };
  if (now - Date.parse(lastSuccess) < hours * 3600000) return { stale: false };
  await notify(
    {
      status: 'failed',
      generatedAt: new Date(now).toISOString(),
      lastPublishedAt: state.publishedAt,
      message: `Нет успешной проверки актуальности прайса более ${hours} ч. Последняя успешная проверка: ${lastSuccess}.`,
      errorCode: 'STALE_CATALOG',
    },
    { projectRoot, env }
  );
  return { stale: true };
}
