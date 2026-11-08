import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/tokens.css';
import './ui/app.css';
import { App } from './App';
import { bootstrap } from './store';

// Сначала пробуем восстановить автосохранение; если его нет или оно повреждено — новая кампания.
bootstrap().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
