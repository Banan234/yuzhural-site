import { Link } from 'react-router-dom';
import PurchaseLayout from '../components/purchase/PurchaseLayout';
import { ORDER_FAQ } from '../../shared/purchaseContent';
const STEPS = [
  [
    'Пришлите список',
    'Укажите марку, сечение, метраж, требования к цельным длинам и город получения.',
  ],
  [
    'Получите КП',
    'Менеджер проверит остаток, цену, документы, отрезки и срок отгрузки. Замены согласуем отдельно.',
  ],
  [
    'Согласуйте и оплатите',
    'После подтверждения всех условий — полная оплата переводом по счёту или наличными.',
  ],
  [
    'Получите заказ',
    'Согласуйте готовность, самовывоз со склада или передачу транспортной компании.',
  ],
];
export default function OrderGuidePage() {
  return (
    <PurchaseLayout pageKey="order">
      <ol className="order-steps">
        {STEPS.map(([title, text], i) => (
          <li key={title}>
            <span className="order-steps__number">0{i + 1}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </li>
        ))}
      </ol>
      <div className="purchase-actions">
        <Link className="button-primary" to="/specification/">
          Отправить спецификацию
        </Link>
        <Link className="button-secondary" to="/cart">
          Список для КП
        </Link>
        <Link className="button-secondary" to="/quality/">
          Качество и документы
        </Link>
      </div>
      <section className="purchase-panel">
        <h2>Вопросы перед заказом</h2>
        <div className="purchase-faq">
          {ORDER_FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <div className="purchase-actions">
        <Link to="/payment/">Оплата →</Link>
        <Link to="/delivery/">Доставка и самовывоз →</Link>
        <Link to="/contacts/">Контакты →</Link>
      </div>
    </PurchaseLayout>
  );
}
