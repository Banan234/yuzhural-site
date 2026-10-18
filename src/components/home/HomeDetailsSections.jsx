import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import {
  SITE_WAREHOUSE_ADDRESS,
  SITE_WAREHOUSE_MAP_URL,
} from '../../lib/siteConfig';
import { ORDER_FAQ } from '../../../shared/purchaseContent';
import '../../styles/sections/home-details.css';

function DetailIcon({ name }) {
  const paths = {
    document: (
      <>
        <path d="M6 2h8l5 5v15H5V2h1ZM14 2v6h5M8 12h8M8 16h8M8 19h5" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    box: (
      <>
        <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" />
        <path d="m3 7 9 4 9-4M12 11v10" />
      </>
    ),
    camera: (
      <>
        <path d="M8 5 9.5 2h5L16 5h4a2 2 0 0 1 2 2v13H2V7a2 2 0 0 1 2-2h4Z" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    truck: (
      <>
        <path d="M3 4h11v13H3zM14 9h4l3 3v5h-7" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function HomeCompanyIntro() {
  return (
    <section className="home-company" aria-labelledby="home-company-title">
      <Container>
        <h2 id="home-company-title" className="home-details-title">
          Кабель для снабжения и комплектации объектов
        </h2>
        <div className="home-company__layout">
          <div className="home-company__copy">
            <p>
              ЮжУралЭлектроКабель — поставка кабеля и провода из Челябинска.
              Подбираем продукцию по марке, проекту и требованиям закупки.
            </p>
            <ul className="home-company__facts">
              {[
                ['document', 'Работа с НДС'],
                ['shield', 'Документы к поставке'],
                ['box', 'Подбор по спецификации'],
              ].map(([icon, label]) => (
                <li key={icon}>
                  <DetailIcon name={icon} />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            <Link to="/about/" className="home-company__link">
              О компании <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="home-company__photos">
            {['Фото склада', 'Комплектация заказа'].map((label) => (
              <div className="home-company__photo" key={label}>
                <DetailIcon name="camera" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

const purchaseSteps = [
  ['Отправляете заявку', 'Марки, сечения и метраж'],
  ['Подтверждаем условия', 'Наличие, цена и сроки'],
  ['Выставляем счёт', 'Согласуем документы'],
  ['Отгружаем заказ', 'Самовывоз или транспортная компания'],
];

export function HomePurchaseSteps() {
  return (
    <section className="home-purchase" aria-labelledby="home-purchase-title">
      <Container>
        <h2 id="home-purchase-title" className="home-details-title">
          Как проходит закупка
        </h2>
        <ol className="home-purchase__steps">
          {purchaseSteps.map(([title, text], index) => (
            <li key={title}>
              <span className="home-purchase__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export function HomeDelivery() {
  return (
    <section className="home-delivery" aria-labelledby="home-delivery-title">
      <Container>
        <div className="home-delivery__panel">
          <h2 id="home-delivery-title" className="home-details-title">
            Получение и доставка
          </h2>
          <div className="home-delivery__options">
            <div className="home-delivery__option">
              <DetailIcon name="pin" />
              <div>
                <h3>Самовывоз в Челябинске</h3>
                <p>
                  Склад: {SITE_WAREHOUSE_ADDRESS.streetAddress}
                  <br />
                  Выдача после подтверждения готовности
                </p>
                <a
                  href={SITE_WAREHOUSE_MAP_URL}
                  className="home-details-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  Как проехать <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
            <div className="home-delivery__option">
              <DetailIcon name="truck" />
              <div>
                <h3>Отправка по России</h3>
                <p>
                  Передадим заказ в выбранную транспортную компанию. Условия и
                  стоимость согласуем до оплаты.
                </p>
                <Link to="/delivery/" className="home-details-link">
                  Условия доставки <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

const homeQuestions = [
  [
    'Можно ли купить небольшой отрез?',
    'Нужную длину и возможность резки уточним по конкретной партии до оплаты.',
  ],
  ['Цена и остаток на сайте актуальны?', ORDER_FAQ[1][1]],
  ['Какие документы идут с кабелем?', ORDER_FAQ[5][1]],
  ['Как отправить спецификацию?', ORDER_FAQ[0][1]],
];

export function HomeFaq() {
  return (
    <section className="home-faq" aria-labelledby="home-faq-title">
      <Container>
        <h2 id="home-faq-title" className="home-details-title">
          Частые вопросы
        </h2>
        <div className="home-faq__list">
          {homeQuestions.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
