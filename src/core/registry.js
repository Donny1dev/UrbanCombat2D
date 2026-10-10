// Late-bound registry. Higher-level systems register themselves here in main.js so lower layers can
// call up (e.g. an explosion particle asking the game to shake the camera) without import cycles.
export const G = {
  game: null, ui: null, hud: null, director: null, equip: null, achievements: null, objectives: null,
  profile: null, save: null, training: null, perf: null,
};
// Mutable world state for the current run.
export const W = { player: null, enemies: [], corpses: [], time: 0 };
