import { describe, expect, it } from 'vitest';
import { getProductVariantOptions } from './productVariants';

const current = {
  mark: 'ВВГнг-LS',
  title: 'ВВГнг-LS 4х95 1кВ',
  slug: 'current',
  cores: 4,
  crossSection: 95,
};
const variant = (title, slug, cores = 4, crossSection = 70) => ({
  ...current,
  title,
  slug,
  cores,
  crossSection,
});

describe('getProductVariantOptions', () => {
  it('предлагает реальные сечения и число жил, сохраняя остальные параметры', () => {
    const result = getProductVariantOptions(current, [
      variant('ВВГнг-LS 4х70 1кВ', 'section'),
      variant('ВВГнг-LS 3х95 1кВ', 'cores', 3, 95),
      variant('ВВГнг-LS 4х70 6кВ', 'voltage'),
      variant('ВВГнг-LS 4х70+1х35 1кВ', 'ground'),
      { ...variant('ВВГнг-LS 4х70 1кВ', 'mark'), mark: 'ВВГ' },
    ]);
    expect(result.sections.map(({ slug }) => slug)).toEqual([
      'section',
      'current',
    ]);
    expect(result.cores.map(({ slug }) => slug)).toEqual(['cores', 'current']);
  });
  it('не смешивает сечение экрана и иные исполнения', () => {
    const screened = { ...current, title: 'КП 4х95/50', mark: 'КП' };
    const result = getProductVariantOptions(screened, [
      {
        ...screened,
        slug: 'same-screen',
        title: 'КП 4х70/50',
        crossSection: 70,
      },
      {
        ...screened,
        slug: 'different-screen',
        title: 'КП 4х70/35',
        crossSection: 70,
      },
    ]);
    expect(result.sections.map(({ slug }) => slug)).toEqual([
      'same-screen',
      'current',
    ]);
  });
  it('не угадывает размеры у парной конструкции и неизвестных обозначений', () => {
    expect(
      getProductVariantOptions(
        { ...current, title: 'КИП 2х2х0,5', cores: 4, crossSection: 0.5 },
        []
      ).sections
    ).toEqual([]);
    expect(
      getProductVariantOptions({ ...current, title: 'Неизвестная' }, []).cores
    ).toEqual([]);
  });
  it('не дублирует текущую позицию и не подставляет другой артикул вместо неё', () => {
    const result = getProductVariantOptions(current, [
      { ...current, slug: 'duplicate' },
      current,
    ]);
    expect(result.sections).toEqual([
      { value: 95, slug: 'current', title: current.title },
    ]);
  });
});
