import { describe, expect, it } from 'vitest';
import { catalogSeoPolicy } from './catalogSeoPolicy.js';
const policy = (query, path = '/catalog') =>
  catalogSeoPolicy(path, new URLSearchParams(query));
describe('finite catalog SEO policy', () => {
  it('keeps each default page canonical, dropping tracking and semantic defaults', () => {
    expect(policy('page=2&utm_source=fixture').canonical).toBe(
      '/catalog/?page=2'
    );
    expect(policy('page=1&sort=default&limit=28').canonical).toBe('/catalog/');
    expect(policy('page=3', '/catalog/kontrolnyy-kabel').canonical).toBe(
      '/catalog/kontrolnyy-kabel?page=3'
    );
  });
  it.each([
    'search=ПВС',
    'material=медь',
    'sort=popular',
    'sort=price-asc&page=2',
    'limit=24',
    'limit=56',
    'limit=112',
    'category=provoda',
    'page=2&page=3',
  ])(
    'excludes query variation %s without declaring it equivalent to page one',
    (query) => {
      expect(policy(query)).toMatchObject({ noindex: true, canonical: false });
    }
  );
  it('keeps unknown and encoded keys outside the indexable HTML layer', () => {
    expect(
      catalogSeoPolicy('/catalog', new URLSearchParams('%70age=2'), '%70age=2')
    ).toMatchObject({ noindex: true, canonical: false });
    expect(policy('PAGE=2').noindex).toBe(true);
    expect(policy('other=1').noindex).toBe(true);
    expect(policy('utm_source=fixture&page=2').noindex).toBe(false);
  });
  it.each(['0', '-1', '1.5', 'no', '02', '9007199254740992'])(
    'rejects invalid page %s',
    (page) => {
      expect(policy('page=' + page)).toMatchObject({
        invalidPage: true,
        canonical: false,
      });
    }
  );
});
