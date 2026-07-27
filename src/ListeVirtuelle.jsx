import React, { useRef, useState, useMemo, useLayoutEffect, useCallback } from "react";
import { calculerOffsets, calculerFenetre } from "./fenetrage.js";

/**
 * ListeVirtuelle — ne rend que les lignes visibles.
 *
 * Le rail contient plusieurs milliers de scrutins. Les rendre tous fige la
 * page ; en plafonner l'affichage rend les plus anciens inatteignables. On
 * garde donc la hauteur totale réelle — la barre de défilement dit la vérité
 * sur la quantité — mais on ne monte dans le DOM que la fenêtre visible,
 * plus une marge de part et d'autre pour absorber un défilement rapide.
 *
 * Les hauteurs de ligne sont variables (les titres de loi vont d'une à huit
 * lignes). On les mesure au premier rendu et on les met en cache par clé ;
 * tant qu'une ligne n'a pas été vue, on utilise `hauteurEstimee`.
 *
 * ATTENTION AUX BOUCLES DE RENDU. Trois garde-fous, chacun ayant déjà causé un
 * écran noir pendant l'écriture de ce fichier :
 *   - `setFenetre` ne remplace l'état que si les bornes ont réellement changé ;
 *     sinon un objet neuf à chaque appel relance le cycle indéfiniment ;
 *   - `useLayoutEffect` a des dépendances explicites — sans elles il s'exécute
 *     à chaque rendu, donc après chaque `setFenetre` qu'il provoque ;
 *   - la mesure d'une ligne n'incrémente la version qu'au-delà d'un demi-pixel
 *     d'écart, les arrondis sub-pixel suffisant à entretenir la boucle.
 */
export default function ListeVirtuelle({
  items,
  cle,
  rendu,
  hauteurEstimee = 74,
  marge = 6,
  conteneurRef,
}) {
  const interne = useRef(null);
  const conteneur = conteneurRef ?? interne;
  const hauteurs = useRef(new Map());

  const [version, setVersion] = useState(0);   // bumpée quand une mesure change
  const [fenetre, setFenetre] = useState({ debut: 0, fin: 30 });

  /* Décalages cumulés. Recalculés seulement quand la liste ou les hauteurs
     mesurées changent — pas à chaque rendu. */
  const offsets = useMemo(
    () => calculerOffsets(items.length,
      (i) => hauteurs.current.get(cle(items[i])) ?? hauteurEstimee),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, cle, hauteurEstimee, version]
  );

  const hauteurTotale = offsets[items.length] || 0;

  const recalculer = useCallback(() => {
    const el = conteneur.current;
    if (!el) return;
    const { debut, fin } = calculerFenetre(
      offsets, items.length, el.scrollTop, el.clientHeight, marge
    );
    /* Ne remplacer l'état que si les bornes bougent : c'est ce test qui casse
       la boucle de rendu. */
    setFenetre((f) => (f.debut === debut && f.fin === fin ? f : { debut, fin }));
  }, [conteneur, items.length, marge, offsets]);

  useLayoutEffect(() => {
    recalculer();
    const el = conteneur.current;
    if (!el) return undefined;
    el.addEventListener("scroll", recalculer, { passive: true });
    const ro = new ResizeObserver(recalculer);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", recalculer);
      ro.disconnect();
    };
  }, [recalculer, conteneur]);

  /* Mesure d'une ligne réellement rendue. Le seuil d'un demi-pixel évite que
     les arrondis de rendu ne relancent le cycle sans fin. */
  const mesurer = useCallback((k) => (el) => {
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0 && Math.abs((hauteurs.current.get(k) ?? -1) - h) > 0.5) {
      hauteurs.current.set(k, h);
      setVersion((n) => n + 1);
    }
  }, []);

  const debut = Math.min(fenetre.debut, Math.max(0, items.length - 1));
  const fin = Math.min(fenetre.fin, items.length);
  const visibles = items.slice(debut, fin);

  return (
    <div style={{ height: hauteurTotale, position: "relative" }}>
      <div style={{ position: "absolute", top: offsets[debut] || 0, left: 0, right: 0 }}>
        {visibles.map((item, n) => {
          const k = cle(item);
          return (
            <div key={k} ref={mesurer(k)}>
              {rendu(item, debut + n)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
