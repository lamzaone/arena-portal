"use client";

import { Crosshair, Pause, Play, Swords } from "lucide-react";
import { useState } from "react";
import { BrandEmblem } from "@/components/brand-emblem";
import styles from "./arena-brand-scene.module.css";

export function ArenaBrandScene() {
  const [paused, setPaused] = useState(false);
  return (
    <div className={styles.wrapper} data-paused={paused} data-depth-card={paused ? undefined : ""}>
      <div className={styles.scene} aria-hidden="true" data-depth-art>
        <span className={styles.outlineWord}>TAPPED</span>
        <div className={styles.halo} /><div className={styles.orbit} /><div className={styles.innerOrbit} />
        <div className={styles.crest}><BrandEmblem width={460} priority className={styles.logo} /></div>
        <div className={`${styles.tag} ${styles.topTag}`}><Crosshair /><span>ONE ARENA.<strong>EVERY ROUND COUNTS.</strong></span></div>
        <div className={`${styles.tag} ${styles.bottomTag}`}><Swords /><span>YOUR NEXT CHALLENGER<strong>IS ONE ROUND AWAY.</strong></span></div>
        <span className={styles.point} /><span className={styles.coordinate}>COUNTER-STRIKE 2 / RO</span>
      </div>
      <button className={styles.motionToggle} type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? "Enable motion" : "Pause motion"}
      </button>
    </div>
  );
}
