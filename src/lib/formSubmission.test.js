import { describe, it, expect } from 'vitest';
import { formSubmission } from './formSubmission.js';
describe('form submission identity', () => {
  it('reuses retry identity despite changing transport timestamps and changes on edited input or attachment', () => {
    const ref = { current: null };
    const file = { name: 'test.pdf' };
    const first = formSubmission(
      ref,
      { email: 'buyer@example.test', submit_at: 1 },
      [file]
    );
    expect(
      formSubmission(ref, { email: 'buyer@example.test', submit_at: 2 }, [file])
    ).toBe(first);
    const edited = formSubmission(ref, { email: 'other@example.test' }, [file]);
    expect(edited).not.toBe(first);
    expect(
      formSubmission(ref, { email: 'other@example.test' }, [
        { name: 'test.pdf' },
      ])
    ).not.toBe(edited);
  });
});
