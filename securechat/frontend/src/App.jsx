import { useState } from 'react';
import { Lobby } from './components/Lobby.jsx';
import { Chat } from './components/Chat.jsx';
import './styles.css';

export default function App() {
  const [session, setSession] = useState(null); // { roomId, code, isCreator }

  function handleJoin(sessionData) {
    setSession(sessionData);
  }

  function handleLeave() {
    setSession(null);
  }

  return (
    <div className="app">
      {!session
        ? <Lobby onJoin={handleJoin} />
        : <Chat session={session} onLeave={handleLeave} />
      }
    </div>
  );
}
