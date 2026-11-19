import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import EncodePage from './pages/EncodePage';
import DecodePage from './pages/DecodePage';
import { MarkGlyph } from './components/Icons';

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="site-header">
          <div className="brand">
            <span className="brand-mark">
              <MarkGlyph size={14} />
            </span>
            <span className="brand-text">
              <strong>SilentLayer</strong>
            </span>
          </div>

          <nav className="site-nav" aria-label="Main navigation">
            <NavLink to="/" end className="nav-link">
              Hide
            </NavLink>
            <NavLink to="/decode" className="nav-link">
              Reveal
            </NavLink>
          </nav>
        </header>

        <main className="site-main">
          <Routes>
            <Route path="/" element={<EncodePage />} />
            <Route path="/decode" element={<DecodePage />} />
            <Route path="*" element={<EncodePage />} />
          </Routes>
        </main>

        <footer className="site-footer">
          AES-256-GCM encryption, untouched pixels, and everything runs in your browser.
          Nothing is sent to a server.
        </footer>
      </div>
    </HashRouter>
  );
}

export default App;
