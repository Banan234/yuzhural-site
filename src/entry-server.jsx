// Файл экспортирует SSR/prerender entry, который строит HTML приложения для build-time страниц.

import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { createRouteObjects } from './app/routes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrerenderDataProvider } from './lib/prerenderData';
import HomePage from './pages/HomePage';
import SpecificationPage from './pages/SpecificationPage';
import OrderGuidePage from './pages/OrderGuidePage';
import QualityPage from './pages/QualityPage';
import CableApplicationPage from './pages/CableApplicationPage';
import CableSectionPage from './pages/CableSectionPage';
import CatalogPage from './pages/CatalogPage';
import MarksPage from './pages/MarksPage';
import ProductPage from './pages/ProductPage';
import CableWeightPage from './pages/CableWeightPage';
import ServicesPage from './pages/ServicesPage';
import CableKnowledgePage from './pages/CableKnowledgePage';
import CableDrumPage from './pages/CableDrumPage';
import CableShippingPage from './pages/CableShippingPage';
import CartPage from './pages/CartPage';
import ContactsPage from './pages/ContactsPage';
import DeliveryPage from './pages/DeliveryPage';
import PaymentPage from './pages/PaymentPage';
import PrivacyPage from './pages/PrivacyPage';
import AboutPage from './pages/AboutPage';
import InternalRuntimePage from './pages/InternalRuntimePage';
import NotFoundPage from './pages/NotFoundPage';
import './styles/global.css';

const routes = createRouteObjects({
  SpecificationPage,
  OrderGuidePage,
  QualityPage,
  CableApplicationPage,
  CableSectionPage,
  HomePage,
  CatalogPage,
  MarksPage,
  ProductPage,
  CableWeightPage,
  ServicesPage,
  CableKnowledgePage,
  CableDrumPage,
  CableShippingPage,
  CartPage,
  ContactsPage,
  DeliveryPage,
  PaymentPage,
  PrivacyPage,
  AboutPage,
  InternalRuntimePage,
  NotFoundPage,
});

export function render(url, { prerenderData = {} } = {}) {
  const router = createMemoryRouter(routes, {
    initialEntries: [url],
    future: {
      v7_relativeSplatPath: true,
    },
  });

  return renderToString(
    <StrictMode>
      <ErrorBoundary>
        <PrerenderDataProvider data={prerenderData}>
          <RouterProvider
            router={router}
            future={{ v7_startTransition: true }}
          />
        </PrerenderDataProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
