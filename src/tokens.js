/**
 * tokens.js — jetons de couleur pour les styles en ligne du SVG.
 *
 * Le SVG de l'hémicycle pose ses couleurs en attribut `fill`/`stroke`, pas en
 * CSS : il lui faut des valeurs littérales, pas des `var(--…)`.
 * Ces valeurs sont donc dupliquées depuis `src/index.css`.
 *
 * Toute modification ici doit être répercutée dans `:root` de index.css,
 * et inversement. Le test `test/tokens.test.mjs` vérifie que les deux
 * fichiers ne divergent pas.
 */
export const T = {
  ink: "#14110F",
  slate: "#1F1B18",
  raise: "#282320",
  line: "#3A332E",
  bone: "#EDE6DA",
  dust: "#8C8378",
  brass: "#C9A227",
  pour: "#5E9C6B",
  contre: "#C05A4A",
  abst: "#B79B5A",
  absent: "#4A433C",
};

export default T;
