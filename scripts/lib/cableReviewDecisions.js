import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const directory = root => path.join(root, 'data/product-image-metadata/review-decisions');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadCableReviewDecisions(root) {
  const base = directory(root);
  const names = await fs.readdir(base).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const records = [];
  for (const name of names.filter(value => /^[a-f0-9]{64}$/u.test(value))) {
    try {
      const decisionDir = path.join(base, name);
      const record = JSON.parse(await fs.readFile(path.join(decisionDir, 'decision.json'), 'utf8'));
      if (record.decision.sha256 !== name) throw Error('Durable decision identity mismatch');
      records.push({ ...record, decisionDir });
    } catch (error) {
      // A crash before the decision commit leaves files but no active decision.
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return records;
}

export async function persistCableReviewDecision({ root, draftDir, image, group, request, decision, claimKey }) {
  if (sha256(image) !== decision.sha256) throw Error('Durable decision SHA mismatch');
  const base = path.join(directory(root), decision.sha256);
  await fs.mkdir(base, { recursive: true });
  const lockPath = path.join(base, '.decision.lock');
  const lock = await fs.open(lockPath, 'wx');
  const write = async (name, value) => {
    const temp = path.join(base, randomUUID() + '.tmp');
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
    await fs.rename(temp, path.join(base, name));
  };
  try {
    const previous = await fs.readFile(path.join(base, 'decision.json'), 'utf8')
      .then(JSON.parse).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
    if (previous?.decision.status === 'APPROVED' && decision.status !== 'APPROVED')
      throw Error('Approved decisions require the separate withdrawal procedure');
    if (previous?.decision.status === decision.status &&
        previous.decision.disposition === decision.disposition &&
        previous.decision.note === decision.note) return previous.decision;
    try {
      await fs.writeFile(path.join(base, 'image.png'), image, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST' ||
          sha256(await fs.readFile(path.join(base, 'image.png'))) !== decision.sha256) throw error;
    }
    if (request) await write('request.json', request);
    await write('group.json', group);
    await write('decision.json', {
      decision, claimKey, originalDraft: path.relative(root, draftDir),
      previous: previous ? [...previous.previous, previous.decision] : [],
    });
    return decision;
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
