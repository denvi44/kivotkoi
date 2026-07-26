/**
 * hemicycle.js — géométrie des sièges.
 *
 * Isolé de App.jsx pour être testable sans DOM ni transpilation JSX : la
 * version précédente du projet plaçait 492 sièges au lieu de 577 et laissait
 * l'angle atteindre 1,73 π, si bien que les sièges bouclaient au-delà du
 * demi-cercle et se superposaient. Une erreur invisible à la lecture, évidente
 * dans une assertion.
 *
 * Convention : θ = π à l'extrême gauche de l'hémicycle, θ = 0 à l'extrême
 * droite. Le rayon est normalisé entre `rInt` (premier rang) et 1 (dernier).
 */

/**
 * @param {number} total nombre de sièges à placer
 * @param {number} [rangs] nombre de rangs concentriques
 * @param {number} [rInt] rayon du rang le plus intérieur, entre 0 et 1
 * @returns {Array<{theta:number, rayon:number, rang:number}>}
 *          exactement `total` sièges, ordonnés de la gauche vers la droite
 */
export function construireSieges(total, rangs = 11, rInt = 0.44) {
  if (!Number.isFinite(total) || total <= 0) return [];

  /* Chaque rang reçoit au moins un siège (voir `Math.max` plus bas) : demander
     plus de rangs que de sièges produirait donc plus de sièges que demandé.
     C'est exactement la dérive qui donnait 492 sièges pour 577 dans la version
     archivée, à une autre échelle. */
  rangs = Math.min(rangs, total);

  const rayons = rangs === 1
    ? [1]
    : Array.from({ length: rangs }, (_, i) => rInt + (1 - rInt) * (i / (rangs - 1)));
  const somme = rayons.reduce((a, b) => a + b, 0);

  // Répartition proportionnelle au rayon : les rangs extérieurs sont plus longs.
  const parRang = rayons.map((r) => Math.max(1, Math.round((total * r) / somme)));

  // Les arrondis ne tombent jamais juste : on redistribue l'écart un siège à la
  // fois, en partant du rang extérieur. Sans cette boucle, le total dérive.
  let ecart = total - parRang.reduce((a, b) => a + b, 0);
  let i = rangs - 1;
  let garde = 0;
  while (ecart !== 0) {
    if (parRang[i] > 1 || ecart > 0) {
      parRang[i] += ecart > 0 ? 1 : -1;
      ecart += ecart > 0 ? -1 : 1;
    }
    i = (i - 1 + rangs) % rangs;
    if (++garde > total * rangs + rangs) break; // filet, jamais atteint en pratique
  }

  const sieges = [];
  parRang.forEach((n, rang) => {
    for (let j = 0; j < n; j++) {
      // (j + 0.5) / n maintient t dans ]0,1[ : θ ne sort jamais de [0, π].
      const t = n === 1 ? 0.5 : (j + 0.5) / n;
      sieges.push({ theta: Math.PI * (1 - t), rayon: rayons[rang], rang });
    }
  });

  // Ordre continu de la gauche (θ = π) vers la droite (θ = 0).
  sieges.sort((a, b) => b.theta - a.theta || a.rayon - b.rayon);
  return sieges;
}
