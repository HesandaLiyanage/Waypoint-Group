import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../../context/I18nContext';
import { ComponentPreview } from './ComponentPreview';
import '@fontsource-variable/plus-jakarta-sans';
import '../common/common.css';

// Separate preview entry: the application and its role router stay unchanged.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <ComponentPreview />
    </I18nProvider>
  </React.StrictMode>,
);
