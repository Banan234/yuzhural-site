import { Link } from 'react-router-dom';
// Файл рендерит страницу о компании с преимуществами, реквизитами и SEO-структурой.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useJsonLd } from '../hooks/useJsonLd';
import { useSEO } from '../hooks/useSEO';
import {
  buildStaticPageJsonLd,
  getStaticPageJsonLdId,
} from '../lib/staticPageJsonLd';
import { STATIC_PAGE_SEO } from '../lib/staticSeo';
import {
  SITE_MANUFACTURERS,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_PUBLIC_DOCUMENTS,
  SITE_QUOTE_RESPONSE_DISPLAY,
  SITE_REQUEST_DOCUMENTS,
  SITE_REQUISITES,
  SITE_WORKING_HOURS_DISPLAY,
} from '../lib/siteConfig';
import '../styles/pages/content.css';

const ABOUT_JSON_LD_ID = getStaticPageJsonLdId(STATIC_PAGE_SEO.about.path);
const ABOUT_JSON_LD = buildStaticPageJsonLd(STATIC_PAGE_SEO.about.path);

const ABOUT_BADGES = [
  `Коммерческое предложение ${SITE_QUOTE_RESPONSE_DISPLAY}`,
  'Работа с юрлицами, НДС и договором',
  'Подбор по марке, проекту и назначению',
  'Поставка по Челябинску и по России',
];

const ABOUT_FACTS = [
  { value: 'B2B', label: 'основной формат работы' },
  { value: 'от 1 дня', label: 'отгрузка складских позиций' },
  { value: 'НДС', label: 'счёт, договор и закрывающие документы' },
  { value: 'XLS / PDF', label: 'прайс и реквизиты в открытом доступе' },
];

const ABOUT_DIRECTIONS = [
  {
    label: 'Оптовые поставки',
    title: 'Комплектуем заявки под объект и регулярное снабжение',
    text: 'Работаем со списками марок, проектными спецификациями и закупочными заявками. Проверяем остатки, кратность и реальный срок отгрузки до выставления счёта.',
  },
  {
    label: 'Подбор и замены',
    title: 'Разбираем задачу, а не просто пересылаем прайс',
    text: 'Если позиция отсутствует или требует уточнения, подбираем близкие аналоги по назначению и отдельно согласуем замену, чтобы объект не вставал на согласовании.',
  },
  {
    label: 'Документы и сопровождение',
    title: 'Закрываем вопросы закупки, бухгалтерии и службы безопасности',
    text: 'Передаём реквизиты, типовой договор, сертификаты и закрывающие документы. Для постоянных клиентов фиксируем условия в договоре поставки.',
  },
];

const ABOUT_ADVANTAGES = [
  {
    title: 'Не обещаем наличие вслепую',
    text: 'Сначала подтверждаем остаток, срок и условия отгрузки, потом отправляем счёт или КП. Это снижает риск пересчётов и сдвигов по срокам.',
  },
  {
    title: 'Подбираем кабель под прикладную задачу',
    text: 'Работаем с маркой, сечением, количеством жил, напряжением и требованиями объекта. При необходимости предлагаем согласуемую замену, а не случайную похожую позицию.',
  },
  {
    title: 'Документы готовы до оплаты',
    text: 'Реквизиты, типовой договор и открытые файлы доступны заранее. Снабжение и бухгалтерия могут проверить контрагента до запуска оплаты.',
  },
  {
    title: 'Логистика под ваш сценарий получения',
    text: 'Согласуем самовывоз, сдачу в транспортную компанию или поставку на объект. Отдельно проговариваем, что входит в срок отгрузки, а что зависит от перевозчика.',
  },
  {
    title: 'Работаем в деловом режиме',
    text: 'Для юридических лиц выставляем счёт, отгружаем с НДС и передаём закрывающие документы. Для повторных закупок можем закрепить условия поставки договором.',
  },
  {
    title: 'Позиции производителей под разные задачи',
    text: `В прайсе встречаются марки производителей ${SITE_MANUFACTURERS.slice(0, 6).join(', ')} и других брендов, если они подходят под требования проекта.`,
  },
];

