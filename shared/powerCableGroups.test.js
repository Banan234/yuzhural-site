import { describe, expect, it } from 'vitest';
import {
  getPowerCableGroup,
  matchesPowerCableGroup,
} from './powerCableGroups.js';

describe('фильтры силовых подкатегорий', () => {
  it('разделяет броню, ПВХ, СПЭ, резину и композиции', () => {
    expect(getPowerCableGroup('ВБбШв')).toBe('Бронированный кабель');
    expect(getPowerCableGroup('ВВГнг(А)-LS')).toBe('ПВХ изоляция');
    expect(getPowerCableGroup('ПвВГ')).toBe('Сшитый полиэтилен (XLPE)');
    expect(getPowerCableGroup('КГ-ХЛ')).toBe('Резиновая изоляция');
    expect(getPowerCableGroup('ППГнг(А)-HF')).toBe('Полимерные композиции');
  });

  it('сохраняет старые ссылки на общую группу ВВГ и бронированных', () => {
    const selected = ['ВВГ / бронированные'];
    expect(matchesPowerCableGroup({ mark: 'ВВГ' }, selected)).toBe(true);
    expect(matchesPowerCableGroup({ mark: 'АПвБШв' }, selected)).toBe(true);
    expect(matchesPowerCableGroup({ mark: 'ППГ' }, selected)).toBe(false);
  });
});
