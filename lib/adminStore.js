import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const emptyAdminState = () => ({
  revision: 0,
  products: {},
  customProducts: {},
  leadStates: {},
});
export async function readAdminState(
  directory = process.env.ADMIN_DATA_DIR || 'data/admin',
  fsApi = fs
) {
  try {
    return JSON.parse(
      await fsApi.readFile(path.join(directory, 'state.json'), 'utf8')
    );
  } catch (error) {
    if (error.code === 'ENOENT') return emptyAdminState();
    throw error;
  }
}
export function createAdminStore(
  directory = process.env.ADMIN_DATA_DIR || 'data/admin'
) {
  let queue = Promise.resolve();
  const serial = (task) => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  async function atomic(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
      await fs.rename(tmp, file);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  }
  const leadFile = (id) => {
    if (!/^YUEK-[A-F0-9]{12}$/.test(id))
      throw Object.assign(Error('Заявка не найдена'), { status: 404 });
    return path.join(directory, 'requests', id + '.json');
  };
  return {
    read: () => readAdminState(directory),
    mutate: (revision, change) =>
      serial(async () => {
        const state = await readAdminState(directory);
        if (revision !== state.revision)
          throw Object.assign(
            Error('Данные изменились. Обновите страницу перед сохранением.'),
            { status: 409 }
          );
        await change(state);
        state.revision++;
        state.updatedAt = new Date().toISOString();
        await atomic(path.join(directory, 'state.json'), state);
        return state;
      }),
    saveRequest: (record) =>
      serial(async () => {
        const file = leadFile(record.requestId);
        let previous;
        try {
          previous = JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        await atomic(file, {
          ...record,
          createdAt: previous?.createdAt || record.createdAt,
        });
      }),
    deleteRequest: (id) => serial(() => fs.unlink(leadFile(id))),
    getRequest: async (id) =>
      JSON.parse(await fs.readFile(leadFile(id), 'utf8')),
    listRequests: async () => {
      let names;
      try {
        names = await fs.readdir(path.join(directory, 'requests'));
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      const records = [];
      for (const name of names.filter((n) =>
        /^YUEK-[A-F0-9]{12}\.json$/.test(n)
      )) {
        const record = JSON.parse(
          await fs.readFile(path.join(directory, 'requests', name), 'utf8')
        );
        const customer = record.payload?.customer || record.payload || {};
        records.push({
          requestId: record.requestId,
          createdAt: record.createdAt,
          kind: record.kind,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        });
      }
      return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}
