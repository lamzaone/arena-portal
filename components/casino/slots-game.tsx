export function SlotsGame() {
  return <div className="casino-slots"><p className="casino-kicker">Requested collection</p><h2>Slots are unavailable.</h2><p>These titles are currently unavailable here. Explore Roulette, Blackjack, Crash and Plinko with your shared Token wallet.</p><ul>{["Dazzling Hot", "Burning Hot", "Shining Crown", "Sweet Bonanza"].map((name, index) => <li key={name}><span>0{index + 1}</span><strong>{name}</strong><small>Unavailable</small></li>)}</ul></div>;
}
