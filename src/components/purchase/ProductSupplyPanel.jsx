import { Link } from 'react-router-dom';
import supply from '../../../data/productSupply.json';
import { requestServiceHelp } from '../../lib/cableServices';
import '../../styles/pages/purchase.css';
function date(value) {
  const parsed = new Date(value);
  return value && Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString('ru-RU', {
        timeZone: 'Asia/Yekaterinburg',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
}
export default function ProductSupplyPanel({ product, quantity }) {
  const entry = supply.items[product.sku];
  const verified = entry?.verifiedAt && date(entry.verifiedAt) ? entry : null;
  const updated = date(product.catalogUpdatedAt);
  function request() {
    requestServiceHelp(
      'Уточнить партию и документы',
      `${product.title}; SKU ${product.sku}; количество ${quantity} ${product.unit || 'м'}. Нужны доступные цельные отрезки/барабаны, изготовитель партии, минимальный отпуск, условия резерва и тары, сертификаты и паспорт качества. Просьба подтвердить цену, остаток и дату отгрузки.`
    );
  }
  return (
    <section className="product-supply">
      <h2>Партия и условия поставки</h2>
      {updated && (
        <p className="product-supply__date">
          Файл каталога обновлён: {updated} (Челябинск). Это дата обновления
          данных, фактический остаток подтверждает менеджер.
        </p>
      )}
      <dl>
        <div>
          <dt>Остаток в каталоге</dt>
          <dd>
            {Number(product.stock || 0).toLocaleString('ru-RU')}{' '}
            {product.unit || 'м'}
          </dd>
        </div>
        <div>
          <dt>Доступные отрезки</dt>
          <dd>
            {verified?.lots?.length
              ? verified.lots
                  .map(
                    (lot) =>
                      `${lot.length} ${product.unit || 'м'} × ${lot.count} (${lot.packaging || 'тара уточняется'})`
                  )
                  .join('; ')
              : 'Уточним цельные длины и барабаны по партии'}
          </dd>
        </div>
        <div>
          <dt>Минимальный отпуск</dt>
          <dd>
            {verified?.minimumOrder
              ? `${verified.minimumOrder} ${product.unit || 'м'}`
              : 'Согласуем для выбранной партии'}
          </dd>
        </div>
        <div>
          <dt>Резерв</dt>
          <dd>
            {verified?.reservationTerms || 'Резерв обсуждается индивидуально'}
          </dd>
        </div>
        <div>
          <dt>Тара</dt>
          <dd>
            {verified?.packagingTerms ||
              'Тип, стоимость и условия возврата уточним в КП'}
          </dd>
        </div>
      </dl>
      {verified && (
        <p className="product-supply__date">
          Условия партии проверены: {date(verified.verifiedAt)}.
        </p>
      )}
      {verified?.documents?.length > 0 && (
        <div className="evidence-documents">
          {verified.documents.map((doc) => (
            <a key={doc.href} href={doc.href}>
              {doc.title}
            </a>
          ))}
        </div>
      )}
      <div className="purchase-actions">
        <button type="button" className="button-secondary" onClick={request}>
          Запросить отрезки и документы
        </button>
        <Link to="/quality/">Качество и документы →</Link>
      </div>
      <p>
        Добавление в список для КП не резервирует кабель. Цена, строительные
        длины, документы и срок отгрузки подтверждаются до оплаты.
      </p>
    </section>
  );
}
