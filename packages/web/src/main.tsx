import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => (
  <main style={{ fontFamily: 'system-ui', padding: 24 }}>
    <h1>Yank</h1>
    <p>Pulls the slack out of WhatsApp.</p>
    <p style={{ color: '#888' }}>M1 shell — real UI lands in M3.</p>
  </main>
);

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
ReactDOM.createRoot(root).render(<App />);
