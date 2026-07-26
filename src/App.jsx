import React, { useMemo, useState, useEffect } from "react";
import { T } from "./tokens.js";
import { ordonner, couleurDe } from "./groupes.js";
import { construireSieges } from "./hemicycle.js";

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

const COLONNES = [
  ["Pour", "pour", T.pour],
  ["Contre", "contre", T.contre],
  ["Abstention", "abstention", T.abst],
  ["Non votants", "nonVotant", T.absent],
  ["Absents", "absent", T.absent],
];

const BASE = `${import.meta.env.BASE_URL}donnees`;

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

/* ---------- mise en forme d'un scrutin pour l'hémicycle ---------- */
function useVue(scrutin) {
  return useMemo(() => {
    if (!scrutin?.groupes) return null;

    const brut = Object.entries(scrutin.groupes).map(([id, cases]) => ({
      id,
      cases,
      sieges: CASES.reduce((t, c) => t + (cases[c]?.length ?? 0), 0),
    }));
    const { ordonnes, inconnus } = ordonner(brut);

    const total = ordonnes.reduce((t, g) => t + g.sieges, 0);
    const geometrie = construireSieges(total);

    const sieges = [];
    let curseur = 0;
    for (const g of ordonnes) {
      for (const c of CASES) {
        for (const d of g.cases[c] ?? []) {
          const geo = geometrie[curseur];
          if (!geo) break;
          sieges.push({
            i: curseur, ...geo,
            groupe: g.id, couleur: couleurDe(g.id), vote: c, nom: d.nom,
          });
          curseur++;
        }
      }
    }

    /* Garde : chaque député dans exactement une case, clé sur l'identifiant.
       Le contrôle est refait ici parce que le fichier a pu être tronqué en
       transit ; l'ingestion ne protège que ce qu'elle a écrit. */
    const vu = new Map();
    for (const g of ordonnes) {
      for (const c of CASES) {
        for (const d of g.cases[c] ?? []) vu.set(d.id, (vu.get(d.id) ?? 0) + 1);
      }
    }
    const enDouble = [...vu.values()].filter((n) => n > 1).length;

    const alerte =
      enDouble > 0 ? `${enDouble} député(s) présent(s) dans plusieurs cases`
      : vu.size !== total ? `${Math.abs(total - vu.size)} député(s) mal comptabilisé(s)`
      : scrutin.anomalies || null;

    return { groupes: ordonnes, sieges, total, alerte, inconnus };
  }, [scrutin]);
}

