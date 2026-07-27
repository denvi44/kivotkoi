import React, { useMemo, useState, useEffect, useRef } from "react";
import { T } from "./tokens.js";
import { ordonner, couleurDe } from "./groupes.js";
import { construireSieges } from "./hemicycle.js";
import ListeVirtuelle from "./ListeVirtuelle.jsx";
import FicheDepute from "./FicheDepute.jsx";
import Calendrier from "./Calendrier.jsx";
import { grouper, decouper } from "./dates.js";
import { lienScrutin } from "./liens.js";

/* ============================================================
   CHAMBRE — visualisation des scrutins publics de l'Assemblée.
   Direction : l'interface est achromatique (encre chaude / os).
   La seule couleur saturée de la page vient des groupes eux-mêmes.

   Toutes les données viennent de /donnees/, produit par
   scripts/ingest.mjs depuis l'open data de l'Assemblée nationale.
   Rien n'est inventé côté client : s'il n'y a pas de données,
   l'interface le dit au lieu d'en fabriquer.
   ============================================================ */

const CASES = ["pour", "contre", "abstention", "nonVotant", "absent"];

/* Couleurs de TEXTE, pas les jetons d'aplat : --contre et --absent tombent
   respectivement à 3,91 et 1,75 sur ce fond, sous le seuil de 4,5:1. */
const COLONNES = [
  ["Pour", "pour", T.pour],
  ["Contre", "contre", T.contreTxt],
  ["Abstention", "abstention", T.abst],
  ["Non votants", "nonVotant", T.absentTxt],
  ["Absents", "absent", T.absentTxt],
];

const BASE = `${import.meta.env.BASE_URL}donnees`;

/* Définie au niveau du module : passée en ligne, son identité changerait à
   chaque rendu et invaliderait le cache de la liste virtualisée. */
const cleScrutin = (s) => s.numero;


/* ---------- chargement ---------- */
function useJson(url) {
  const [etat, setEtat] = useState({ statut: "chargement", donnees: null, erreur: null });

  useEffect(() => {
    if (!url) return;
    let annule = false;
    setEtat({ statut: "chargement", donnees: null, erreur: null });

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((d) => { if (!annule) setEtat({ statut: "ok", donnees: d, erreur: null }); })
      .catch((e) => { if (!annule) setEtat({ statut: "erreur", donnees: null, erreur: e.message }); });

    return () => { annule = true; };
  }, [url]);

  return etat;
}

/* ---------- mise en forme d'un scrutin pour l'hémicycle ----------
   `complet` : inclure les absents. L'Assemblée ne publie pas leur identité,
   seulement l'effectif du groupe (`nombreMembresGroupe`). On les représente
   donc par des sièges anonymes, en nombre exact. Sans eux, un scrutin
   ordinaire n'affiche qu'environ 135 sièges sur 577 — visuellement on croit
   voir l'hémicycle entier alors qu'on ne voit que les votants. */
function useVue(scrutin, noms, complet) {
  return useMemo(() => {
    if (!scrutin?.groupes) return null;

    const nom = (id) => noms?.[id] ?? id;

    const brut = Object.entries(scrutin.groupes).map(([id, g]) => {
      const votants = CASES.reduce((t, c) => t + (g[c]?.length ?? 0), 0);
      return {
        id, cases: g, votants,
        absents: complet ? (g.absents ?? 0) : 0,
        sieges: votants + (complet ? (g.absents ?? 0) : 0),
      };
    });
    const { ordonnes, inconnus } = ordonner(brut);

    const total = ordonnes.reduce((t, g) => t + g.sieges, 0);
    const geometrie = construireSieges(total);

    const sieges = [];
    let curseur = 0;
    for (const g of ordonnes) {
      const poser = (vote, id) => {
        const geo = geometrie[curseur];
        if (!geo) return;
        sieges.push({
          i: curseur, ...geo,
          groupe: g.id, couleur: couleurDe(g.id), vote,
          id: id ?? null, nom: id ? nom(id) : null,
        });
        curseur++;
      };
      for (const c of CASES) for (const id of g.cases[c] ?? []) poser(c, id);
      for (let k = 0; k < g.absents; k++) poser("absent", null);
    }

    /* Garde : chaque député dans exactement une case, clé sur l'identifiant.
       Le contrôle est refait ici parce que le fichier a pu être tronqué en
       transit ; l'ingestion ne protège que ce qu'elle a écrit. */
    const vu = new Map();
    for (const g of ordonnes) {
      for (const c of CASES) {
        for (const id of g.cases[c] ?? []) vu.set(id, (vu.get(id) ?? 0) + 1);
      }
    }
    const enDouble = [...vu.values()].filter((n) => n > 1).length;
    const nommes = ordonnes.reduce((t, g) => t + g.votants, 0);

    const alerte =
      enDouble > 0 ? `${enDouble} député(s) présent(s) dans plusieurs cases`
      : vu.size !== nommes ? `${Math.abs(nommes - vu.size)} député(s) mal comptabilisé(s)`
      : scrutin.anomalies || null;

    const absents = ordonnes.reduce((t, g) => t + g.absents, 0);
    return { groupes: ordonnes, sieges, total, nommes, absents, alerte, inconnus, nom };
  }, [scrutin, noms, complet]);
}

