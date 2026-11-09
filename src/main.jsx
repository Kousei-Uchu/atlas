import { createRoot } from 'react-dom/client';
import { Root } from './app/Root.jsx';
import { registerShell } from './app/shell-updates.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/palette.css';
import './styles/accessibility.css';
import './styles/print.css';

createRoot(document.getElementById('root')).render(<Root />);

// Production only: the dev server must never be cached. Failure is fine; the app works without it.
if (import.meta.env.PROD) registerShell();
