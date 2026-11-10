import {
  scrypt as scryptCallback,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashAdminPassword(password) {
  if (
    typeof password !== 'string' ||
    password.includes('\u0000') ||
    password.length > 512
  )
    throw Error(
      'Пароль должен быть строкой до 512 символов без нулевого символа'
    );
  if (password.length < 12)
    throw Error('Пароль должен содержать не менее 12 символов');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyAdminPassword(password, encoded) {
  const [, salt, hash] =
    /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded || '') || [];
  if (
    !salt ||
    typeof password !== 'string' ||
    password.length > 512 ||
    password.includes('\u0000')
  )
    return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
export const validAdminHash = (value) =>
  /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value || '');
export function createAdminSessions({ secure = false, now = Date.now } = {}) {
  const sessions = new Map();
  const cookieName = secure ? '__Host-yuek_admin' : 'yuek_admin';
  const key = (token) => createHash('sha256').update(token).digest('hex');
  const prune = () => {
    for (const [id, s] of sessions) if (s.expires <= now()) sessions.delete(id);
  };
  const cookie = (token, age) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  return {
    get(req) {
      prune();
      const token = (req.headers.cookie || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName + '='))
        ?.slice(cookieName.length + 1);
      return token ? sessions.get(key(token)) : null;
    },
    create(res) {
      prune();
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('hex');
      const session = {
        csrf: randomBytes(32).toString('hex'),
        expires: now() + 8 * 3600000,
      };
      sessions.set(key(token), session);
      res.setHeader('Set-Cookie', cookie(token, 8 * 3600));
      return session;
    },
    remove(req, res) {
      const session = this.get(req);
      for (const [id, s] of sessions) if (s === session) sessions.delete(id);
      res.setHeader('Set-Cookie', cookie('', 0));
    },
  };
}
