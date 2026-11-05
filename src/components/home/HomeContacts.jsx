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
                <a href={SITE_TELEGRAM_URL} target="_blank" rel="noreferrer">
                  Telegram ↗
                </a>
                <a href={SITE_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  WhatsApp ↗
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
