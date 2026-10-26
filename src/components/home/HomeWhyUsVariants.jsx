import Container from '../ui/Container';
import '../../styles/sections/home-why-us.css';

const facts = [
  {
    value: '15+ лет',
    label: 'На рынке кабельно-проводниковой продукции.',
  },
  {
    value: 'С НДС',
    label: 'Оформим счёт, договор и закрывающие документы на поставку.',
  },
  {
    value: 'От 1 дня',
    label: 'Отгрузка продукции со склада после согласования заказа и оплаты.',
  },
  {
    value: 'Сертификаты',
    label:
      'По запросу предоставим документы качества для выбранной продукции и партии.',
  },
  {
    value: '5\u202f700+',
    label: 'Позиций в прайсе: кабели, провода и сопутствующая продукция.',
  },
  {
    value: 'Цены производителей',
    label: 'Кабель по ценам заводов-изготовителей.',
  },
];

export default function HomeWhyUsVariants() {
  return (
    <>
      <section
        className="home-why home-why--numbers home-why--supply"
        aria-labelledby="home-why-numbers-title"
        data-why-variant="1"
      >
        <Container>
          <h2 id="home-why-numbers-title">
            ЮжУралЭлектроКабель в цифрах и фактах
          </h2>
          <dl className="home-why__numbers">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.value}</dt>
                <dd>{fact.label}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    </>
  );
}
