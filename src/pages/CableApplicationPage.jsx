import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ServiceLayout from '../components/services/ServiceLayout';
import { CABLE_APPLICATIONS } from '../../shared/cableApplications';
import { requestServiceHelp } from '../lib/cableServices';
export default function CableApplicationPage() {
  const [params, setParams] = useSearchParams();
  const chosen =
    CABLE_APPLICATIONS.find((item) => item.key === params.get('task')) ||
    CABLE_APPLICATIONS[0];
  const [length, setLength] = useState('');
  const [details, setDetails] = useState('');
  const [city, setCity] = useState('');
  const request = `Задача: ${chosen.title}.\nНужная длина: ${length || 'уточнить'} м. Город: ${city || 'уточнить'}.\nУсловия и требования: ${details || 'Нужна консультация по подбору.'}\nПроверить: ${chosen.questions}`;
  return (
    <ServiceLayout serviceKey="application">
      <div className="application-layout">
        <div
          className="application-choices"
          role="group"
          aria-label="Задача для кабеля"
        >
          {CABLE_APPLICATIONS.map((item) => (
            <button
              type="button"
              aria-pressed={chosen.key === item.key}
              key={item.key}
              onClick={() => setParams({ task: item.key })}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <section className="service-panel">
          <h2>{chosen.title}</h2>
          <p>{chosen.description}</p>
          <div className="services-actions">
            {chosen.categories.map((category) => (
              <Link
                className="button-secondary"
                key={category.slug}
                to={`/catalog/${category.slug}/`}
              >
                {category.title} →
              </Link>
            ))}
          </div>
          <h3>Что проверить для подбора</h3>
          <p>{chosen.questions}</p>
          <div className="service-fields">
            <label>
              Нужная длина, м
              <input
                type="number"
                min="1"
                max="1000000"
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </label>
            <label>
              Город получения
              <input
                maxLength={100}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <label className="application-full">
              Условия, параметры и требования проекта
              <textarea
                rows={4}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Марка из проекта, напряжение, прокладка, температура…"
              />
            </label>
          </div>
          <p className="service-muted">
            Разделы каталога помогают найти кандидатов. Соответствие конкретной
            марки условиям проекта проверяется перед заказом.
          </p>
          <div className="services-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() =>
                requestServiceHelp('Подбор кабеля по задаче', request)
              }
            >
              Передать параметры менеджеру
            </button>
            <Link
              className="button-secondary"
              to={`/specification/?${new URLSearchParams({ request })}`}
            >
              Приложить спецификацию
            </Link>
          </div>
        </section>
      </div>
    </ServiceLayout>
  );
}
