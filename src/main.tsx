import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from '@/App';
import { initLocalDataStore } from '@/lib/localDb/localDataStore';

void initLocalDataStore().catch((error) => {
  console.error('Failed to initialize local data store:', error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
