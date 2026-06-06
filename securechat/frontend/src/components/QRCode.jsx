import { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

export function QRCode({ value }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: 180,
      margin: 2,
      color: { dark: '#0f172a', light: '#f8fafc' },
    }).catch(console.error);
  }, [value]);

  return <canvas ref={canvasRef} className="qr-canvas" />;
}
