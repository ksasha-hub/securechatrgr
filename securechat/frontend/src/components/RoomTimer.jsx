import { useState, useEffect } from 'react';

export function RoomTimer({ ttlMs }) {
  const [startedAt] = useState(Date.now());
  const [remaining, setRemaining] = useState(ttlMs);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, ttlMs - elapsed);
      setRemaining(left);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, ttlMs]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const urgent = remaining < 5 * 60 * 1000;

  return (
    <div className={`room-timer ${urgent ? 'timer-urgent' : ''}`} title="Room expires in">
      ⏱ {label}
    </div>
  );
}