/* =========================== hémicycle =========================== */
function Hemicycle({ sieges, total, mode, actif, onSurvol, onChoisirGroupe, onChoisirDepute,
                    resume }) {
  const W = 1000;
  const cx = W / 2;
  const R = 448;
  const cy = R + 34;
  const H = cy + 22;

  /* Les 577 sièges ne sont pas dans l'ordre de tabulation : ce serait 577
     arrêts avant d'atteindre le reste de la page. L'équivalent accessible
     n'est pas un contournement mais la section « Analyse du scrutin », qui
     liste chaque député sous forme de bouton menant à la même fiche.
     Le graphique porte donc un résumé chiffré et renvoie vers elle. */
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hemi" role="img" aria-label={resume}>
      <path d={`M ${cx - R * 0.30} ${cy + 6} L ${cx + R * 0.30} ${cy + 6}`}
            stroke={T.line} strokeWidth="2" />
      {sieges.map((s) => {
        const x = cx + s.rayon * R * Math.cos(s.theta);
        const y = cy - s.rayon * R * Math.sin(s.theta);
        const horsVote = s.vote === "absent" || s.vote === "nonVotant";
        const base = mode === "groupe"
          ? s.couleur
          : T[s.vote === "abstention" ? "abst" : horsVote ? "absent" : s.vote];
        const estompe = actif && actif !== s.groupe;

        /* Encodage redondant : la forme porte le vote dans les DEUX modes, et
           pas seulement la couleur. Sans cela, un daltonien ne distinguerait
           « pour » de « contre » en mode par vote (WCAG 1.4.1). */
        let fill = base, stroke = "none", sw = 0, op = 1;
        if (s.vote === "contre") { fill = "transparent"; stroke = base; sw = 1.9; }
        else if (s.vote === "abstention") { op = 0.34; }
        else if (horsVote) { fill = T.absent; op = 0.75; }

        return (
          <circle key={s.i} cx={x} cy={y} r={horsVote ? 4.2 : 5.4}
                  fill={fill} stroke={stroke} strokeWidth={sw}
                  className={s.nom ? "siege" : "siege anonyme"}
                  style={{ opacity: estompe ? 0.12 : op, transitionDelay: `${(s.i / total) * 260}ms` }}
                  onMouseEnter={() => onSurvol({ s, x: (x / W) * 100, y: (y / H) * 100 })}
                  onMouseLeave={() => onSurvol(null)}
                  onClick={() => (s.id ? onChoisirDepute(s.id) : onChoisirGroupe(s.groupe))} />
        );
      })}
    </svg>
  );
}

