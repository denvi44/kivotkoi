import React, { useEffect, useRef } from "react";
import { T } from "./tokens.js";
import { couleurDe } from "./groupes.js";
import { lienParlementaire } from "./liens.js";

/**
 * FicheDepute — panneau latéral, ouvert au clic sur un siège ou un nom.
 *
 * Le parti pris de ce composant est de ne jamais afficher un taux nu. Chaque
 * chiffre est accompagné de son dénominateur et de la médiane du groupe, parce
 * qu'un « 6 % de participation » lu seul décrit une négligence imaginaire là où
 * la comparaison montre une pratique partagée.
 */

const pourcent = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)} %`);

/** Barre comparative : la valeur du député, le repère du groupe en surimpression. */
function Jauge({ valeur, mediane, couleur }) {
  if (valeur === null || valeur === undefined) return null;
  return (
    <div className="jauge" aria-hidden="true">
      <span className="j-fond" />
      <span className="j-valeur" style={{ width: `${valeur * 100}%`, background: couleur }} />
      {mediane !== null && mediane !== undefined && (
        <span className="j-mediane" style={{ left: `${mediane * 100}%` }} />
      )}
    </div>
  );
}

function Mesure({ titre, valeur, mediane, detail, note, couleur }) {
  return (
    <div className="mesure">
      <div className="m-tete">
        <span className="m-titre">{titre}</span>
        <span className="mono m-val">{pourcent(valeur)}</span>
      </div>
      <Jauge valeur={valeur} mediane={mediane} couleur={couleur} />
      <div className="m-pied mono">
        <span>{detail}</span>
        {mediane !== null && mediane !== undefined && (
          <span>médiane du groupe {pourcent(mediane)}</span>
        )}
      </div>
      {note && <p className="m-note">{note}</p>}
    </div>
  );
}

export default function FicheDepute({ etat, onFermer }) {
  const panneau = useRef(null);
  const origine = useRef(null);

  useEffect(() => {
    /* Mémoriser d'où l'on vient : à la fermeture, le focus doit revenir sur
       l'élément déclencheur, sinon il repart au début du document et l'on
       perd sa place dans une liste de plusieurs centaines de noms. */
    origine.current = document.activeElement;
    panneau.current?.focus();

    const surTouche = (e) => {
      if (e.key === "Escape") { onFermer(); return; }
      if (e.key !== "Tab") return;

      /* Confinement du focus : sans lui, la tabulation sort du panneau et
         parcourt la page qui se trouve derrière le voile, invisible mais
         toujours atteignable au clavier. */
      const cibles = panneau.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!cibles?.length) return;
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];

      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault(); dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault(); premier.focus();
      }
    };

    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("keydown", surTouche);
      if (origine.current instanceof HTMLElement) origine.current.focus();
    };
  }, [onFermer]);

  const d = etat.donnees;

  return (
    <>
      <div className="voile" onClick={onFermer} />
      <aside className="fiche" ref={panneau} tabIndex={-1}
             role="dialog" aria-modal="true"
             aria-label={`Fiche de ${d?.nom ?? "député"}`}>
        <button className="fermer" onClick={onFermer} aria-label="Fermer la fiche">×</button>

        {etat.statut === "chargement" && <p className="f-etat">chargement de la fiche…</p>}

        {etat.statut === "erreur" && (
          <p className="f-etat" role="alert">
            Fiche indisponible ({etat.erreur}). Ce député n'a peut-être pris part
            à aucun scrutin de la période couverte.
          </p>
        )}

        {d && (
          <>
            <header className="f-tete">
              {d.groupe && (
                <span className="f-pastille" style={{ background: couleurDe(d.groupe) }} />
              )}
              <h2 className="disp">{d.nom}</h2>
              <div className="f-sous mono">
                {[d.groupe, d.circonscription].filter(Boolean).join(" · ")}
              </div>
              {d.parti && <div className="f-parti">{d.parti}</div>}
              {d.profession && <div className="f-metier">{d.profession}</div>}
            </header>

            <section className="f-bloc">
              <div className="eyebrow">Participation aux scrutins publics</div>

              <Mesure
                titre="Scrutins solennels"
                valeur={d.participation.solennel.taux}
                mediane={d.medianesGroupe?.solennel}
                couleur={couleurDe(d.groupe)}
                detail={`${d.participation.solennel.participations} sur ${d.participation.solennel.scrutins}`}
                note="Votes sur l'ensemble d'un texte, annoncés à l'avance. C'est là que la présence est attendue, et donc mesurable."
              />

              <Mesure
                titre="Scrutins ordinaires"
                valeur={d.participation.ordinaire.taux}
                mediane={d.medianesGroupe?.ordinaire}
                couleur={couleurDe(d.groupe)}
                detail={`${d.participation.ordinaire.participations} sur ${d.participation.ordinaire.scrutins}`}
                note="Ces scrutins se tiennent avec les députés présents en séance : la médiane est d'environ 133 votants sur 577. Un taux bas y est la norme, pas un manquement — seul l'écart à la médiane du groupe dit quelque chose."
              />

              <p className="f-avert">
                Ces chiffres ne mesurent pas l'activité parlementaire. Le travail
                en commission, les rapports, les questions écrites et les missions
                n'y figurent pas.
              </p>
            </section>

            <section className="f-bloc">
              <div className="eyebrow">Accord avec la ligne du groupe</div>
              <Mesure
                titre="Votes conformes"
                valeur={d.ligne.taux}
                mediane={d.medianesGroupe?.ligne}
                couleur={couleurDe(d.groupe)}
                detail={`${d.ligne.aligne} sur ${d.ligne.exprimes} votes exprimés`}
                note="La ligne du groupe est publiée par l'Assemblée pour chaque scrutin, elle n'est pas reconstituée. Les « non votants » sont exclus : ne pas prendre part n'est ni un accord ni un désaccord."
              />

              {d.censure?.motions > 0 && (
                <div className="mesure">
                  <div className="m-tete">
                    <span className="m-titre">Motions de censure votées</span>
                    <span className="mono m-val">{d.censure.votees} / {d.censure.motions}</span>
                  </div>
                  <p className="m-note">
                    L'article 49 de la Constitution ne fait recenser que les voix
                    favorables : s'abstenir, s'opposer ou être absent y sont
                    indiscernables. Ce compte est une position politique, pas une
                    mesure de présence.
                  </p>
                </div>
              )}
            </section>

            {d.divergences?.length > 0 && (
              <section className="f-bloc">
                <div className="eyebrow">
                  Votes contraires à la ligne · {d.ligne.diverge} au total
                </div>
                <ul className="f-diverg">
                  {d.divergences.map((v) => (
                    <li key={v.numero}>
                      <div className="mono d-meta">
                        n° {v.numero} · {v.date} · groupe&nbsp;: {v.ligne} → vote&nbsp;: {v.vote}
                      </div>
                      <div className="d-titre">{v.titre}</div>
                    </li>
                  ))}
                </ul>
                {d.ligne.diverge > d.divergences.length && (
                  <p className="m-note">
                    {d.ligne.diverge - d.divergences.length} divergences plus
                    anciennes ne sont pas listées.
                  </p>
                )}
              </section>
            )}

            {d.mandats?.length > 0 && (
              <section className="f-bloc">
                <div className="eyebrow">Mandats et fonctions</div>
                <ul className="f-mandats">
                  {d.mandats.map((m, i) => (
                    <li key={i} data-fini={m.fin ? "1" : "0"}>
                      <div className="mono m-cat">
                        {m.categorie}
                        {m.qualite && <span className="m-role"> · {m.qualite}</span>}
                      </div>
                      <div className="m-org">{m.organe}</div>
                      <div className="mono m-dates">
                        {m.debut}{m.fin ? ` → ${m.fin}` : " → en cours"}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="f-pied mono">
              {lienParlementaire("an", d.id) && (
                <a className="lien-source" style={{ marginBottom: 10 }}
                   href={lienParlementaire("an", d.id)}
                   target="_blank" rel="noopener noreferrer">
                  Fiche officielle
                  <span className="sr-only"> de {d.nom} sur assemblee-nationale.fr, nouvelle fenêtre</span>
                  <span aria-hidden="true"> ↗</span>
                </a>
              )}
              <div>Période couverte&nbsp;: {d.periode?.premier ?? "—"} → {d.periode?.dernier ?? "—"}</div>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
