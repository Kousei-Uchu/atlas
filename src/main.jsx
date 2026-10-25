import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/palette.css';
import './styles/accessibility.css';

createRoot(document.getElementById('root')).render(<App />);
