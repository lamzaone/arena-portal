/** Deterministic decorative markup; the theme and accessibility styles own motion. */
export function PortalAtmosphere({ themeKey }: { themeKey: string }) {
  return <div className="portal-atmosphere" data-atmosphere={themeKey} aria-hidden="true">
    <div className="atmosphere-wash" />
    <div className="atmosphere-grid" />
    <div className="atmosphere-horizon" />
    <div className="atmosphere-light atmosphere-light-one" />
    <div className="atmosphere-light atmosphere-light-two" />
    <div className="atmosphere-frame atmosphere-frame-one"><i /><i /><i /><i /></div>
    <div className="atmosphere-frame atmosphere-frame-two"><i /><i /><i /><i /></div>
    <svg className="atmosphere-circuit" viewBox="0 0 1200 900" fill="none" focusable="false">
      <g className="atmosphere-traces"><path d="M0 188h180l92 92h154M1200 94H960l-78 78v150M1200 730H940l-76-76H640M0 708h198l66-66V510" /><path d="M0 202h174l92 92h112M1200 108H966l-70 70v104M1200 744H932l-74-74H750" /></g>
      <g className="atmosphere-nodes"><rect x="420" y="274" width="12" height="12" /><rect x="876" y="316" width="12" height="12" /><rect x="634" y="648" width="12" height="12" /><rect x="258" y="504" width="12" height="12" /></g>
    </svg>
    <span className="atmosphere-vignette" />
  </div>;
}
