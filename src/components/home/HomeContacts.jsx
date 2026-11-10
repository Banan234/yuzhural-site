import { useState } from 'react';
import Container from '../ui/Container';
import ConsentGatedMap from '../layout/ConsentGatedMap';
import {
  SITE_PHONE_DISPLAY,
  SITE_PHONE_HREF,
  SITE_EMAIL,
  SITE_EMAIL_HREF,
  SITE_TELEGRAM_URL,
  SITE_WHATSAPP_URL,
  SITE_WORKING_HOURS_DISPLAY,
  SITE_OFFICE_ADDRESS_DISPLAY,
  SITE_OFFICE_MAP_EMBED_URL,
  SITE_OFFICE_MAP_URL,
  SITE_WAREHOUSE_ADDRESS_DISPLAY,
  SITE_WAREHOUSE_MAP_EMBED_URL,
  SITE_WAREHOUSE_MAP_URL,
} from '../../lib/siteConfig';
import '../../styles/sections/home-contacts.css';

const locations = {
  office: {
    label: 'Офис',
    address: SITE_OFFICE_ADDRESS_DISPLAY,
    description: 'Оформление оплаты и договоров.',
    src: SITE_OFFICE_MAP_EMBED_URL,
    url: SITE_OFFICE_MAP_URL,
  },
  warehouse: {
    label: 'Склад',
    address: SITE_WAREHOUSE_ADDRESS_DISPLAY,
    description: 'Самовывоз после подтверждения готовности заказа.',
    src: SITE_WAREHOUSE_MAP_EMBED_URL,
    url: SITE_WAREHOUSE_MAP_URL,
  },
};

export default function HomeContacts() {
  const [selected, setSelected] = useState('warehouse');
  const location = locations[selected];

  return (
    <section className="home-contacts" aria-labelledby="home-contacts-title">
      <Container>
        <div className="home-concept__section-head">
          <h2 id="home-contacts-title">Как с нами связаться</h2>
        </div>
        <div className="home-contacts__layout">
          <div className="home-contacts__details">
            <div className="home-contacts__sales">
              <h3>Отдел продаж</h3>
              <a className="home-contacts__phone" href={SITE_PHONE_HREF}>
                {SITE_PHONE_DISPLAY}
              </a>
              <a className="home-contacts__email" href={SITE_EMAIL_HREF}>
                {SITE_EMAIL}
              </a>
              <p>{SITE_WORKING_HOURS_DISPLAY}</p>
              <div className="home-contacts__messengers">
                <a
                  href={SITE_TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Написать в Telegram"
                  title="Telegram"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M21.4 3.7 18.1 20c-.2 1-1 1.2-1.8.6l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.5 13.1.6 11.6c-1-.3-1-1 .2-1.5L20 2.7c.9-.3 1.7.2 1.4 1Z" />
                  </svg>
                </a>
                <a
                  href={SITE_WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Написать в WhatsApp"
                  title="WhatsApp"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="23"
                    height="23"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.7Z" />
                    <path d="m8.4 7.3 1.5 2.6-1 1.1c.9 1.8 2.1 2.9 3.9 3.7l1-1.1 2.7 1.4c-.3 1.4-1.2 2.1-2.6 1.8-4.1-.9-7-3.8-7.5-7.1-.2-1.2.5-2.1 2-2.4Z" />
                  </svg>
                </a>
              </div>
            </div>
            <div className="home-contacts__addresses">
              {Object.entries(locations).map(([key, item]) => (
                <div key={key}>
                  <h3>{item.label}</h3>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {item.address}
                  </a>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="home-contacts__map-card">
            <div className="home-contacts__map-heading">
              <h3>Как нас найти</h3>
              <div
                className="home-contacts__switch"
                role="group"
                aria-label="Адрес на карте"
              >
                {Object.entries(locations).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected === key}
                    onClick={() => setSelected(key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="home-contacts__map">
              <ConsentGatedMap
                title={`${location.label}: ${location.address}`}
                src={location.src}
              />
            </div>
            <div className="home-contacts__map-footer" aria-live="polite">
              <span>{location.address}</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
