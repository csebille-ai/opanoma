// routes/summarize.js  (ou summarize.js à la racine, comme tu préfères)
import { Router } from "express";

const router = Router();

// 3 mots-clés par arcane majeur (0–21)
const KW = {
  0:["liberté","spontanéité","aventure"],
  1:["début","potentiel","action"],
  2:["intuition","secret","patience"],
  3:["créativité","expression","fertilité"],
  4:["stabilité","structure","autorité"],
  5:["guidance","tradition","enseignement"],
  6:["choix","union","valeurs"],
  7:["volonté","victoire","déplacement"],
  8:["équilibre","vérité","responsabilité"],
  9:["recherche","introspection","prudence"],
  10:["changement","cycle","opportunité"],
  11:["courage","maîtrise","compassion"],
  12:["lâcher-prise","perspective","pause"],
  13:["transformation","fin","renaissance"],
  14:["harmonie","modération","alchimie"],
  15:["attachement","tentation","énergie brute"],
  16:["révélation","rupture","libération"],
  17:["espoir","inspiration","guérison"],
  18:["émotions","illusion","subconscient"],
  19:["succès","vitalité","clarté"],
  20:["appel","éveil","bilan"],
  21:["accomplissement","intégration","ouverture"],
};

// petite aide pour produire une mini-interprétation “lisible”
function interpretCard(card) {
  const num = Number(card?.number);
  const name = String(card?.name || `Arcane ${isFinite(num) ? num : "?"}`);
  const pos  = String(card?.position || "Carte");
  const reversed = !!card?.reversed;

  const words = KW[num] || [];
  const kw    = words.join(" • ");

  const angle = reversed
    ? "Énergie bloquée, à reconsidérer."
    : "Énergie disponible, à activer.";

  return `${pos} — ${name}${reversed ? " (renversée)" : ""}\n` +
         `→ Mots-clés : ${kw || "—"}\n` +
         `→ Lecture : ${angle}`;
}

router.post("/", (req, res) => {
  try {
    const body = req.body || {};
    const question = String(body.question || "").trim();
    const cards = Array.isArray(body.cards) ? body.cards : [];

    if (!cards.length) {
      return res.status(400).json({ ok:false, error:"'cards' est requis (liste non vide)" });
    }

    // entête humainement lisible
    const header =
      (question ? `Question : ${question}\n` : "") +
      `Tirage : ${cards.map(c => c.position || "Carte").join(" · ")}\n`;

    // interprétation carte par carte
    const lines = cards.map(interpretCard).join("\n\n");

    // mini synthèse basée sur les mots-clés
    const bag = [];
    for (const c of cards) {
      const n = Number(c?.number);
      if (KW[n]) bag.push(...KW[n]);
    }
    const uniq = [...new Set(bag)];
    const synth = uniq.length
      ? `\n\nSynthèse : ${uniq.slice(0, 8).join(" • ")}`
      : "";

    const text = `${header}\n${lines}${synth}\n\n(Jeu — à prendre comme un divertissement 😉)`;

    return res.json({ ok:true, text });
  } catch (err) {
    console.error("summarize error:", err);
    return res.status(500).json({ ok:false, error:"Erreur interne" });
  }
});

export default router;
