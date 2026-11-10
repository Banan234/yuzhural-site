import { describe, expect, test } from 'vitest';
import { normalizeCableVoltageName } from './cableVoltage.js';
import {
  normalizeImportedProduct,
  parseProductName,
} from '../scripts/lib/priceParser.js';
import { formatCableProductTitle } from './productTitle.js';
import { buildStableKey } from '../scripts/lib/productRegistry.js';

describe('единая запись напряжения', () => {
  test.each([
    ['КГэ хл 3х35+1х10-6', 'КГэхл 3х35+1х10 6кВ', 6],
    ['АВБбШв 3х35 - 6', 'АВБбШв 3х35 6кВ', 6],
    ['АПвПу 1х240/50-10', 'АПвПу 1х240/50 10кВ', 10],
    ['АПвЭБВ 3х120/16-6/10', 'АПвЭБВ 3х120/16 6/10кВ', 10],
    ['ВВГ 3х25 нг(А)LS -1кВ', 'ВВГнг(А)-LS 3х25 1кВ', 1],
    ['АПвБШв 4х50-1кв нг(А)LS', 'АПвБШвнг(А)-LS 4х50 1кВ', 1],
    ['СИП-3 1х50 -20кВ', 'СИП-3 1х50 20кВ', 20],
    ['КПпБК-130 3х35-3,3кВ', 'КПпБК-130 3х35 3,3кВ', 3.3],
  ])('%s', (sourceName, expected, voltage) => {
    const p = normalizeImportedProduct({ name: sourceName, unit: 'м' });
    expect(p.name).toBe(expected);
    expect(p.voltage).toBe(voltage);
    expect(p.sourceName).toBe(sourceName);
    expect(normalizeImportedProduct(p)).toEqual(p);
    expect(formatCableProductTitle(p.name, p)).toBe(expected);
    const legacy = parseProductName(sourceName, { normalizeVoltage: false });
    expect(buildStableKey(p)).toBe(
      buildStableKey({
        ...p,
        voltageSourceIdentity: undefined,
        voltage: legacy.voltage,
        attributes: legacy.attributes,
      })
    );
  });
  test.each([
    'ДПЛ-П 04У 1х4 -2.7кН',
    'ДПО 4х8(2,7)-2.7',
    'ТППэп 50х2х0.4-200',
    'ТПВ 10х2х0.5-315',
    'PROFIBUS 1х2х0.64-150 FC FR-PVC',
    'КМПВ 3х1 нг(А)-500',
    'СКАБ 250 2х2х0.5 л-ex-1',
    'ОКМН 8х1 М6-3',
    'ВВГ 3х2.5-200',
    'Неизвестный 3х35-6',
    'А2XSEY 1х240 (6-10)',
  ])('не меняет другое обозначение: %s', (name) => {
    expect(normalizeCableVoltageName(name)).toBe(name);
  });
});
