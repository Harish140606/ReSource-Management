import { useAuth } from '../hooks/useAuth.jsx';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '../constants/roles.js';
import { useRef, useState } from 'react';

// Easter egg: click the logo 10 times in quick succession to reveal the
// credits. Resets if the gap between clicks is too long, so it's never
// triggered by normal navigation clicks. Feedback stays tiny and anchored
// right under the title text — never a full-screen takeover.
const EGG_CLICKS = 10;
const EGG_WINDOW_MS = 600;
const MESSAGE_DURATION_MS = 2200;

export default function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [showMessage, setShowMessage] = useState(false);
  const lastClickRef = useRef(0);
  const idleTimerRef = useRef(null);
  const messageTimerRef = useRef(null);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function handleLogoClick() {
    const now = Date.now();
    const withinWindow = now - lastClickRef.current <= EGG_WINDOW_MS;
    lastClickRef.current = now;
    clearTimeout(idleTimerRef.current);

    setCount(prev => {
      const next = withinWindow ? prev + 1 : 1;
      if (next >= EGG_CLICKS) {
        setShowMessage(true);
        clearTimeout(messageTimerRef.current);
        messageTimerRef.current = setTimeout(() => setShowMessage(false), MESSAGE_DURATION_MS);
        return 0;
      }
      return next;
    });

    idleTimerRef.current = setTimeout(() => setCount(0), EGG_WINDOW_MS + 200);
  }

  const remaining = EGG_CLICKS - count;

  return (
    <header
      className="h-14 flex items-center px-3 sm:px-5 flex-shrink-0 border-b border-white/10 gap-3"
      style={{ background: 'linear-gradient(135deg, #00838F 0%, #00A7B5 55%, #7CB342 100%)' }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuToggle}
        className="md:hidden flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-white/90 hover:bg-white/15 transition-colors"
        aria-label="Toggle menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Logo + title */}
      <div className="flex items-center gap-3 flex-1 min-w-0 select-none" onClick={handleLogoClick}>
        <img src="/logo.svg" alt="ReSource Management" className="h-8 w-auto flex-shrink-0 rounded-md shadow-sm cursor-pointer bg-white/95 px-1.5" />
        <div className="h-5 w-px bg-white/30 hidden sm:block" />
        <span className="text-white/90 text-sm font-medium hidden sm:block tracking-wide truncate">
          ReSource Management
        </span>

        {/* Subtle live countdown — only visible mid-sequence, sits right of the title */}
        {count > 0 && !showMessage && (
          <span className="hidden sm:inline-block text-[10px] text-white/50 transition-opacity duration-200 pointer-events-none whitespace-nowrap">
            {remaining} left
          </span>
        )}

        {/* Tiny credits popup — right of the title, not a screen takeover */}
        {showMessage && (
          <div className="hidden sm:inline-block z-50 rounded-md bg-gray-900/95 text-white text-[11px] leading-snug px-3 py-1.5 shadow-lg whitespace-nowrap">
            ❤️ Made with care and passion by <span className="font-semibold">Harish140606</span> &amp; <span className="font-semibold">Vishwa007</span>
          </div>
        )}
      </div>

      {/* User info + logout */}
      {user && (
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="text-right hidden md:block">
            <p className="text-white text-sm font-semibold leading-none truncate max-w-[140px]">{user.name}</p>
            <p className="text-white/70 text-xs mt-0.5">
              {ROLE_LABELS[user.role]} · {user.emp_no}
            </p>
          </div>
          <div className="h-8 w-8 rounded-full bg-white/20 border border-white/30 flex items-center justify-center text-white font-bold text-sm select-none flex-shrink-0">
            {user.name?.[0]?.toUpperCase()}
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-white/80 hover:text-white border border-white/30 hover:border-white/60 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all duration-150 hover:bg-white/10 whitespace-nowrap"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
