export function SASPanel({ sas, verified, onVerify }) {
  return (
    <div className={`sas-panel ${verified ? 'sas-verified' : ''}`}>
      <div className="sas-content">
        <div className="sas-label">
          {verified ? '✅ Key fingerprint verified' : '⚠️ Compare this code with your peer to confirm no one is intercepting'}
        </div>
        <div className="sas-emojis">{sas}</div>
      </div>
      {!verified && <button className="btn-verify" onClick={onVerify}>✓ Match</button>}
    </div>
  );
}
