import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './pwa/instalacao'; // captura o evento de instalação antes do React montar
import './index.css';

// Safari do iPhone ignora user-scalable=no: bloqueia o gesto de pinça também por aqui.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
