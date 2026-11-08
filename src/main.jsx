import { createRoot } from 'react-dom/client';
import { Root } from './app/Root.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/palette.css';
import './styles/accessibility.css';
import './styles/print.css';

createRoot(document.getElementById('root')).render(<Root />);
