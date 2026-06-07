import { useState, useEffect } from 'react';
import { Lobby } from './components/Lobby.jsx';
import { Chat } from './components/Chat.jsx';
import './styles.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="app">
      <button className="theme-toggle" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle theme">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      {!session
        ? <Lobby onJoin={setSession} />
        : <Chat session={session} onLeave={() => setSession(null)} />
      }
    </div>
  );
}
