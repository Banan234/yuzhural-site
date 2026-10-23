import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../ui/Container';
import { CATALOG_CANONICAL_PATH } from '../../lib/canonicalPaths.js';

const quickFacts = [
  { icon: 'truck', title: 'Доставка', detail: 'по России' },
  { icon: 'shield', title: 'Работа с НДС', detail: 'документы к поставке' },
  { icon: 'box', title: 'Самовывоз', detail: 'в Челябинске' },
];

function FactIcon({ name }) {
  if (name === 'truck')
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      </svg>
    );
  if (name === 'shield')
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" />
      <path d="m3 7 9 4 9-4M12 11v10" />
    </svg>
  );
}

const slides = [
  {
    id: 'supply',
    label: 'Кабель под ваш проект',
    title: ['Кабель и провод', 'для вашего проекта'],
    description:
      'Пришлите спецификацию или список позиций — подберём кабель, уточним наличие и рассчитаем стоимость поставки.',
    image: '/home-warehouse-concept.jpg',
    mobileImage: '/mobile-hero-cable.webp',
    primary: { label: 'Отправить спецификацию', to: '/specification/' },
    secondary: { label: 'Перейти в каталог', to: CATALOG_CANONICAL_PATH },
  },
  {
    id: 'selection',
    label: 'Подбор кабеля',
    title: ['Подбор кабеля', 'под вашу задачу'],
    description:
      'Выберите задачу и укажите параметры — поможем подобрать кабель, проверить сечение и найти нужный раздел каталога.',
    image: '/home-hero-quote.webp',
    mobileImage: '/home-hero-quote.webp',
    primary: { label: 'Подобрать кабель', to: '/services/application/' },
    secondary: { label: 'Рассчитать сечение', to: '/calculator/section/' },
  },
  {
    id: 'delivery',
    label: 'Доставка по России',
    title: ['Доставка кабеля', 'по всей России'],
    description:
      'Организуем отправку транспортной компанией. Согласуем сроки, документы и условия получения заказа.',
    image: '/mobile-hero-cable.webp',
    mobileImage: '/mobile-hero-cable.webp',
    primary: { label: 'Условия доставки', to: '/delivery/' },
    secondary: { label: 'Запросить КП', to: '/specification/' },
  },
];

export default function HomeHeroCarousel() {
  const [active, setActive] = useState(0);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  function move(direction) {
    setActive(
      (current) => (current + direction + slides.length) % slides.length
    );
  }
  function handleKeyDown(event) {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    }
  }
  function startGesture(event) {
    suppressClick.current = false;
    if (
      !event.isPrimary ||
      event.pointerType !== 'touch' ||
      event.target.closest('a, button')
    )
      return;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function finishGesture(event) {
    const start = gesture.current;
    if (!start || event.pointerId !== start.id) return;
    gesture.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      suppressClick.current = true;
      move(dx < 0 ? 1 : -1);
    }
  }
  return (
    <section
      className="home-concept__hero home-concept__hero--carousel"
      aria-label="Кабель, подбор и доставка"
      aria-roledescription="карусель"
      onKeyDown={handleKeyDown}
      onPointerDown={startGesture}
      onPointerUp={finishGesture}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {slides.map((slide, index) => (
        <picture
          key={slide.id}
          className={`home-concept__hero-image${index === active ? ' is-active' : ''}`}
          aria-hidden="true"
        >
          <source
            media="(max-width: 768px)"
            srcSet={slide.mobileImage}
            type="image/webp"
          />
          <img
            src={slide.image}
            alt=""
            width="1672"
            height="941"
            fetchpriority={index === 0 ? 'high' : 'low'}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        </picture>
      ))}
      <Container>
        <div className="home-concept__hero-content">
          <div
            id="home-hero-slides"
            className="home-concept__hero-slides"
            aria-live="polite"
            aria-atomic="false"
          >
            {slides.map((slide, index) => {
              const Heading = index === 0 ? 'h1' : 'h2';
              return (
                <div
                  key={slide.id}
                  className={`home-concept__hero-copy home-concept__hero-slide${index === active ? ' is-active' : ''}`}
                  role="group"
                  aria-roledescription="слайд"
                  aria-label={`${index + 1} из ${slides.length}: ${slide.label}`}
                  aria-hidden={index !== active}
                  {...(index !== active ? { inert: '' } : {})}
                >
                  <Heading
                    className="home-concept__hero-title"
                    id={index === 0 ? 'home-hero-title' : undefined}
                  >
                    {slide.title[0]}
                    <br />
                    {slide.title[1]}
                  </Heading>
                  <p className="home-concept__hero-lead">{slide.description}</p>
                  <div className="home-concept__hero-actions">
                    <Link
                      to={slide.primary.to}
                      className="home-concept__button home-concept__button--brand"
                    >
                      {slide.primary.label}
                      <span aria-hidden="true">→</span>
                    </Link>
                    <Link
                      to={slide.secondary.to}
                      className="home-concept__button home-concept__button--outline"
                    >
                      {slide.secondary.label}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <ul className="home-concept__hero-facts">
            {quickFacts.map((fact) => (
              <li key={fact.icon}>
                <FactIcon name={fact.icon} />
                <span>
                  <strong>{fact.title}</strong>
                  <small>{fact.detail}</small>
                </span>
              </li>
            ))}
          </ul>
          <div
            className="home-concept__hero-navigation"
            aria-label="Управление слайдами"
          >
            <div className="home-concept__hero-dots">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`Показать слайд ${index + 1}: ${slide.label}`}
                  aria-current={index === active ? 'true' : undefined}
                  aria-controls="home-hero-slides"
                  onClick={() => setActive(index)}
                >
                  <span />
                </button>
              ))}
            </div>
            <span className="home-concept__hero-counter" aria-hidden="true">
              {String(active + 1).padStart(2, '0')} /{' '}
              {String(slides.length).padStart(2, '0')}
            </span>
            <div className="home-concept__hero-arrows">
              <button
                type="button"
                aria-label="Предыдущий слайд"
                aria-controls="home-hero-slides"
                onClick={() => move(-1)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m14 6-6 6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Следующий слайд"
                aria-controls="home-hero-slides"
                onClick={() => move(1)}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m10 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