/* =========================== états de page =========================== */
function Message({ titre, children }) {
  return (
    <div className="chambre">
      <div className="wrap" style={{ paddingTop: "12vh", maxWidth: 620 }}>
        <div className="eyebrow">Chambre</div>
        <h1 className="disp" style={{ fontSize: 34, margin: "12px 0 14px" }}>{titre}</h1>
        <div style={{ color: T.dust, fontSize: 15, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

/* =========================== application =========================== */
export default function App() {
  const index = useJson(`${BASE}/index.json`);
  const deputes = useJson(`${BASE}/deputes.json`);
  const [numero, setNumero] = useState(null);
  const [mode, setMode] = useState("groupe");
  const [complet, setComplet] = useState(true);
  const [actif, setActif] = useState(null);
  const [survol, setSurvol] = useState(null);
  const [q, setQ] = useState("");
  const [recherche, setRecherche] = useState("");
  const [depute, setDepute] = useState(null);   // identifiant PA######
  const [jour, setJour] = useState(null);       // date AAAA-MM-JJ sélectionnée
  const [vueMois, setVueMois] = useState(null); // { annee, mois } affiché
  const railRef = useRef(null);

  const fiche = useJson(depute ? `${BASE}/depute/${depute}.json` : null);

  const liste = index.donnees?.scrutins ?? [];
  const calendrier = useMemo(() => grouper(liste), [liste]);

  const filtres = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    if (!t) return liste;
    return liste.filter((s) =>
      String(s.numero).includes(t) ||
      (s.texte ?? "").toLowerCase().includes(t) ||
      (s.objetVote ?? "").toLowerCase().includes(t)
    );
  }, [liste, recherche]);

  /* Point de départ : le scrutin le plus récent, et le mois qui le contient. */
  useEffect(() => {
    if (numero !== null || !liste.length) return;
    const dernier = liste[0];
    setNumero(dernier.numero);
    setJour(dernier.date);
    const { annee, mois } = decouper(dernier.date);
    setVueMois({ annee, mois });
  }, [liste, numero]);

  const duJour = jour ? (calendrier.parJour.get(jour) ?? []) : [];
  const enRecherche = recherche.trim().length > 0;

  const choisirJour = (iso) => {
    setJour(iso);
    const s = calendrier.parJour.get(iso);
    if (s?.length) { setNumero(s[0].numero); setActif(null); }
  };

  const scrutin = useJson(numero === null ? null : `${BASE}/scrutin-${numero}.json`);
  const vue = useVue(scrutin.donnees, deputes.donnees, complet);

  if (index.statut === "chargement") {
    return <Message titre="Chargement…">Lecture de l'index des scrutins.</Message>;
  }

  if (index.statut === "erreur") {
    return (
      <Message titre="Données indisponibles">
        <p>Impossible de lire <code className="mono">donnees/index.json</code> ({index.erreur}).</p>
        <p>En développement, lance d'abord l'ingestion&nbsp;: <code className="mono">npm run ingest</code></p>
      </Message>
    );
  }

  if (!liste.length) {
    return (
      <Message titre="Aucun scrutin">
        L'index a été généré mais ne contient aucun scrutin publiable.
        Vérifie la sortie de <code className="mono">npm run ingest</code>.
      </Message>
    );
  }

  const meta = liste.find((s) => s.numero === numero) ?? liste[0];
  const c = scrutin.donnees?.compteurs;
  const exprimes = c ? c.pour + c.contre : 0;

  return (
    <div className="chambre">
      {depute && <FicheDepute etat={fiche} onFermer={() => setDepute(null)} />}

      <a className="evitement" href="#hemicycle">Aller à l'hémicycle</a>
      <a className="evitement" href="#analyse">Aller à l'analyse du scrutin</a>

      <div className="wrap">
        <header className="hdr">
          <div>
            <div className="eyebrow">
              Assemblée nationale · {index.donnees.legislature}<sup>e</sup> législature ·{" "}
              Scrutin public n° {meta.numero}
            </div>
            {/* Le sujet d'abord, l'objet procédural ensuite : lire « amendement
                n° 160 de Mme Cathala après l'article 2 » avant de savoir de quel
                texte il s'agit n'apprend rien. */}
            <h1 className="disp titre">{meta.texte ?? meta.objetVote ?? meta.titre}</h1>
            {meta.texte && meta.objetVote && (
              <div className="objet-vote">
                <span className="ov-label">Vote sur</span> {meta.objetVote}
                {meta.stade && <span className="ov-stade">{meta.stade}</span>}
              </div>
            )}
            {!meta.texte && meta.stade && (
              <div className="objet-vote"><span className="ov-stade">{meta.stade}</span></div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            {meta.sort && <div className="verdict">{meta.sort}</div>}
            <div className="mono" style={{ fontSize: 11, color: T.dust, marginTop: 10 }}>
              {meta.date}
              {exprimes > 0 && <> · majorité absolue&nbsp;: {Math.floor(exprimes / 2) + 1}</>}
            </div>
            {/* Le site dit comment on a voté, jamais ce que dit le texte.
                Le renvoi vers la source évite d'avoir à le résumer. */}
            <a className="lien-source"
               href={lienScrutin("an", meta.numero, index.donnees.legislature)}
               target="_blank" rel="noopener noreferrer">
              Le texte et le dossier législatif
              <span className="sr-only"> — sur assemblee-nationale.fr, nouvelle fenêtre</span>
              <span aria-hidden="true"> ↗</span>
            </a>
          </div>
        </header>

        <div className="grille">
          {/* ---- rail des scrutins ---- */}
          <nav className="rail" aria-label="Scrutins" ref={railRef}>
            <div className="tete">
              <h2 className="eyebrow">
                {enRecherche
                  ? `${filtres.length} résultat${filtres.length > 1 ? "s" : ""} sur ${liste.length}`
                  : `Scrutins · ${liste.length}`}
              </h2>
              <input className="champ mini" type="search" value={recherche}
                     placeholder="chercher : titre ou n°…"
                     aria-label="Chercher un scrutin par titre ou numéro"
                     onChange={(e) => setRecherche(e.target.value)} />
            </div>

            {/* Deux modes exclusifs : le calendrier pour parcourir le temps, la
                liste pour retrouver un texte précis. Afficher les deux ferait
                du rail une colonne de 5 000 lignes, ce qu'on cherche à éviter. */}
            {enRecherche ? (
              <>
                <ListeVirtuelle
                  items={filtres}
                  conteneurRef={railRef}
                  cle={cleScrutin}
                  hauteurEstimee={78}
                  rendu={(s) => (
                    <button className="scrutin" data-on={s.numero === numero ? "1" : "0"}
                            onClick={() => {
                              setNumero(s.numero); setActif(null); setJour(s.date);
                              const d = decouper(s.date);
                              setVueMois({ annee: d.annee, mois: d.mois });
                            }}>
                      <div className="mono n">n° {s.numero} · {s.date}</div>
                      <div className="t">{s.texte ?? s.objetVote}</div>
                      {s.texte && s.objetVote && <div className="o">{s.objetVote}</div>}
                    </button>
                  )}
                />
                {filtres.length === 0 && (
                  <p className="fin">Aucun scrutin ne correspond.</p>
                )}
              </>
            ) : vueMois && (
              <>
                <Calendrier
                  parJour={calendrier.parJour}
                  moisDisponibles={calendrier.moisDisponibles}
                  max={calendrier.max}
                  annee={vueMois.annee}
                  mois={vueMois.mois}
                  jourActif={jour}
                  onChoisirJour={choisirJour}
                  onChangerMois={setVueMois}
                />

                <div className="liste-scrutins">
                  {duJour.map((s) => (
                    <button key={s.numero} className="scrutin"
                            data-on={s.numero === numero ? "1" : "0"}
                            onClick={() => { setNumero(s.numero); setActif(null); }}>
                      <div className="mono n">n° {s.numero}</div>
                      <div className="t">{s.texte ?? s.objetVote}</div>
                      {s.texte && s.objetVote && <div className="o">{s.objetVote}</div>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </nav>

          {/* ---- hémicycle ---- */}
          <section className="scene" id="hemicycle" tabIndex={-1}
                   style={{ position: "relative" }}
                   aria-labelledby="titre-hemicycle">
            <h2 className="sr-only" id="titre-hemicycle">
              Hémicycle · répartition des votes
            </h2>
            <div className="toolbar">
              <div className="legende">
                {mode === "groupe" ? (
                  <>
                    <span className="lg"><span className="sw" />Pour</span>
                    <span className="lg"><span className="sw" style={{ background: "transparent", border: `2px solid ${T.bone}` }} />Contre</span>
                    <span className="lg"><span className="sw" style={{ opacity: .34 }} />Abstention</span>
                    <span className="lg"><span className="sw" style={{ background: T.absent }} />Non votant</span>
                  </>
                ) : (
                  <>
                    <span className="lg"><span className="sw" style={{ background: T.pour }} />Pour</span>
                    <span className="lg"><span className="sw" style={{ background: "transparent", border: `2px solid ${T.contre}` }} />Contre</span>
                    <span className="lg"><span className="sw" style={{ background: T.abst, opacity: .34 }} />Abstention</span>
                    <span className="lg"><span className="sw" style={{ background: T.absent }} />Non votant</span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div className="seg" role="group" aria-label="Étendue affichée">
                  <button data-on={complet ? "1" : "0"} onClick={() => setComplet(true)}
                          title="577 sièges : votants nommés + absents anonymes">
                    hémicycle complet
                  </button>
                  <button data-on={complet ? "0" : "1"} onClick={() => setComplet(false)}
                          title="Uniquement les députés que la source nomme">
                    votants seuls
                  </button>
                </div>
                <div className="seg" role="group" aria-label="Coloration des sièges">
                  <button data-on={mode === "groupe" ? "1" : "0"} onClick={() => setMode("groupe")}>par groupe</button>
                  <button data-on={mode === "vote" ? "1" : "0"} onClick={() => setMode("vote")}>par vote</button>
                </div>
              </div>
            </div>

            {scrutin.statut === "chargement" && (
              <p style={{ color: T.dust, fontSize: 13, padding: "60px 0", textAlign: "center" }}>
                chargement du scrutin n° {numero}…
              </p>
            )}

            {scrutin.statut === "erreur" && (
              <p role="alert" style={{ border: `1px solid ${T.contre}`, color: T.contre,
                   padding: "10px 13px", fontSize: 13 }}>
                Scrutin n° {numero} illisible ({scrutin.erreur}).
              </p>
            )}

            {vue && c && (
              <>
                <Hemicycle sieges={vue.sieges} total={vue.total} mode={mode} actif={actif}
                           onSurvol={setSurvol} onChoisirGroupe={setActif}
                           onChoisirDepute={setDepute}
                           resume={
                             `Hémicycle de ${vue.total} sièges. ` +
                             `${c.pour} pour, ${c.contre} contre, ${c.abstention} abstention, ` +
                             `${c.nonVotant + c.absent + vue.absents} n'ont pas pris part au vote. ` +
                             `Le détail par député figure dans la section « Analyse du scrutin ».`
                           } />

                <p className="sr-only">
                  Ce graphique est une représentation visuelle. La position de
                  chaque député, avec accès à sa fiche, est disponible sous
                  forme de liste dans la section « Analyse du scrutin ».
                </p>

                {survol && (
                  <div className="tip" style={{ left: `${survol.x}%`, top: `${survol.y}%` }}>
                    {survol.s.nom ? (
                      <>
                        <b style={{ fontWeight: 500 }}>{survol.s.nom}</b> · {survol.s.groupe} ·{" "}
                        {survol.s.vote === "nonVotant" ? "non votant" : survol.s.vote}
                        <span style={{ color: T.dust }}> · cliquer pour la fiche</span>
                      </>
                    ) : (
                      <>{survol.s.groupe} · absent — <i>non nommé par la source</i></>
                    )}
                  </div>
                )}

                <div className="tally" aria-hidden="true">
                  <div style={{ flexGrow: c.pour, background: T.pour }} />
                  <div style={{ flexGrow: c.contre, background: T.contre }} />
                  <div style={{ flexGrow: c.abstention, background: T.abst }} />
                  <div style={{ flexGrow: c.nonVotant + c.absent + vue.absents, background: T.absent }} />
                </div>
                <div className="tallyleg mono">
                  <span><b>{c.pour}</b> pour</span>
                  <span><b>{c.contre}</b> contre</span>
                  <span><b>{c.abstention}</b> abstention</span>
                  <span><b>{c.nonVotant + c.absent + vue.absents}</b> non votants</span>
                </div>

                {complet && vue.absents > 0 && (
                  <p style={{ color: T.dust, fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
                    {vue.absents} sièges gris représentent les députés absents. L'Assemblée
                    publie leur nombre par groupe, jamais leur identité&nbsp;: ces sièges sont
                    donc exacts en quantité, mais anonymes.
                  </p>
                )}
              </>
            )}
          </section>

          {/* ---- groupes ---- */}
          <aside aria-labelledby="titre-groupes">
            <h2 className="eyebrow" id="titre-groupes" style={{ padding: "0 9px 10px" }}>
              Groupes · gauche → droite
            </h2>
            <div className="grp">
              {vue?.groupes.map((g) => {
                const on = actif === g.id;
                const n = (k) => g.cases[k]?.length ?? 0;
                return (
                  <button key={g.id} data-on={on ? "1" : "0"} aria-pressed={on}
                          onClick={() => setActif(on ? null : g.id)}>
                    <span className="pastille" style={{ background: couleurDe(g.id) }} />
                    <span className="id">{g.id}</span>
                    <span className="mono eff">{g.sieges}</span>
                    <span className="bar">
                      <span style={{ flexGrow: n("pour") || 0.001, background: T.pour }} />
                      <span style={{ flexGrow: n("contre") || 0.001, background: T.contre }} />
                      <span style={{ flexGrow: n("abstention") || 0.001, background: T.abst }} />
                      <span style={{ flexGrow: (n("nonVotant") + n("absent") + g.absents) || 0.001, background: T.absent }} />
                    </span>
                  </button>
                );
              })}
            </div>
            {vue?.inconnus.length > 0 && (
              <p style={{ color: T.brass, fontSize: 11.5, padding: "12px 9px 0", lineHeight: 1.45 }}>
                Groupe(s) sans position définie sur l'axe gauche–droite&nbsp;:{" "}
                {vue.inconnus.join(", ")}. Placé(s) en fin de rang — à renseigner
                dans <code className="mono">src/groupes.js</code>.
              </p>
            )}
          </aside>
        </div>

        {/* ---- analyse nominative ---- */}
        {vue && (
          <section className="nom" id="analyse" tabIndex={-1} aria-labelledby="titre-analyse">
            <h2 className="eyebrow" id="titre-analyse">
              Analyse du scrutin · position de chaque député
            </h2>

            {vue.alerte && (
              <p role="alert" style={{ border: `1px solid ${T.brass}`, color: T.brass,
                   padding: "10px 13px", margin: "14px 0 0", fontSize: 13 }}>
                Décompte non fiable&nbsp;: {vue.alerte}. Les totaux ci-dessous ne sont pas publiables.
              </p>
            )}

            <div className="nomtools">
              <input className="champ" type="search" value={q} placeholder="rechercher un nom…"
                     aria-label="Rechercher un député" onChange={(e) => setQ(e.target.value)} />
              {actif && (
                <button className="bascule" onClick={() => setActif(null)}>
                  tous les groupes ({actif} affiché)
                </button>
              )}
            </div>

            {(actif ? vue.groupes.filter((g) => g.id === actif) : vue.groupes).map((g) => {
              const filtre = (l) =>
                (l ?? []).filter((id) =>
                  !q.trim() || vue.nom(id).toLowerCase().includes(q.trim().toLowerCase()));
              const affiches = COLONNES.reduce((t, [, k]) => t + filtre(g.cases[k]).length, 0);
              if (affiches === 0 && q.trim()) return null;

              return (
                <div className="bloc" key={g.id}>
                  <div className="grptitre">
                    <span className="p" style={{ background: couleurDe(g.id) }} />
                    <h3>{g.id}</h3>
                    <span className="ligne mono">
                      {g.cases.membres} membre{g.cases.membres > 1 ? "s" : ""}
                      {g.cases.absents > 0 && <> · {g.cases.absents} absent{g.cases.absents > 1 ? "s" : ""}</>}
                    </span>
                  </div>
                  <div className="cols">
                    {COLONNES.map(([label, k, couleur]) => {
                      const l = filtre(g.cases[k]);

                      /* Les absents ne sont pas une liste vide : ce sont des
                         députés bien réels que l'Assemblée dénombre sans les
                         nommer. Afficher « aucun » sous un en-tête annonçant
                         « 32 absents » se contredisait. */
                      if (k === "absent") {
                        const n = g.cases.absents ?? 0;
                        return (
                          <div className="col" key={k}>
                            <div className="colh">
                              <span className="k" style={{ color: couleur }}>{label}</span>
                              <span className="n">{n}</span>
                            </div>
                            <p className="vide">
                              {n === 0
                                ? "aucun"
                                : "non nommés par l'Assemblée, qui n'en publie que le nombre"}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="col" key={k}>
                          <div className="colh">
                            <span className="k" style={{ color: couleur }}>{label}</span>
                            <span className="n">{l.length}</span>
                          </div>
                          {l.length === 0 ? (
                            <p className="vide">aucun</p>
                          ) : (
                            <ul className="liste" tabIndex={l.length > 8 ? 0 : -1}
                                aria-label={`${label} — groupe ${g.id}`}>
                              {l.map((id) => (
                                <li key={id}>
                                  <button className="lien-depute" onClick={() => setDepute(id)}>
                                    {vue.nom(id)}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <footer className="foot">
          <span>
            Source&nbsp;: {scrutin.donnees?.licence ?? index.donnees.licence}.<br />
            Données ingérées le {new Date(index.donnees.genere_le).toLocaleString("fr-FR")}.
          </span>
          <span className="mono">
            {vue ? `${vue.total} sièges · ${vue.nommes} nommés` : "—"}
          </span>
        </footer>
      </div>
    </div>
  );
}
