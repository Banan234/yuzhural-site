import Container from '../ui/Container';
import '../../styles/sections/home-why-us.css';

const facts = [
  {
    value: '15',
    unit: 'минут',
    label: 'свяжемся после заявки в рабочее время',
  },
  {
    value: '2',
    unit: 'способа',
    label: 'получения: самовывоз или транспортная компания',
  },
  { value: 'НДС', label: 'счёт, договор и документы к поставке' },
  { value: 'Челябинск', label: 'склад самовывоза и отправка заказов' },
];

const extendedFacts = [
  ...facts,
  {
    value: 'Подбор',
    label: 'кабель под вашу задачу и требования проекта',
  },
  { value: 'Excel', label: 'принимаем таблицы со списком позиций' },
  { value: 'PDF', label: 'принимаем спецификации для расчёта' },
  { value: 'РФ', label: 'поставка кабеля по России' },
];

function FactValue({ fact }) {
  return (
    <>
      <span
        className={fact.value.length > 5 ? 'home-why__long-value' : undefined}
      >
        {fact.value}
      </span>
      {fact.unit && <small>{fact.unit}</small>}
    </>
  );
}

export default function HomeWhyUsVariants() {
  return (
    <>
      <section
        className="home-why home-why--numbers"
        aria-labelledby="home-why-numbers-title"
        data-why-variant="1"
      >
        <Container>
          <h2 id="home-why-numbers-title">
            ЮжУралЭлектроКабель в цифрах и фактах
          </h2>
          <dl className="home-why__numbers">
            {extendedFacts.map((fact) => (
              <div key={fact.label}>
                <dt>
                  <FactValue fact={fact} />
                </dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    </>
  );
}
