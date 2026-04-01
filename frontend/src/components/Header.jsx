import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gift } from 'lucide-react';

export default function Header() {
  const location = useLocation();

  return (
    <header className="site-header">
      <Link to="/" className="nav-brand nav-brand-link">
        <Gift size={24} color="var(--accent)" />
        <span className="logo" style={{ fontSize: '1.4rem' }}>WhyGift</span>
      </Link>
      <nav className="site-nav">
        <Link to="/about" className={location.pathname === '/about' ? 'active' : ''}>About us</Link>
        <Link to="/blog" className={location.pathname === '/blog' || location.pathname.startsWith('/blog/') ? 'active' : ''}>Blog</Link>
        <Link to="/contact" className={location.pathname === '/contact' ? 'active' : ''}>Contact Us</Link>
      </nav>
    </header>
  );
}
