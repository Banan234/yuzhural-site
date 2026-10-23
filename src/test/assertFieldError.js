import { expect } from 'vitest';

// Check the validation contract without fixing the wording or generated IDs.
export function expectFieldError(field) {
  expect(field).toHaveAttribute('aria-invalid', 'true');
  const ids = (field.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(Boolean);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    const description = field.ownerDocument.getElementById(id);
    expect(description).toBeVisible();
    expect(description).toHaveTextContent(/\S/);
  }
  expect(field).toHaveAccessibleDescription(/\S/);
}
