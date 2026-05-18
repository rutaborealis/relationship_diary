import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Save invite token before React renders (so it survives the auth redirect)
const _inviteToken = new URLSearchParams(window.location.search).get('token');
if (_inviteToken) {
  sessionStorage.setItem('invite_token', _inviteToken);
  window.history.replaceState({}, '', window.location.pathname);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
