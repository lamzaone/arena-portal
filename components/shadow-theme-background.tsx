/** Decorative, deterministic markup. The Shadow stylesheet owns all motion. */
export function ShadowThemeBackground() {
  return (
    <div className="shadow-atmosphere" aria-hidden="true">
      <span className="shadow-monogram-field" />
      <span className="shadow-veil shadow-veil-one" />
      <span className="shadow-veil shadow-veil-two" />
      <span className="shadow-orbit shadow-orbit-one" />
      <span className="shadow-orbit shadow-orbit-two" />
      <div className="shadow-floating-marks">
        {[0, 1, 2, 3].map((mark) => (
          <svg
            key={mark}
            className="shadow-floating-mark"
            viewBox="400 190 790 535"
            fill="currentColor"
            focusable="false"
          >
            {/* Exact faces of the TAPPED monogram, without its crosshair. */}
            <path d="M434 215H1138L1038 308H523Z" />
            <path d="M729 342H892L628 600V466H603Z" />
            <path d="M951 321H1035L853 503H771Z" />
            <path d="M769 515L654 640L546 718L621 637Z" />
          </svg>
        ))}
      </div>
      <span className="shadow-edge-light" />
      <div className="shadow-ink-field">
        <span className="shadow-ink-ribbon shadow-ink-ribbon-left" />
        <span className="shadow-ink-ribbon shadow-ink-ribbon-right" />
      </div>
    </div>
  );
}

export function ShadowProfileAura() {
  return (
    <div className="shadow-profile-aura" aria-hidden="true">
      <span className="shadow-profile-ink shadow-profile-ink-back" />
      <span className="shadow-profile-ink shadow-profile-ink-front" />
    </div>
  );
}