export default function AboutPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash !== '#documents') return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('documents')?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  function handleOpenAboutLead() {
    window.dispatchEvent(
      new CustomEvent('open-lead-modal', {
        detail: {
          title: 'Обсудить поставку кабеля',
          subtitle:
            'Оставьте телефон и список позиций — проверим наличие, предложим вариант поставки и подготовим КП.',
          submitLabel: 'Отправить заявку',
          source: 'CTA на странице о компании',
        },
      })
    );
  }

  useSEO({
    title: STATIC_PAGE_SEO.about.title,
    description: STATIC_PAGE_SEO.about.description,
    canonical: STATIC_PAGE_SEO.about.path,
  });

  useJsonLd(ABOUT_JSON_LD_ID, ABOUT_JSON_LD);

  return (
    <>
      <section className="section">
        <Container>
          <div className="about-page__hero">
            <div className="about-page__intro">
              <h1 className="page-title">О компании</h1>
              <p className="page-subtitle">
                ООО «ЮжУралЭлектроКабель» — компания для B2B-поставок
                кабельно-проводниковой продукции. Работаем с заявками
                строительных, монтажных и промышленных организаций из Челябинска
                и других регионов России.
              </p>
              <p className="content-lead">
                Основная задача компании — быстро и предметно закрывать
                потребность снабжения в кабеле, проводе и сопутствующей
                электротехнической продукции: проверять наличие, подбирать
                аналоги по проектной марке, готовить КП и комплектовать заказ
                под отгрузку.
              </p>

              <div
                className="about-page__badges"
                aria-label="Ключевые условия работы"
              >
                {ABOUT_BADGES.map((badge) => (
                  <span key={badge}>{badge}</span>
                ))}
              </div>
            </div>

            <aside className="about-page__summary">
              <span className="about-page__summary-eyebrow">Как работаем</span>
              <h2 className="about-page__summary-title">
                Закрываем заявку так, чтобы снабжение не тратило время на
                догадки
              </h2>
              <p className="about-page__summary-text">
                Для закупочного отдела важны не абстрактные обещания, а понятный
                сценарий работы: можно ли заранее проверить контрагента, как
                быстро получить КП и какой пакет документов будет сопровождать
                поставку.
              </p>
              <ul className="about-page__summary-list">
                <li>подтверждаем наличие и срок до счёта</li>
                <li>подбираем аналоги по задаче, если позиция спорная</li>
                <li>собираем документы под согласование и оплату</li>
              </ul>
              <div className="about-page__summary-contacts">
                <a
                  href={SITE_PHONE_HREF}
                  className="about-page__summary-contact"
                >
                  {SITE_PHONE_DISPLAY}
                </a>
                <a
                  href={SITE_EMAIL_HREF}
                  className="about-page__summary-contact about-page__summary-contact--muted"
                >
                  {SITE_EMAIL}
                </a>
              </div>
            </aside>
          </div>

          <div className="about-page__facts" aria-label="Ключевые факты">
            {ABOUT_FACTS.map(({ value, label }) => (
              <div key={label} className="about-page__fact">
                <div className="about-page__fact-value">{value}</div>
                <div className="about-page__fact-label">{label}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="section section--soft">
        <Container>
          <div className="section-head">
            <h2 className="section-title section-title--left">
              Три рабочих направления
            </h2>
          </div>

          <div className="about-directions">
            {ABOUT_DIRECTIONS.map((item) => (
              <article key={item.title} className="about-direction">
                <span className="about-direction__label">{item.label}</span>
                <h3 className="about-direction__title">{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Почему с нами удобно работать
              </h2>
              <p className="content-lead">
                Помогаем закупке быстрее принимать решение: заранее показываем
                формат работы, открытые документы, реальные сроки и подход к
                подбору кабеля под задачу, а не ограничиваемся общими словами о
                надёжности.
              </p>
            </div>

            <div className="about-advantages">
              {ABOUT_ADVANTAGES.map((item) => (
                <article key={item.title} className="about-advantage">
                  <h3 className="about-advantage__title">{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section
        id="documents"
        className="section section--soft"
        style={{ scrollMarginTop: '140px' }}
      >
        <Container>
          <div className="content-columns">
            <div>
              <h2 className="section-title section-title--left">
                Документы и проверка до оплаты
              </h2>
              <p className="content-lead">
                До заявки можно проверить реквизиты, адрес, режим работы,
                открытые документы и юридические данные компании. Это тот набор,
                который обычно нужен закупке, бухгалтерии и службе безопасности
                до запуска платежа.
              </p>

              <div className="info-note">
                <Link to="/quality/">Качество и документы →</Link>
                <br />
                По запросу предоставляем:{' '}
                {SITE_REQUEST_DOCUMENTS.slice(0, 4).join('; ')}.
              </div>
            </div>

            <div className="proof-panel">
              <dl className="proof-details">
                <div>
                  <dt>Организация</dt>
                  <dd>{SITE_REQUISITES.fullLegalName}</dd>
                </div>
                <div>
                  <dt>ИНН / ОГРН</dt>
                  <dd>
                    {SITE_REQUISITES.taxId} /{' '}
                    {SITE_REQUISITES.registrationNumber}
                  </dd>
                </div>
                <div>
                  <dt>Адрес офиса</dt>
                  <dd>{SITE_OFFICE_ADDRESS_DISPLAY}</dd>
                </div>
                <div>
                  <dt>Режим</dt>
                  <dd>{SITE_WORKING_HOURS_DISPLAY}</dd>
                </div>
              </dl>

              <div className="proof-documents proof-documents--compact">
                {SITE_PUBLIC_DOCUMENTS.map((doc) => (
                  <a key={doc.href} href={doc.href} className="proof-document">
                    <span className="proof-document__type">{doc.type}</span>
                    <span>
                      <strong>{doc.title}</strong>
                      <small>{doc.description}</small>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section">
        <Container>
          <div className="about-cta">
            <div>
              <h2 className="about-cta__title">
                Будем полезны, если нужно быстро закрыть заявку по кабелю
              </h2>
              <p className="about-cta__text">
                Присылайте перечень марок или проектную спецификацию. Проверим
                наличие, предложим замену, подготовим коммерческое предложение и
                соберём пакет документов под согласование.
              </p>
            </div>

            <div className="content-actions about-cta__actions">
              <button
                type="button"
                className="button-primary"
                onClick={handleOpenAboutLead}
              >
                Отправить заявку
              </button>
              <a href={SITE_PHONE_HREF} className="button-secondary">
                Позвонить менеджеру
              </a>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
