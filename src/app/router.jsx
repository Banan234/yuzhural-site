// Файл создаёт browser router приложения и lazy-load чанки страниц по маршрутам.

import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { createRouteObjects } from './routes';
import HomePage from '../pages/HomePage';

// Все страницы — отдельные чанки. На первый paint грузится только тот,
// который соответствует текущему маршруту. Главная загружается синхронно,
// чтобы убрать route waterfall для первого визита на /.
const SpecificationPage = lazy(() => import('../pages/SpecificationPage'));
const OrderGuidePage = lazy(() => import('../pages/OrderGuidePage'));
const QualityPage = lazy(() => import('../pages/QualityPage'));
const CableApplicationPage = lazy(
  () => import('../pages/CableApplicationPage')
);
const CableSectionPage = lazy(() => import('../pages/CableSectionPage'));
const CatalogPage = lazy(() => import('../pages/CatalogPage'));
const ProductPage = lazy(() => import('../pages/ProductPage'));
const CableWeightPage = lazy(() => import('../pages/CableWeightPage'));
const ServicesPage = lazy(() => import('../pages/ServicesPage'));
const CableKnowledgePage = lazy(() => import('../pages/CableKnowledgePage'));
const CableDrumPage = lazy(() => import('../pages/CableDrumPage'));
const CableShippingPage = lazy(() => import('../pages/CableShippingPage'));
const CartPage = lazy(() => import('../pages/CartPage'));
const ContactsPage = lazy(() => import('../pages/ContactsPage'));
const DeliveryPage = lazy(() => import('../pages/DeliveryPage'));
const PaymentPage = lazy(() => import('../pages/PaymentPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const InternalRuntimePage = lazy(() => import('../pages/InternalRuntimePage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

export const router = createBrowserRouter(
  createRouteObjects({
    SpecificationPage,
    OrderGuidePage,
    QualityPage,
    CableApplicationPage,
    CableSectionPage,
    HomePage,
    CatalogPage,
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
  }),
  {
    future: {
      v7_relativeSplatPath: true,
    },
  }
);
