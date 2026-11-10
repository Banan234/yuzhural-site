import readline from 'node:readline';
import { Writable } from 'node:stream';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hashAdminPassword } from '../lib/adminAuth.js';
if (!process.stdin.isTTY)
  throw Error('Запустите npm run admin:setup в терминале.');
const output = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});
const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
const ask = (prompt) => {
  process.stdout.write(prompt);
  return new Promise((resolve) =>
    rl.question('', (value) => {
      process.stdout.write('\n');
      resolve(value);
    })
  );
};
try {
  const password = await ask(
    'Пароль владельца (не менее 12 символов, ввод скрыт): '
  );
  const confirmation = await ask('Повторите пароль: ');
  if (password !== confirmation)
    throw Error('Пароли не совпадают. Настройки не изменены.');
  const hash = await hashAdminPassword(password);
  let source;
  try {
    source = await fs.readFile('.env', 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    source = '';
  }
  const line = `ADMIN_PASSWORD_HASH=${hash}`;
  source = /^ADMIN_PASSWORD_HASH=.*$/m.test(source)
    ? source.replace(/^ADMIN_PASSWORD_HASH=.*$/m, line)
    : source.trimEnd() + '\n' + line + '\n';
  const temporary = `.env.admin-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, source, { mode: 0o600 });
    await fs.rename(temporary, '.env');
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  console.log('Пароль настроен. Перезапустите API и откройте /admin.');
} finally {
  rl.close();
}
