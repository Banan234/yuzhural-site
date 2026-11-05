import { useEffect, useRef, useState } from 'react';
import features from '../../lib/warehouseMapGeometry.json';
import { SITE_WAREHOUSE_MAP_URL } from '../../lib/siteConfig';

const API_KEY = 'f4689ca0-1ca8-4493-aec6-2c594d130456';
let apiPromise;

function loadMaps() {
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${API_KEY}&lang=ru_RU`;
      script.onload = () => window.ymaps.ready(() => resolve(window.ymaps));
      script.onerror = () => {
        script.remove();
        apiPromise = undefined;
        reject(new Error('Не удалось загрузить карту'));
      };
      document.head.append(script);
    });
  }
  return apiPromise;
}

const toLatLon = ([lon, lat]) => [lat, lon];

export default function WarehouseMap() {
  const host = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let map;
    let observer;
    loadMaps()
      .then((ymaps) => {
        if (disposed) return;
        map = new ymaps.Map(
          host.current,
          {
            center: [55.1902, 61.35627],
            zoom: 16.7,
            controls: ['zoomControl'],
          },
          {
            avoidFractionalZoom: false,
            suppressMapOpenBlock: true,
            'zoomControl.size': 'small',
            'zoomControl.position': { right: 10, top: 150 },
          }
        );
        for (const feature of features) {
          if (feature.type === 'placemark') {
            map.geoObjects.add(
              new ymaps.Placemark(
                toLatLon(feature.coordinates),
                {
                  iconCaption: 'Вход на склад',
                },
                { preset: 'islands#blueCircleDotIcon' }
              )
            );
          } else if (feature.type === 'line') {
            map.geoObjects.add(
              new ymaps.Polyline(
                feature.geometry.coordinates.map(toLatLon),
                {},
                {
                  strokeColor: '#f05252',
                  strokeWidth: 5,
                }
              )
            );
          } else if (feature.type === 'polygon') {
            map.geoObjects.add(
              new ymaps.Polygon(
                feature.geometry.coordinates.map((ring) => ring.map(toLatLon)),
                {},
                {
                  fillColor: '#1e98ff',
                  fillOpacity: 0.25,
                  strokeColor: '#1e98ff',
                  strokeWidth: 2,
                }
              )
            );
          }
        }
        map.behaviors.disable('scrollZoom');
        observer = new ResizeObserver(() => map.container.fitToViewport());
        observer.observe(host.current);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      map?.destroy();
    };
  }, []);

  return (
    <div className="warehouse-api-map">
      <div
        ref={host}
        className="warehouse-api-map__canvas"
        aria-label="Карта проезда к складу"
      />
      {failed && (
        <p className="warehouse-api-map__error">
          Не удалось загрузить карту. Откройте схему проезда в Яндекс Картах.
        </p>
      )}
      <a
        className="warehouse-api-map__link"
        href={SITE_WAREHOUSE_MAP_URL}
        target="_blank"
        rel="noreferrer"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span>Открыть в Яндекс Картах</span>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M7 7h10v10" />
        </svg>
      </a>
    </div>
  );
}
