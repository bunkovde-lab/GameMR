import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/golos-text/cyrillic-400.css';
import '@fontsource/golos-text/cyrillic-500.css';
import '@fontsource/golos-text/cyrillic-600.css';
import '@fontsource/golos-text/cyrillic-700.css';
import '@fontsource/golos-text/latin-400.css';
import '@fontsource/golos-text/latin-500.css';
import '@fontsource/golos-text/latin-600.css';
import '@fontsource/golos-text/latin-700.css';
import '@fontsource/forum/cyrillic-400.css';
import '@fontsource/forum/latin-400.css';
import './ui/tokens.css';
import './ui/app.css';
import './ui/theme.css';
import './ui/kit-png.css';
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
