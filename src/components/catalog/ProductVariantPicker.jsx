import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../../lib/productsApi';
import { getProductVariantOptions } from '../../lib/productVariants';

export default function ProductVariantPicker({ product }) {
  const [family, setFamily] = useState({ mark: '', items: [] });
  useEffect(() => {
    const controller = new AbortController();
    if (!product.mark || !product.cores || !product.crossSection) return;
    async function load() {
      try {
        const first = await fetchProducts(controller.signal, {
          mark: product.mark,
          limit: 96,
        });
        const items = [...first.items];
        const pages = first.meta?.pagination?.totalPages || 1;
        for (let page = 2; page <= pages; page += 1) {
          const next = await fetchProducts(controller.signal, {
            mark: product.mark,
            limit: 96,
            page,
          });
          items.push(...next.items);
        }
        if (!controller.signal.aborted)
          setFamily({ mark: product.mark, items });
      } catch {
        // Неудачный запрос вариантов не мешает просмотру и заказу текущей позиции.
      }
    }
    load();
    return () => controller.abort();
  }, [product.mark, product.cores, product.crossSection]);

  const options = getProductVariantOptions(
    product,
    family.mark === product.mark ? family.items : []
  );
  const groups = [
    { key: 'sections', label: 'Сечение жилы, мм²' },
    { key: 'cores', label: 'Количество жил' },
  ];
  return (
    <div className="product-variants">
      {groups
        .filter(({ key }) => options[key].length > 0)
        .map(({ key, label }) => (
          <div className="product-variants__group" key={key}>
            <div className="product-variants__label">{label}</div>
            <nav className="product-variants__options" aria-label={label}>
              {options[key].map(({ value, slug, title }) => (
                <Link
                  key={value}
                  to={`/product/${slug}`}
                  title={title}
                  aria-label={`${label}: ${value}`}
                  aria-current={slug === product.slug ? 'page' : undefined}
                >
                  {value.toLocaleString('ru-RU')}
                </Link>
              ))}
            </nav>
          </div>
        ))}
    </div>
  );
}
