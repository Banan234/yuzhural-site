import { expect, it } from 'vitest';
import { buildProductDesignation } from './productDesignation.js';

it('allows filler elements without inventing extra optical fibers', () => {
  const d = buildProductDesignation({ mark: 'ДПС', sourceName: 'ДПС-04-004Г04-7.0', attributes: ['ДПС-04-004Г04-7.0'] });
  expect(d.status).toBe('reviewed');
  expect(d.tokens.some(t => t.text.includes('4 оптических волокон'))).toBe(true);
  expect(d.tokens.some(t => t.text.includes('заполнительными корделями'))).toBe(true);
  expect(d.tokens.some(t => t.text.includes('50 мкм'))).toBe(true);
});

it('keeps incompatible capacity and load in the review queue', () => {
  for (const sourceName of ['ДПС-04-020А04-7.0', 'ДПС-04-004Г04-0.4']) {
    const d = buildProductDesignation({ mark: 'ДПС', sourceName });
    expect(d.status).not.toBe('reviewed');
    expect(d.warnings.length).toBeGreaterThan(0);
  }
});

it('does not discard an incomplete physical sheath inscription', () => {
  const d = buildProductDesignation({ mark: 'ДПД', sourceName: 'ДПД-П 0,4 М', attributes: ['ДПД-П 0,4 М'] });
  expect(d.status).not.toBe('reviewed');
});