/* =========================== hémicycle =========================== */
function Hemicycle({ sieges, total, mode, actif, onSurvol, onChoisirGroupe }) {
  const W = 1000;
  const cx = W / 2;
  const R = 448;
  const cy = R + 34;
  const H = cy + 22;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hemi" role="img"
         aria-label={`Répartition des ${total} sièges par groupe et par vote`}>
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

        let fill = base, stroke = "none", sw = 0, op = 1;
        if (mode === "groupe") {
          if (s.vote === "contre") { fill = "transparent"; stroke = base; sw = 1.9; }
          else if (s.vote === "abstention") { op = 0.34; }
          else if (horsVote) { fill = T.absent; op = 0.75; }
        }

        return (
          <circle key={s.i} cx={x} cy={y} r={horsVote ? 4.2 : 5.4}
                  fill={fill} stroke={stroke} strokeWidth={sw}
                  className="siege"
                  style={{ opacity: estompe ? 0.12 : op, transitionDelay: `${(s.i / total) * 260}ms` }}
                  onMouseEnter={() => onSurvol({ s, x: (x / W) * 100, y: (y / H) * 100 })}
                  onMouseLeave={() => onSurvol(null)}
                  onClick={() => onChoisirGroupe(s.groupe)} />
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
  const [numero, setNumero] = useState(null);
  const [mode, setMode] = useState("groupe");
  const [actif, setActif] = useState(null);
  const [survol, setSurvol] = useState(null);
  const [q, setQ] = useState("");

  const liste = index.donnees?.scrutins ?? [];

  useEffect(() => {
    if (numero === null && liste.length) setNumero(liste[0].numero);
  }, [liste, numero]);

  const scrutin = useJson(numero === null ? null : `${BASE}/scrutin-${numero}.json`);
  const vue = useVue(scrutin.donnees);

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
      <div className="wrap">
        <header className="hdr">
          <div>
            <div className="eyebrow">
              Assemblée nationale · {index.donnees.legislature}<sup>e</sup> législature ·{" "}
              Scrutin public n° {meta.numero}
            </div>
            <h1 className="disp titre">{meta.titre}</h1>
            {meta.objet && <div className="objet">{meta.objet}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            {meta.sort && <div className="verdict">{meta.sort}</div>}
            <div className="mono" style={{ fontSize: 11, color: T.dust, marginTop: 10 }}>
              {meta.date}
              {exprimes > 0 && <> · majorité absolue&nbsp;: {Math.floor(exprimes / 2) + 1}</>}
            </div>
          </div>
        </header>

        <div className="grille">
          {/* ---- rail des scrutins ---- */}
          <nav className="rail" aria-label="Scrutins récents">
            <div className="eyebrow" style={{ padding: "0 12px 10px" }}>
              Scrutins · {liste.length}
            </div>
            {liste.slice(0, 60).map((s) => (
              <button key={s.numero} data-on={s.numero === numero ? "1" : "0"}
                      onClick={() => { setNumero(s.numero); setActif(null); }}>
                <div className="mono n">n° {s.numero} · {s.date}</div>
                <div className="t">{s.titre}</div>
              </button>
            ))}
          </nav>

          {/* ---- hémicycle ---- */}
          <section className="scene" style={{ position: "relative" }}>
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
                    <span className="lg"><span className="sw" style={{ background: T.contre }} />Contre</span>
                    <span className="lg"><span className="sw" style={{ background: T.abst }} />Abstention</span>
                    <span className="lg"><span className="sw" style={{ background: T.absent }} />Non votant</span>
                  </>
                )}
              </div>
              <div className="seg" role="group" aria-label="Coloration des sièges">
                <button data-on={mode === "groupe" ? "1" : "0"} onClick={() => setMode("groupe")}>par groupe</button>
                <button data-on={mode === "vote" ? "1" : "0"} onClick={() => setMode("vote")}>par vote</button>
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
                           onSurvol={setSurvol} onChoisirGroupe={setActif} />

                {survol && (
                  <div className="tip" style={{ left: `${survol.x}%`, top: `${survol.y}%` }}>
                    <b style={{ fontWeight: 500 }}>{survol.s.nom}</b> · {survol.s.groupe} ·{" "}
                    {survol.s.vote === "nonVotant" ? "non votant" : survol.s.vote}
                  </div>
                )}

                <div className="tally" aria-hidden="true">
                  <div style={{ flexGrow: c.pour, background: T.pour }} />
                  <div style={{ flexGrow: c.contre, background: T.contre }} />
                  <div style={{ flexGrow: c.abstention, background: T.abst }} />
                  <div style={{ flexGrow: c.nonVotant + c.absent, background: T.absent }} />
                </div>
                <div className="tallyleg mono">
                  <span><b>{c.pour}</b> pour</span>
                  <span><b>{c.contre}</b> contre</span>
                  <span><b>{c.abstention}</b> abstention</span>
                  <span><b>{c.nonVotant + c.absent}</b> non votants</span>
                </div>
              </>
            )}
          </section>

          {/* ---- groupes ---- */}
          <aside>
            <div className="eyebrow" style={{ padding: "0 9px 10px" }}>Groupes · gauche → droite</div>
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
                      <span style={{ flexGrow: (n("nonVotant") + n("absent")) || 0.001, background: T.absent }} />
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
          <section className="nom">
            <div className="eyebrow">Analyse du scrutin · position de chaque député</div>

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
                (l ?? []).filter((d) =>
                  !q.trim() || d.nom.toLowerCase().includes(q.trim().toLowerCase()));
              const affiches = COLONNES.reduce((t, [, k]) => t + filtre(g.cases[k]).length, 0);
              if (affiches === 0 && q.trim()) return null;

              return (
                <div className="bloc" key={g.id}>
                  <div className="grptitre">
                    <span className="p" style={{ background: couleurDe(g.id) }} />
                    <h3>{g.id}</h3>
                    <span className="ligne mono">{g.sieges} siège{g.sieges > 1 ? "s" : ""}</span>
                  </div>
                  <div className="cols">
                    {COLONNES.map(([label, k, couleur]) => {
                      const l = filtre(g.cases[k]);
                      return (
                        <div className="col" key={k}>
                          <div className="colh">
                            <span className="k" style={{ color: couleur }}>{label}</span>
                            <span className="n">{l.length}</span>
                          </div>
                          {l.length === 0 ? (
                            <p className="vide">aucun</p>
                          ) : (
                            <ul className="liste">
                              {l.map((d) => <li key={d.id}><span>{d.nom}</span></li>)}
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
          <span className="mono">{vue?.total ?? "—"} sièges · 11 rangs</span>
        </footer>
      </div>
    </div>
  );
}
