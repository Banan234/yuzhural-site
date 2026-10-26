import { describe, expect, test } from 'vitest';
import { formatManufacturerTitle } from './manufacturerTitle.js';
import { normalizeImportedProduct } from '../scripts/lib/priceParser.js';

describe('производитель в названии', () => {
  test.each([
    ['HELUKABEL 2х2х0.75', 'HELUKABEL', 'HELUKABEL 2х2х0.75'],
    ['HELUKABEL F-CY-JZ 14х0.5', 'HELUKABEL', 'HELUKABEL F-CY-JZ 14х0.5'],
    ['Герда КВ 4х2х1', 'ГЕРДА', 'Герда КВ 4х2х1'],
    ['Belden 9842 2pr24', 'BELDEN', 'Belden 9842 2pr24'],
    ['КРУИН ВЭлКнг 2х2х1.5', 'НПО ПЗСК', 'КРУИН ВЭлКнг 2х2х1.5'],
    ['ККЗ МК ВБВнг(А)-LS 7х1', 'ККЗ', 'МК ВБВнг(А)-LS 7х1'],
    ['FTP cat.5 2PR Rexant', 'REXANT', 'FTP cat.5 2PR'],
    ['FTP cat.5 пар 4 (NIKOLAN)', 'NIKOLAN', 'FTP cat.5 пар 4'],
    ['LAPP GROUP H09V-K 1х0.5 серый', 'LAPP KABEL', 'H09V-K 1х0.5 серый'],
  ])('%s → %s', (title, manufacturer, expected) => {
    expect(formatManufacturerTitle(title, { manufacturer })).toBe(expected);
    expect(formatManufacturerTitle(expected, { manufacturer })).toBe(expected);
  });
  test('при импорте переносит производителя в поле, сохраняя исходное имя', () => {
    const sourceName = 'FTP cat.5 2PR Rexant';
    const p = normalizeImportedProduct({
      name: sourceName,
      unit: 'м',
      price: 10,
      stock: 20,
    });
    expect(p.name).toBe('FTP cat.5 2PR');
    expect(p.manufacturer).toBe('REXANT');
    expect(p.sourceName).toBe(sourceName);
  });
});
