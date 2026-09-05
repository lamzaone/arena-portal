/** Decorative geometry only: no timers, pointer handlers, or client bundle. */
export function RankThemeBackground() {
  return (
    <div className="rank-theme-backdrop" aria-hidden="true">
      <div className="rank-backdrop-grid" />
      <div className="rank-backdrop-beam" />
      <div className="rank-backdrop-orbit" />
      <div className="rank-backdrop-motes">
        {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
      </div>
      <div className="rank-backdrop-halo" />
    </div>
  );
}
