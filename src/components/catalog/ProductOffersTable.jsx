import { formatProductPrice } from '../../lib/productPrice.js';

export default function ProductOffersTable({ product, selectedId, onSelect }) {
  if (!product.offers?.length) return null;
  const unit = product.unit || 'м';
  const title = product.title || product.fullName || product.name;
  return (
    <section
      className="product-offers"
      id="product-offers"
      aria-labelledby="product-offers-title"
    >
      <h2 id="product-offers-title">Наличие и цены</h2>
      <p className="visually-hidden">
        Выберите остаток для заказа. Цена и доступное количество указаны
        отдельно для каждой строки.
      </p>
      <div
        className="product-offers__scroll"
        role="region"
        aria-label="Таблица остатков и цен"
        tabIndex={0}
      >
        <table>
          <caption className="visually-hidden">Остатки и цены {title}</caption>
          <thead>
            <tr>
              <th scope="col">Артикул остатка</th>
              <th scope="col">
                {unit === 'м' ? 'Метраж, м' : `Количество, ${unit}`}
              </th>
              <th scope="col">Цена{unit ? `, ₽/${unit}` : ', ₽'}</th>
              <th scope="col">Выбор</th>
            </tr>
          </thead>
          <tbody>
            {product.offers.map((offer) => (
              <tr
                key={offer.id}
                className={
                  selectedId === offer.id
                    ? 'product-offers__selected'
                    : undefined
                }
              >
                <td>
                  <span className="product-offers__name">{title}</span>
                  <small>
                    <span className="product-offers__sku-label">Артикул: </span>
                    {offer.sku}
                  </small>
                </td>
                <td>
                  {Number(offer.stock).toLocaleString('ru-RU', {
                    maximumFractionDigits: 6,
                  })}
                </td>
                <td>{formatProductPrice(offer.price).value}</td>
                <td>
                  <label>
                    <input
                      type="radio"
                      name="product-offer"
                      value={offer.id}
                      checked={selectedId === offer.id}
                      onChange={() => onSelect(offer.id)}
                      aria-label={`Выбрать остаток ${offer.sku}`}
                    />
                    <span className="product-offers__choice-label">
                      {selectedId === offer.id ? 'Выбран' : 'Выбрать'}
                    </span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
