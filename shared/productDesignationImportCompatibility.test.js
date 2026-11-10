import { describe, it, expect } from 'vitest';
import { buildProductDesignation as decode } from './productDesignation.js';

describe('normalized import attributes retain source-backed explanations', () => {
  it('explains flat execution only with a documented family index and original п', () => {
    const p = { mark: 'ВВГ', sourceName: 'ВВГ 3х2.5 п', attributes: ['плоский'] };
    expect(decode(p).status).toBe('reviewed');
    expect(decode({ ...p, sourceName: 'ВВГ 3х2.5' }).unknown).toContain('плоский');
    expect(decode({ mark: 'NYY', sourceName: 'NYY 3х2.5 п', attributes: ['плоский'] }).unknown).toContain('плоский');
  });
  it('validates voltage and screen against the literal medium voltage designation', () => {
    const p = { mark: 'АПвПуГ', sourceName: 'АПвПуГ 1х70мк/16-10', attributes: ['мк/16'], voltage: 10 };
    expect(decode(p).status).toBe('reviewed');
    expect(decode({ ...p, voltage: 20 }).unknown).toContain('мк/16');
    expect(decode({ ...p, screenCrossSection: 25 }).unknown).toContain('мк/16');
    expect(decode({ ...p, sourceName: 'АПвПуГ 1х70мк/16' }).unknown).toContain('мк/16');
  });
  it('recovers a factory composite index only for the stated one kilovolt version', () => {
    const p = { mark: 'ВКВ', sourceName: 'ПИРОКОР-ВКВнг (А)LS УФ 3х2,5 гмкл-1', attributes: ['нг(А)-LS', 'УФ', 'гмкл'], voltage: 1 };
    expect(decode(p).status).toBe('reviewed');
    expect(decode({ ...p, voltage: 6 }).unknown).toContain('гмкл');
    expect(decode({ ...p, sourceName: p.sourceName.replace('гмкл-1', 'гмкл-6') }).unknown).toContain('гмкл');
  });
});
