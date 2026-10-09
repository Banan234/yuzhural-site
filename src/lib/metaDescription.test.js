// Файл проверяет генерацию meta description и ограничения длины для разных типов страниц.

import { describe, expect, it } from 'vitest';
import {
  META_DESCRIPTION_MAX_LENGTH,
  normalizeMetaDescription,
} from './metaDescription.js';
import { buildProductMetaDescription } from './productSeo.js';

describe('normalizeMetaDescription', () => {
  it('схлопывает пробелы и не трогает короткое описание', () => {
    expect(
      normalizeMetaDescription('  Поставка   кабеля\nсо склада\tв Челябинске. ')
    ).toBe('Поставка кабеля со склада в Челябинске.');
  });

  it('ограничивает описание 160 символами и режет по границе слова', () => {
    const description = normalizeMetaDescription(
      [
        'Кабель ВВГнг(A)-LS 5х10 в наличии на складе в Челябинске',
        'для подрядчиков, строительных компаний, промышленных предприятий',
        'и снабженцев с быстрой подготовкой коммерческого предложения.',
      ].join(' ')
    );

    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(description).toMatch(/\.\.\.$/);
    expect(description).not.toMatch(/\s\.\.\.$/);
    expect(description).not.toContain('коммерческого предложения');
  });

  it('режет длинное слово без превышения лимита', () => {
    const description = normalizeMetaDescription('А'.repeat(220));

    expect(description).toHaveLength(META_DESCRIPTION_MAX_LENGTH);
    expect(description).toMatch(/\.\.\.$/);
  });
});

describe('buildProductMetaDescription', () => {
  it('возвращает meta-safe описание товара', () => {
    const description = buildProductMetaDescription({
      fullName: 'Кабель ВВГнг(A)-LS 5х10',
      catalogCategory: 'Силовой кабель',
      description: 'Кабель   ВВГнг(A)-LS 5х10 '.repeat(12),
    });

    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(description).not.toContain('  ');
  });

  it('усиливает короткое описание товара характеристиками и коммерческим контекстом', () => {
    const description = buildProductMetaDescription({
      fullName: 'АВБбШв 4х50',
      catalogCategory: 'Силовой кабель',
      cores: 4,
      crossSection: 50,
      price: 258.9,
      unit: 'м',
    });

    expect(description.length).toBeGreaterThanOrEqual(80);
    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    expect(description).toContain('Силовой кабель');
    expect(description).toContain('сечение 50 мм²');
    expect(description).toContain('Цена от 258,9 ₽/м');
  });

  it.each(['4х24 AWG', '1,8х4,0/1,92', '7х(2х1,5)', '3х2,5+'])(
    'preserves full configuration %s without an assumed section unit',
    (conductorConfiguration) => {
      const description = buildProductMetaDescription({
        fullName: 'Кабель',
        conductorConfiguration,
        cores: 7,
        groupCores: 2,
        crossSection: 1.5,
        attributes: ['Э', 'нг(А)-LS'],
        parsingWarnings: ['incomplete-specification'],
      });
      expect(description).toContain(
        `конфигурация жил ${conductorConfiguration}`
      );
      expect(description).toContain('Э, нг(А)-LS');
      expect(description).not.toContain('мм²');
      expect(description).not.toContain('7 жилы');
      expect(description).not.toContain('incomplete-specification');
    }
  );

  it('keeps additional conductor sections and voltage in kV', () => {
    const description = buildProductMetaDescription({
      fullName: 'Кабель',
      cores: 3,
      crossSection: 2.5,
      groundCores: 1,
      groundSection: 1.5,
      voltage: 0.66,
    });
    expect(description).toContain('3х2,5+1х1,5 мм²');
    expect(description).toContain('0,66 кВ');
    expect(description).not.toContain('0,66 В');
  });

  it('does not round a 0.035 square millimetre section to 0.04', () => {
    const description = buildProductMetaDescription({
      fullName: 'МГТФ',
      cores: 1,
      crossSection: 0.035,
    });
    expect(description).toContain('сечение 0,035 мм²');
    expect(description).not.toContain('0,04');
  });

  it('preserves grouped legacy specifications when full configuration is absent', () => {
    const description = buildProductMetaDescription({
      fullName: 'Кабель',
      cores: 7,
      groupCores: 2,
      crossSection: 1.5,
    });
    expect(description).toContain('7х(2х1,5) мм²');
    expect(description).not.toContain('7 жилы');
  });
});
