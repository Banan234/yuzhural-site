import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResponsiveProductImage from './ResponsiveProductImage.jsx';

describe('responsive product image', () => {
  it('preserves the original fallback, accessible name and geometry', () => {
    const html = renderToStaticMarkup(
      <ResponsiveProductImage
        src="/original.png"
        alt="Кабель"
        width="560"
        height="320"
        sizes="320px"
        variants={[
          { src: '/small.webp', width: 320 },
          { src: '/large.webp', width: 960 },
        ]}
      />
    );
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('srcSet="/small.webp 320w, /large.webp 960w"');
    expect(html).toContain('sizes="320px"');
    expect(html).toContain(
      'src="/original.png" alt="Кабель" width="560" height="320"'
    );
    expect(html).toContain('display:contents');
  });
  it('keeps SVG/unprepared images unchanged', () => {
    expect(
      renderToStaticMarkup(
        <ResponsiveProductImage src="/fallback.svg" alt="Кабель" />
      )
    ).toBe('<img src="/fallback.svg" alt="Кабель"/>');
  });
});
