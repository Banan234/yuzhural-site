import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { classifyPracticalCableVisualProduct } from './familyVisualRules.js';
const read = (f) =>
  JSON.parse(fs.readFileSync(new URL('../../' + f, import.meta.url)));
const context = {
  rules: read('data/cableVisualClassificationRules.json'),
  familyVisualRules: read('data/familyVisualRules.json'),
  knowledge: read('shared/designationKnowledgeBase.json'),
  colorRules: read('data/cableImageColors.json'),
};
const classify = (name) =>
  classifyPracticalCableVisualProduct({ name, sku: 'TEST' }, context);
describe('mixed-size cores are structural, not overall scale', () => {
  it('splits 4 equal cores from 3 main + 1 reduced, with same total count', () => {
    const a = classify('АВБбШв 4х95'),
      b = classify('АВБбШв 3х95+1х50');
    expect(a.cores).toBe(4);
    expect(b.cores).toBe(4);
    expect(a.visualKey).not.toBe(b.visualKey);
    expect(b.visualProfile.coreLayout).toEqual({
      primaryCores: 3,
      auxiliaryCores: 1,
      auxiliarySize: 'reduced',
    });
    expect(b.visualClassification).toBe('needs_review');
    expect(b.visualProfile.visualizationType).toBeNull();
    expect(b.visualization.visualizationType).toBe('NEEDS_REVIEW');
  });
  it('groups the reduced-core construction without exact nominal sizes or numeric diameter formulas', () => {
    const examples = [
      'АВБбШв 3х95+1х50',
      'АВБбШв 3х240+1х120',
      'АВБбШв 3х70+1х35',
    ].map(classify);
    expect(new Set(examples.map((r) => r.visualKey)).size).toBe(1);
    expect(examples.map((r) => r.section)).toEqual([95, 240, 70]);
    expect(examples.every((r) => r.visualProfile.sectionKey === null)).toBe(
      true
    );
  });
  it('keeps distinct number/composition of extra cores separate', () => {
    const a = classify('АВБбШв 3х95+1х50'),
      b = classify('АВБбШв 2х95+2х50');
    expect(a.cores).toBe(b.cores);
    expect(a.visualKey).not.toBe(b.visualKey);
  });
  it('does not split a uniform construction simply because one is written with plus', () => {
    expect(classify('КГ 2x1.5+1x1.5').visualKey).toBe(
      classify('КГ 3x1.5').visualKey
    );
  });
  it('preserves other critical distinctions', () => {
    const names = [
      'ВВГ 3x1.5',
      'АВВГ 3x1.5',
      'ВВГ 3x1.5 мк',
      'ВБШв 3x1.5',
      'ВВГ-П 3x1.5',
      'КВВГЭ 3x1.5',
      'СИП-4 3x16',
    ];
    expect(new Set(names.map((n) => classify(n).visualKey)).size).toBe(
      names.length
    );
  });
});
