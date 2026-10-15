import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';

// HashRouter: static hosts like GitHub Pages serve no SPA fallback, so a path
// router would 404 on every deep link. The hash also keeps share links working
// no matter which sub-path the site is published under.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
