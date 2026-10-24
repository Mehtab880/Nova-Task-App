import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/**
 * English only for M0. Resources are bundled, so initialization is synchronous.
 * Every user-visible string must go through `t()`.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'translation',
  ns: ['translation'],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  initAsync: false,
});

export { i18n };
