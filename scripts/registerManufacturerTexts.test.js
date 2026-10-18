import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import register from '../shared/manufacturerTexts.json' with { type: 'json' };
import knowledge from '../shared/designationKnowledgeBase.json' with { type: 'json' };
import { registerManufacturerTexts } from './registerManufacturerTexts.js';

describe('append-only factory text register', () => {
  it('retains the earlier text when another factory section or version is added, and rejects invalid sources', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'manufacturer-register-')
    );
    try {
      await fs.mkdir(path.join(root, 'shared'));
      const target = path.join(root, 'shared/manufacturerTexts.json');
      const input = path.join(root, 'input.json');
      const first = register.records[0];
      await fs.writeFile(
        target,
        JSON.stringify({ ...register, records: [first] })
      );
      await fs.writeFile(
        path.join(root, 'shared/designationKnowledgeBase.json'),
        JSON.stringify(knowledge)
      );
      const next = {
        ...first,
        id: 'second-version',
        text: 'Уточнённое техническое назначение.',
      };
      await fs.writeFile(input, JSON.stringify([first, next]));
      expect(await registerManufacturerTexts(input, root)).toEqual({
        added: 1,
        total: 2,
      });
      expect(JSON.parse(await fs.readFile(target)).records).toEqual([
        first,
        next,
      ]);
      expect(await registerManufacturerTexts(input, root)).toEqual({
        added: 0,
        total: 2,
      });
      const snapshot = await fs.readFile(target, 'utf8');
      await fs.writeFile(
        input,
        JSON.stringify([{ ...next, sourceSha256: 'unverified' }])
      );
      await expect(registerManufacturerTexts(input, root)).rejects.toThrow(
        'документацией'
      );
      expect(await fs.readFile(target, 'utf8')).toBe(snapshot);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
