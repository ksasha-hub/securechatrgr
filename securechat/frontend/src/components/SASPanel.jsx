export function SASPanel({ sas, verified, onVerify }) {
  return (
    <div className={`sas-panel ${verified ? 'sas-verified' : ''}`}>
      <div className="sas-content">
        <div className="sas-label">
          {verified
            ? '✅ Key fingerprint verified'
            : '⚠️ Verify fingerprint with your peer out-of-band (voice / video)'}
        </div>
        <div className="sas-emojis">{sas}</div>
        <div className="sas-hint">
          Both sides must see the same emoji sequence
        </div>
      </div>
      {!verified && (
        <button className="btn-verify" onClick={onVerify}>
          ✓ They match
        </button>
      )}
    </div>
  );
}
