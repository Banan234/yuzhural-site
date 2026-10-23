import { expect } from '@playwright/test';

export async function expectFieldError(field) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', /\S/);
  const ids = (await field.getAttribute('aria-describedby'))
    .trim()
    .split(/\s+/);
  for (const id of ids) {
    const description = field.page().locator(`[id=${JSON.stringify(id)}]`);
    await expect(description).toBeVisible();
    await expect(description).toHaveText(/\S/);
  }
  await expect(field).toHaveAccessibleDescription(/\S/);
}
