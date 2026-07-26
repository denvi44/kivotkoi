/**
 * partition.mjs — invariant central de l'application.
 *
 * Un député appartient à EXACTEMENT une case : pour, contre, abstention,
 * nonVotant, absent. Ni zéro, ni deux.
 *
 * La clé est l'identifiant stable (slug), jamais le nom :
 *  - des homonymes siègent réellement à l'Assemblée ;
 *  - un nom change (nom d'usage, accents, traits d'union, casse) ;
 *  - un nom se sérialise différemment selon la source.
 *
 * Cette fonction ne lève jamais d'exception sur des données douteuses.
 * Elle renvoie une partition exploitable + un rapport d'anomalies, pour que
 * l'interface puisse afficher « données incomplètes » plutôt qu'un écran blanc
 * ou, pire, un décompte faux d'apparence normale.
 *
 * Licence des données visées : ODbL (NosDéputés.fr / Regards Citoyens,
 * à partir de l'Assemblée nationale et du Journal Officiel).
 */

export const CASES = ["pour", "contre", "abstention", "nonVotant", "absent"];

/* Libellés rencontrés dans les sources officielles et dérivées.
   « non-votant » n'est pas « absent » : le premier est présent en séance mais
   ne prend pas part au vote, le second n'est pas là. Les fondre fabrique un
   faux taux d'absentéisme. */
const SYNONYMES = new Map(Object.entries({
  pour: "pour",
  contre: "contre",
  abstention: "abstention",
  abstentions: "abstention",
  nonvotant: "nonVotant",
  "nonvotantvolontaire": "nonVotant",
  nonvotants: "nonVotant",
  absent: "absent",
  absents: "absent",
}));

const canon = (v) =>
  SYNONYMES.get(
    String(v ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents
      .toLowerCase()
      .replace(/[\s_'’-]/g, "")                          // espaces, tirets, apostrophes
  ) ?? null;

/**
 * @param {Array<{id:string, nom?:string, groupe?:string, position:string}>} votes
 * @param {Array<{id:string, nom?:string, groupe?:string}>} [effectif]
 *        Composition de référence à la date du scrutin. Permet de distinguer
 *        « absent » de « aucune position enregistrée ».
 * @returns {{partition:Object, index:Map, anomalies:Array, ok:boolean, total:number}}
 */
export function partitionner(votes, effectif = null) {
  const anomalies = [];
  const signale = (type, detail) => anomalies.push({ type, ...detail });

  if (!Array.isArray(votes)) {
    return {
      partition: Object.fromEntries(CASES.map((c) => [c, []])),
      index: new Map(), total: 0, ok: false,
      anomalies: [{ type: "source_invalide", recu: typeof votes }],
    };
  }

  const index = new Map(); // id -> entrée retenue

  for (const [rang, v] of votes.entries()) {
    const id = typeof v?.id === "string" ? v.id.trim() : "";
    if (!id) { signale("id_manquant", { rang, nom: v?.nom ?? null }); continue; }

    const c = canon(v.position);
    if (!c) { signale("position_inconnue", { id, valeur: v?.position ?? null }); continue; }

    const dejaVu = index.get(id);
    if (!dejaVu) {
      index.set(id, { id, nom: v.nom ?? id, groupe: v.groupe ?? null, position: c });
      continue;
    }
    // Doublon : on ne tranche jamais en silence.
    if (dejaVu.position === c) {
      signale("doublon_identique", { id, position: c });
    } else {
      signale("doublon_contradictoire", { id, positions: [dejaVu.position, c] });
      index.delete(id); // mis en quarantaine : compté nulle part, signalé partout
    }
  }

  // Confrontation à l'effectif de référence
  if (Array.isArray(effectif)) {
    const attendus = new Set(effectif.map((d) => d.id));
    for (const d of effectif) {
      if (!index.has(d.id) && !anomalies.some((a) => a.id === d.id)) {
        signale("sans_position", { id: d.id, nom: d.nom ?? d.id });
      }
    }
    for (const id of index.keys()) {
      if (!attendus.has(id)) signale("hors_effectif", { id });
    }
  }

  const partition = Object.fromEntries(CASES.map((c) => [c, []]));
  for (const e of index.values()) partition[e.position].push(e);
  for (const c of CASES) {
    partition[c].sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr"));
  }

  // Auto-contrôle : la somme des cases doit égaler l'index, sans recouvrement.
  const place = new Set();
  let doubleCasage = 0;
  for (const c of CASES) for (const e of partition[c]) {
    if (place.has(e.id)) doubleCasage++;
    place.add(e.id);
  }
  if (doubleCasage) signale("invariant_rompu", { doubleCasage });
  if (place.size !== index.size) signale("invariant_rompu", { places: place.size, attendu: index.size });

  return {
    partition,
    index,
    total: index.size,
    anomalies,
    ok: anomalies.length === 0,
  };
}

/** Compteurs par case, à afficher uniquement si `ok` ou avec la mention d'anomalie. */
export const compter = (partition) =>
  Object.fromEntries(CASES.map((c) => [c, partition[c].length]));

/** Regroupe une partition par groupe politique, en préservant l'invariant. */
export function parGroupe(partition) {
  const out = {};
  for (const c of CASES) {
    for (const e of partition[c]) {
      const g = e.groupe ?? "NI";
      (out[g] ??= Object.fromEntries(CASES.map((k) => [k, []])))[c].push(e);
    }
  }
  return out;
}

/** Message court destiné à l'interface. */
export function resumerAnomalies(anomalies) {
  if (!anomalies.length) return null;
  const n = anomalies.reduce((m, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {});
  return Object.entries(n).map(([t, c]) => `${c} ${t.replace(/_/g, " ")}`).join(" · ");
}
