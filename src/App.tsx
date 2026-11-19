import { HashRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import EncodePage from './pages/EncodePage';
import DecodePage from './pages/DecodePage';
import { MarkGlyph } from './components/Icons';

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <header className="site-header">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <MarkGlyph size={14} />
            </span>
            <span className="brand-text">
              <strong>SilentLayer</strong>
            </span>
          </Link>

          <div className="site-header__aside">
            <nav className="site-nav" aria-label="Main navigation">
              <NavLink to="/" end className="nav-link">
                Hide
              </NavLink>
              <NavLink to="/decode" className="nav-link">
                Reveal
              </NavLink>
            </nav>

            <a
              className="site-header__link"
              href="https://github.com/coders908"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/coders908
            </a>
          </div>
        </header>

        <main className="site-main">
          <Routes>
            <Route path="/" element={<EncodePage />} />
            <Route path="/decode" element={<DecodePage />} />
            <Route path="*" element={<EncodePage />} />
          </Routes>
        </main>

        <footer className="site-footer">
          <span className="site-footer__credit">
            Built by{' '}
            <a
              className="site-footer__link"
              href="https://github.com/coders908"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/coders908
            </a>{' '}
            <span className="site-footer__author">(Neriya)</span>
          </span>
        </footer>
      </div>
    </HashRouter>
  );
}

export default App;
