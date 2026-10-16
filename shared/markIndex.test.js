import { describe, expect, it } from 'vitest';
import { buildMarkIndex } from './markIndex.js';

describe('buildMarkIndex', () => {
  it('groups current catalog marks by first letter and counts positions', () => {
    const groups = buildMarkIndex([
      { mark: 'ВВГ' },
      { mark: 'ввг' },
      { mark: 'АВВГ' },
      { mark: 'F/UTP' },
      { mark: '05 UU-F' },
      { mark: '' },
    ]);

    expect(groups.map((group) => group.letter)).toEqual(['А', 'В', 'F', '0–9']);
    expect(groups[1].marks).toEqual([{ mark: 'ВВГ', count: 2 }]);
    expect(groups[1].id).toBe('letter-412');
    expect(groups[3].id).toBe('letter-digits');
  });
});
