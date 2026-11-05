// Файл инициализирует клиентское React-приложение, аналитику, error tracking и гидрацию prerender HTML.

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { initAnalytics } from './lib/analytics';
import { scheduleErrorTrackingInit } from './lib/errorTracking';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  getBrowserPrerenderData,
  PrerenderDataProvider,
} from './lib/prerenderData';
import './styles/global.css';

// Third-party SDK грузим после load/idle: bootstrap и гидрация остаются
// без сетевого/CPU хвоста от аналитики. Ранние capture-вызовы Sentry
// буферизуются и форсят загрузку SDK только при реальной ошибке.
scheduleErrorTrackingInit();
initAnalytics();

const root = document.getElementById('root');
const app = (
  <StrictMode>
    <ErrorBoundary>
      <PrerenderDataProvider data={getBrowserPrerenderData()}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </PrerenderDataProvider>
    </ErrorBoundary>
  </StrictMode>
);

if (root.hasChildNodes() && root.dataset.clientRender !== 'true') {
  ReactDOM.hydrateRoot(root, app);
} else {
  ReactDOM.createRoot(root).render(app);
}
