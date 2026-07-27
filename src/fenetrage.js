/**
 * fenetrage.js — calcul de la fenêtre visible d'une liste virtualisée.
 *
 * Isolé de ListeVirtuelle.jsx pour être testable sans DOM ni React. Les
 * erreurs de virtualisation sont pénibles à diagnostiquer une fois montées
 * dans un composant : une borne fausse se manifeste par des lignes qui
 * clignotent ou disparaissent, jamais par un message clair.
 */

/**
 * Décalages cumulés : `offsets[i]` est la position du haut de la ligne i,
 * `offsets[n]` la hauteur totale.
 *
 * @param {number} n nombre de lignes
 * @param {(i:number)=>number} hauteurDe hauteur mesurée ou estimée
 * @returns {Float64Array} de longueur n+1
 */
export function calculerOffsets(n, hauteurDe) {
  const o = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const h = hauteurDe(i);
    o[i + 1] = o[i] + (Number.isFinite(h) && h > 0 ? h : 0);
  }
  return o;
}

/**
 * Première ligne dont le bas dépasse strictement `y`, par dichotomie.
 * Sur 5 000 entrées, un parcours linéaire à chaque événement de défilement
 * se sent nettement.
 *
 * La comparaison est `<=` et non `<` : une ligne s'étend sur [haut, bas[, donc
 * celle dont le bas vaut exactement `y` ne couvre pas `y` — c'est la ligne
 * suivante. Avec `<`, chaque frontière exacte décalait la fenêtre d'un rang.
 */
export function chercherIndex(offsets, n, y) {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Bornes des lignes à monter dans le DOM, marge comprise.
 *
 * @returns {{debut:number, fin:number}} `fin` est exclusive, et les bornes
 *          restent toujours dans [0, n] même si le défilement dépasse la
 *          hauteur totale — ce qui arrive quand la liste rétrécit sous l'effet
 *          d'un filtre alors que la position de défilement, elle, ne bouge pas.
 */
export function calculerFenetre(offsets, n, scrollTop, hauteurVisible, marge = 6) {
  if (n <= 0) return { debut: 0, fin: 0 };

  const haut = Math.max(0, scrollTop);
  const bas = haut + Math.max(0, hauteurVisible);

  const premier = chercherIndex(offsets, n, haut);
  let dernier = premier;
  while (dernier < n && offsets[dernier] < bas) dernier++;

  return {
    debut: Math.max(0, premier - marge),
    fin: Math.min(n, Math.max(dernier + marge, premier + 1)),
  };
}
