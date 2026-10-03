import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../../context/I18nContext';
import { DispatcherShell } from './DispatcherShell';
import '@fontsource-variable/plus-jakarta-sans';
import '../../components/common/common.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider><DispatcherShell/></I18nProvider></React.StrictMode>);
