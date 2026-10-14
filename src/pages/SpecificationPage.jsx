import PurchaseLayout from '../components/purchase/PurchaseLayout';
import QuoteForm from '../components/quote/QuoteForm';
import { useSearchParams } from 'react-router-dom';
export default function SpecificationPage() {
  const [params] = useSearchParams();
  const comment = (params.get('request') || '').slice(0, 1000);
  return (
    <PurchaseLayout pageKey="specification">
      <div className="purchase-columns">
        <div className="purchase-panel">
          <QuoteForm
            key={comment}
            title="Файлы и контакты для расчёта"
            description="Марки, сечения, метраж и требования к отрезкам — в файле или комментарии. Файлы передадим менеджеру вместе с заявкой."
            itemsOverride={[]}
            specificationOnly
            idPrefix="specification"
            defaultComment={comment}
          />
        </div>
        <aside className="purchase-panel">
          <h2>Что указать</h2>
          <ul>
            <li>Марки, сечения, количество и единицы измерения.</li>
            <li>Цельные отрезки, допустимые замены и требования проекта.</li>
            <li>Город получения и желаемую дату поставки.</li>
            <li>Изготовителя, сертификаты и другие необходимые документы.</li>
          </ul>
          <p>
            Перед оплатой подтвердим наличие, цену, строительные длины, тару и
            срок отгрузки.
          </p>
        </aside>
      </div>
    </PurchaseLayout>
  );
}
