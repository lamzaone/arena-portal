type RankThemeGeometryProps = { themeKey: string };

/** Decorative SVG only. Motion is CSS-driven and stops with reduced motion. */
export function RankThemeGeometry({ themeKey }: RankThemeGeometryProps) {
  return (
    <svg className="rank-scene-geometry" viewBox="0 0 600 600" fill="none" aria-hidden="true" focusable="false">
      {themeKey === "vip_silver" && <g className="rank-geometry-metal">
        <path d="M110 150H490M110 156H490M150 168H450M110 440H490M110 446H490" />
        <path d="M110 185V155H140M460 155H490V185M110 415V445H140M460 445H490V415" />
      </g>}
      {themeKey === "vip_gold" && <g className="rank-geometry-gold">
        <path d="M130 120H470V480H130ZM140 130H460V470H140Z" />
        <path className="rank-geometry-trace" d="M130 250V120H300M470 350V480H300" />
        <path d="m300 95 18 25-18 25-18-25Zm0 360 18 25-18 25-18-25Z" />
      </g>}
      {themeKey === "vip_diamond" && <g className="rank-geometry-diamond">
        <path className="rank-geometry-facet" d="m140 170 160-60 160 60-160 300Z" />
        <path d="m140 170 80 50 80-110 80 110 80-50M140 170h320M220 220h160M220 220l80 250 80-250M300 110v360" />
        <path className="rank-geometry-glint" d="M300 70v80M260 110h80M440 170h40M460 150v40" />
        <path className="rank-geometry-trace" d="m140 170 160-60 160 60-160 300Z" />
      </g>}
      {themeKey === "vip_ultimate" && <g className="rank-geometry-electric">
        <path className="rank-electric-ghost" d="M405 45 300 175 355 166 235 310 282 294 170 485M300 175l-69 20 8 59-96 81M282 294l88 17-11 59 79 51" />
        <path className="rank-electric-arc" pathLength="100" d="M405 45 300 175 355 166 235 310 282 294 170 485" />
        <path className="rank-electric-branch" pathLength="100" d="M300 175l-69 20 8 59-96 81M282 294l88 17-11 59 79 51" />
        <circle className="rank-electric-ring" cx="300" cy="280" r="184" strokeDasharray="120 18 3 18" />
      </g>}
      {themeKey === "staff" && <g className="rank-geometry-instrument">
        <path d="M120 120h360v360H120ZM150 150h300v300H150Z" />
        <path d="M100 200h40M100 300h50M100 400h40M460 200h40M450 300h50M460 400h40M200 100v40M300 100v50M400 100v40M200 460v40M300 450v50M400 460v40" />
        <path className="rank-geometry-trace" d="M120 200v-80h80M400 480h80v-80" />
      </g>}
      {themeKey === "moderator" && <g className="rank-geometry-radar">
        <circle cx="300" cy="300" r="180" /><circle cx="300" cy="300" r="120" /><circle cx="300" cy="300" r="60" />
        <path d="M300 100v400M100 300h400" />
        <g className="rank-radar-sweep"><path d="M300 300V120A180 180 0 0 1 390 144Z" /><path d="M300 300V120" /></g>
        <circle className="rank-radar-target" cx="370" cy="220" r="5" /><circle className="rank-radar-target" cx="225" cy="345" r="4" />
      </g>}
      {themeKey === "administrator" && <g className="rank-geometry-circuit">
        <path d="M100 160h100l50 50h140l90-90M100 240h90l70 70h90l140-140M100 360h80l90-90h130l80 80M140 480l100-100h100l110 110" />
        <path className="rank-circuit-signal" pathLength="100" d="M100 160h100l50 50h140l90-90M100 360h80l90-90h130l80 80" />
        <circle cx="100" cy="160" r="5" /><circle cx="480" cy="120" r="5" /><circle cx="480" cy="350" r="5" /><circle cx="140" cy="480" r="5" />
      </g>}
      {themeKey === "senior_administrator" && <g className="rank-geometry-orbital">
        <circle cx="300" cy="300" r="185" strokeDasharray="160 18 6 18" />
        <circle className="rank-orbital-inner" cx="300" cy="300" r="145" strokeDasharray="60 14 2 14" />
        <path d="m300 225 65 38v74l-65 38-65-38v-74ZM235 263l130 74M365 263l-130 74M300 225v150" />
        <circle className="rank-orbital-node" cx="300" cy="115" r="6" /><circle cx="300" cy="485" r="4" />
      </g>}
      {themeKey === "owner" && <g className="rank-geometry-crown">
        <circle className="rank-crown-orbit" cx="300" cy="300" r="200" strokeDasharray="180 22 4 22" />
        <circle cx="300" cy="300" r="175" />
        <path className="rank-crown-face" d="m165 235 75 55 60-115 60 115 75-55-35 140H200Z" />
        <path className="rank-geometry-trace" d="M200 390h200M215 405h170M165 235l75 55 60-115 60 115 75-55" />
        <circle cx="300" cy="175" r="5" /><circle cx="165" cy="235" r="4" /><circle cx="435" cy="235" r="4" />
      </g>}
    </svg>
  );
}
