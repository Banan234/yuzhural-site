import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
const source = path.dirname(new URL(import.meta.url).pathname),
  roots = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'release-test-'));
  roots.push(root);
  await fs.mkdir(root + '/deploy');
  await fs.mkdir(root + '/bin');
  await fs.mkdir(root + '/scripts');
  for (const file of [
    'lib.sh',
    'deploy-release.sh',
    'rollback.sh',
    'run-health-monitor.sh',
  ])
    await fs.copyFile(path.join(source, file), root + '/deploy/' + file);
  await fs.copyFile(
    new URL('../scripts/prepareCatalogWebRelease.js', import.meta.url),
    root + '/scripts/prepareCatalogWebRelease.js'
  );
  await fs.mkdir(root + '/web/.vite', { recursive: true });
  await fs.writeFile(root + '/web/index.html', '<html></html>');
  await fs.writeFile(root + '/web/.vite/manifest.json', '{}');
  await fs.writeFile(
    root + '/state.env',
    'LIVE_RELEASE_TAG=good2\nLAST_GOOD_RELEASE_TAG=good2\nPREVIOUS_GOOD_RELEASE_TAG=good1\nLAST_DEPLOY_STATUS=success\n'
  );
  await fs.writeFile(
    root + '/synthetic.env',
    'MONITOR_BASE_URL=http://127.0.0.1:9\nMONITOR_REQUIRE_FORMS=true\nINTERNAL_METRICS_TOKEN=synthetic-only\n'
  );
  await fs.writeFile(
    root + '/deploy/post-deploy-smoke.sh',
    '#!/bin/bash\necho "$DEPLOY_TAG" >> "$FAKE_SMOKE_LOG"\nexit "${FAKE_SMOKE_EXIT:-0}"\n',
    { mode: 0o755 }
  );
  await fs.writeFile(root + '/bin/git', '#!/bin/sh\necho synthetic\n', {
    mode: 0o755,
  });
  await fs.writeFile(
    root + '/bin/docker',
    `#!/bin/bash
printf '%s|%s\\n' "$DEPLOY_TAG" "$*" >> "$FAKE_LOG"
case " $* " in
 *" build "*) exit "\${FAKE_BUILD_EXIT:-0}";;
 *" up "*) echo "partial-app=$DEPLOY_TAG" > "$FAKE_PARTIAL";exit "\${FAKE_UP_EXIT:-0}";;
 *" ps "*) printf 'app\\nweb\\n';;
 *"web tar "*) tar -cf - -C "$FAKE_WEB_ROOT" index.html .vite/manifest.json;;
 *"node --input-type=module -"*) cat >/dev/null;exit "\${FAKE_PREPARE_EXIT:-0}";;
 *"node scripts/monitorHealth.js"*) printf '%s|%s|%s\\n' "$MONITOR_BASE_URL" "$MONITOR_REQUIRE_FORMS" "$APP_ENV_FILE" > "$FAKE_CAPTURE";exit "\${FAKE_MONITOR_EXIT:-0}";;
esac
`,
    { mode: 0o755 }
  );
  const env = {
    PATH: root + '/bin:' + process.env.PATH,
    HOME: process.env.HOME,
    DEPLOY_STATE_FILE: root + '/state.env',
    FAKE_LOG: root + '/calls',
    FAKE_PARTIAL: root + '/partial',
    FAKE_WEB_ROOT: root + '/web',
    FAKE_SMOKE_LOG: root + '/smokes',
    FAKE_CAPTURE: root + '/capture',
    DEPLOY_TAG: '',
  };
  const run = (file, args = [], extra = {}) =>
    spawnSync(
      'bash',
      [
        root + '/deploy/' + file,
        '--project-root',
        root,
        '--env-file',
        root + '/synthetic.env',
        ...args,
      ],
      { env: { ...env, ...extra }, encoding: 'utf8' }
    );
  const state = async () =>
    Object.fromEntries(
      (await fs.readFile(root + '/state.env', 'utf8'))
        .trim()
        .split('\n')
        .map((line) => line.split('='))
    );
  return { root, run, state };
}
it.each([
  ['build', 'FAKE_BUILD_EXIT'],
  ['up', 'FAKE_UP_EXIT'],
  ['catalog', 'FAKE_PREPARE_EXIT'],
  ['smoke', 'FAKE_SMOKE_EXIT'],
])(
  'never marks a failed %s successful; rollback returns to actual last-good',
  async (phase, key) => {
    const f = await fixture();
    const result = f.run('deploy-release.sh', ['--tag', 'bad3'], {
      [key]: '7',
    });
    expect(result.status).toBe(7);
    const failed = await f.state();
    expect(failed).toMatchObject({
      LAST_DEPLOY_STATUS: 'failed',
      LAST_DEPLOY_PHASE: phase,
      LAST_GOOD_RELEASE_TAG: 'good2',
      PREVIOUS_GOOD_RELEASE_TAG: 'good1',
      ATTEMPTED_RELEASE_TAG: 'bad3',
    });
    expect(failed.LIVE_RELEASE_TAG).toBe(phase === 'build' ? 'good2' : "''");
    const rollback = f.run('rollback.sh');
    expect(rollback.status, rollback.stderr).toBe(0);
    expect(await f.state()).toMatchObject({
      LIVE_RELEASE_TAG: 'good2',
      LAST_GOOD_RELEASE_TAG: 'good2',
      PREVIOUS_GOOD_RELEASE_TAG: 'good1',
      LAST_DEPLOY_STATUS: 'success',
    });
  }
);
it('advances history only after smoke; redeploying same tag preserves previous good', async () => {
  const f = await fixture();
  expect(f.run('deploy-release.sh', ['--tag', 'good3']).status).toBe(0);
  expect(await f.state()).toMatchObject({
    LAST_GOOD_RELEASE_TAG: 'good3',
    PREVIOUS_GOOD_RELEASE_TAG: 'good2',
  });
  expect(f.run('deploy-release.sh', ['--tag', 'good3']).status).toBe(0);
  expect((await f.state()).PREVIOUS_GOOD_RELEASE_TAG).toBe('good2');
  expect(f.run('rollback.sh').status).toBe(0);
  expect((await f.state()).LIVE_RELEASE_TAG).toBe('good2');
});
it('records a failed rollback and preserves last good for the next retry', async () => {
  const f = await fixture();
  expect(f.run('rollback.sh', [], { FAKE_UP_EXIT: '9' }).status).toBe(9);
  expect(await f.state()).toMatchObject({
    LAST_DEPLOY_STATUS: 'failed',
    LAST_GOOD_RELEASE_TAG: 'good2',
  });
  expect(f.run('rollback.sh').status).toBe(0);
  expect((await f.state()).LIVE_RELEASE_TAG).toBe('good2');
});
it('wrapper loads the requested environment, passes names without secret values, and preserves monitor exit', async () => {
  const f = await fixture();
  const result = f.run('run-health-monitor.sh', [], { FAKE_MONITOR_EXIT: '5' });
  expect(result.status, result.stderr).toBe(5);
  expect(await fs.readFile(f.root + '/capture', 'utf8')).toContain(
    'http://127.0.0.1:9|true|' + f.root + '/synthetic.env'
  );
  const calls = await fs.readFile(f.root + '/calls', 'utf8');
  expect(calls).toContain('-e INTERNAL_METRICS_TOKEN');
  expect(calls).not.toContain('synthetic-only');
  expect(calls).toContain('node scripts/monitorHealth.js');
});
