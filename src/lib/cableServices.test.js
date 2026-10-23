// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { requestServiceHelp, CABLE_SERVICES } from './cableServices';
import { MAX_QUOTE_CUSTOMER_COMMENT_LENGTH } from '../../shared/quoteValidation';
import { toCanonicalSitePath } from './canonicalPaths';
describe('service handoff and canonical paths', () => {
  it('keeps long calculation requests inside the existing lead form limit', () => {
    let detail;
    const listener = (event) => {
      detail = event.detail;
    };
    window.addEventListener('open-lead-modal', listener);
    requestServiceHelp(
      'Доставка',
      'Итого: 1200 кг\n' + 'Грузовое место: 100 кг\n'.repeat(100)
    );
    window.removeEventListener('open-lead-modal', listener);
    expect(detail.comment.length).toBeLessThanOrEqual(
      MAX_QUOTE_CUSTOMER_COMMENT_LENGTH
    );
    expect(detail.comment).toContain('Итого: 1200 кг');
    expect(detail.comment).toMatch(/PDF/i);
    expect(detail.subtitle).toMatch(/PDF/i);
  });
  it('uses identical canonical paths across all service links', () => {
    for (const service of CABLE_SERVICES)
      expect(toCanonicalSitePath(service.path)).toBe(service.path);
  });
});
