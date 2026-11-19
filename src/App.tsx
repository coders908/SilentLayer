import { useEffect, useRef, useState } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import EncodePage from './pages/EncodePage';
import DecodePage from './pages/DecodePage';
import { CloseIcon, MarkGlyph, MenuIcon } from './components/Icons';

function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const currentLocation = useLocation();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [currentLocation.pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const header = headerRef.current;

      if (header && event.target instanceof Node && !header.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isMenuOpen]);

  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header__brand-group">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <MarkGlyph size={14} />
          </span>
          <span className="brand-text">
            <strong>SilentLayer</strong>
          </span>
        </Link>

        <span className="site-header__credit">
          Built by{' '}
          <a
            className="site-header__credit-link"
            href="https://github.com/coders908"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/coders908
          </a>{' '}
          <span className="site-header__credit-author">(Neriya)</span>
        </span>
      </div>

      <div className="site-header__aside">
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={isMenuOpen}
          aria-controls="site-navigation"
          aria-label={isMenuOpen ? 'Close the navigation menu' : 'Open the navigation menu'}
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          {isMenuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
        </button>

        <nav
          id="site-navigation"
          className="site-nav"
          data-open={isMenuOpen}
          aria-label="Main navigation"
        >
          <NavLink to="/" end className="nav-link">
            Hide
          </NavLink>
          <NavLink to="/decode" className="nav-link">
            Reveal
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <SiteHeader />

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
