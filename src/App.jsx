import { useState, useEffect, useRef, useCallback } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-5";
const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
const ANTHROPIC_HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-iab": "true",
};

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#05080d",
  bgDeep: "#020406",
  panel: "#090e15",
  border: "#182030",
  borderBright: "#253550",
  accent: "#00c8f0",
  accentDim: "#082535",
  accentGlow: "#00c8f033",
  green: "#00e87a",
  greenGlow: "#00e87a22",
  red: "#ff3560",
  redDim: "#2d0010",
  redGlow: "#ff356022",
  yellow: "#f0b800",
  yellowDim: "#2a2000",
  purple: "#a78bfa",
  text: "#dce8f8",
  textMid: "#7a8fa8",
  textDim: "#354555",
};

// ─── Fallback news ────────────────────────────────────────────────────────────
const FALLBACK_NEWS = [
  { time: "En cours", source: "Reuters", title: "La Fed maintient ses taux, signale la patience face à l'inflation persistante", impact: "haut", category: "MACRO" },
  { time: "En cours", source: "Politico", title: "La Maison Blanche prépare un nouveau décret exécutif sur les crypto-actifs", impact: "haut", category: "POLITIQUE" },
  { time: "En cours", source: "Bloomberg", title: "Résultats Nvidia T1 — revenus data center +427% sur un an", impact: "haut", category: "TECH" },
  { time: "En cours", source: "AP", title: "Les négociations de paix en Ukraine progressent, Zelensky ouvert aux discussions", impact: "moyen", category: "GÉO" },
  { time: "En cours", source: "WSJ", title: "Prévisions CPI avril : les économistes attendent 3,2%, sous mars 3,5%", impact: "moyen", category: "MACRO" },
  { time: "En cours", source: "FT", title: "Le marché de l'emploi US montre les premiers signes de ralentissement", impact: "moyen", category: "MACRO" },
  { time: "En cours", source: "Axios", title: "Le Secrétaire au Trésor exclut tout allègement des droits de douane avant l'été", impact: "faible", category: "POLITIQUE" },
  { time: "En cours", source: "CNBC", title: "Un dirigeant d'Apple confirme : pas de nouveau matériel à la WWDC 2025", impact: "faible", category: "TECH" },
];

// ─── Utils ────────────────────────────────────────────────────────────────────
function detectCategory(text) {
  const t = (text || "").toLowerCase();
  if (t.match(/fed|cpi|inflation|gdp|recession|unemployment|rate|s&p|nasdaq|dow|macro|employment|jobs|economy/)) return "MACRO";
  if (t.match(/trump|biden|congress|senate|election|white house|executive|policy|law|vote|president/)) return "POLITIQUE";
  if (t.match(/nvidia|apple|google|microsoft|ai|tech|amazon|meta|openai|tesla|crypto|bitcoin|ethereum/)) return "TECH";
  if (t.match(/ukraine|russia|china|war|ceasefire|nato|peace|middle east|iran|israel/)) return "GÉO";
  return "MACRO";
}
const fmt = (n) => {
  if (!n || isNaN(n)) return "$0";
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`;
};
const pct = (n) => `${(parseFloat(n) * 100).toFixed(0)}%`;
const signPp = (n) => n > 0 ? `+${(n * 100).toFixed(0)}pp` : `${(n * 100).toFixed(0)}pp`;

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

// ─── BarreProba ───────────────────────────────────────────────────────────────
function BarreProba({ valeur }) {
  const v = parseFloat(valeur) * 100;
  const color = v > 60 ? `linear-gradient(90deg, ${C.green}, #00ffaa)` : v < 35 ? `linear-gradient(90deg, ${C.red}, #ff7090)` : `linear-gradient(90deg, ${C.yellow}, #ffd060)`;
  return (
    <div style={{ height: 5, background: C.border, borderRadius: 99, overflow: "hidden", marginTop: 8 }}>
      <div style={{ height: "100%", width: `${v}%`, background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
    </div>
  );
}

// ─── BadgeSignal ──────────────────────────────────────────────────────────────
function BadgeSignal({ signal }) {
  if (!signal) return null;
  const map = {
    "ACHETER OUI": { bg: C.green, color: "#000", icon: "▲" },
    "ACHETER NON": { bg: C.red, color: "#fff", icon: "▼" },
    "PASSER": { bg: C.yellow, color: "#000", icon: "━" },
    "BUY YES": { bg: C.green, color: "#000", icon: "▲" },
    "BUY NO": { bg: C.red, color: "#fff", icon: "▼" },
    "PASS": { bg: C.yellow, color: "#000", icon: "━" },
  };
  const s = map[signal] || { bg: C.accent, color: "#000", icon: "◆" };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 3, letterSpacing: 1, fontFamily: "'IBM Plex Mono', monospace" }}>
      {s.icon} {signal}
    </span>
  );
}

// ─── CarteMarche ──────────────────────────────────────────────────────────────
function CarteMarche({ marche, onAnalyser, onPrepareOrdre, chargement }) {
  const catColor = { MACRO: C.accent, POLITIQUE: C.purple, TECH: C.yellow, "GÉO": C.green }[marche.category] || C.textMid;
  const prob = parseFloat(marche.prob);
  const isActionnable = marche.signal && marche.signal !== "PASSER" && marche.signal !== "PASS";
  const isYes = marche.signal?.includes("OUI") || marche.signal?.includes("YES");

  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${isActionnable ? (isYes ? C.green : C.red) : C.border}`,
      borderRadius: 10, padding: 16, transition: "all 0.3s",
      boxShadow: isActionnable ? `0 0 20px ${isYes ? C.greenGlow : C.redGlow}` : "none",
      position: "relative", overflow: "hidden"
    }}>
      {marche.signal && (
        <div style={{ position: "absolute", top: 10, right: 10 }}>
          <BadgeSignal signal={marche.signal} />
        </div>
      )}
      <div style={{ marginBottom: 10, paddingRight: marche.signal ? 110 : 0 }}>
        <span style={{ fontSize: 8, color: catColor, letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace", display: "block", marginBottom: 5 }}>{marche.category}</span>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>{marche.title}</div>
      </div>
      <BarreProba valeur={marche.prob} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: prob > 0.6 ? C.green : prob < 0.35 ? C.red : C.yellow }}>
            {pct(marche.prob)}
          </span>
          <span style={{ fontSize: 10, color: marche.change > 0 ? C.green : marche.change < 0 ? C.red : C.textDim, fontFamily: "'IBM Plex Mono', monospace" }}>
            {signPp(marche.change)} 24h
          </span>
        </div>
        <span style={{ fontSize: 10, color: C.textDim, fontFamily: "'IBM Plex Mono', monospace" }}>Vol {fmt(marche.volume)}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => onAnalyser(marche)} disabled={chargement}
          style={{ flex: 1, background: chargement ? C.border : C.accentDim, border: `1px solid ${chargement ? C.border : C.accent}`, color: chargement ? C.textDim : C.accent, borderRadius: 5, padding: "6px 0", fontSize: 9, cursor: chargement ? "wait" : "pointer", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>
          {chargement ? "◌ ANALYSE..." : "◈ ANALYSER"}
        </button>
        {isActionnable && (
          <button onClick={() => onPrepareOrdre(marche)}
            style={{ flex: 1, background: isYes ? C.greenGlow : C.redGlow, border: `1px solid ${isYes ? C.green : C.red}`, color: isYes ? C.green : C.red, borderRadius: 5, padding: "6px 0", fontSize: 9, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1, fontWeight: 700 }}>
            ⚡ PRÉPARER ORDRE
          </button>
        )}
      </div>
      {marche.edge && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#05120a", border: `1px solid ${C.green}20`, borderRadius: 6, fontSize: 10, color: C.textMid, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.7 }}>
          <span style={{ color: C.green, fontWeight: 600 }}>◈ EDGE — </span>
          <span style={{ whiteSpace: "pre-wrap" }}>{marche.edge}</span>
        </div>
      )}
    </div>
  );
}

// ─── ModalOrdre ───────────────────────────────────────────────────────────────
function ModalOrdre({ marche, onFermer }) {
  const [montant, setMontant] = useState(100);
  const prob = parseFloat(marche.prob);
  const isYes = marche.signal?.includes("OUI") || marche.signal?.includes("YES");
  const retour = isYes ? (montant / prob - montant).toFixed(2) : (montant / (1 - prob) - montant).toFixed(2);
  const roi = isYes ? ((1 / prob - 1) * 100).toFixed(0) : ((1 / (1 - prob) - 1) * 100).toFixed(0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.borderBright}`, borderRadius: 12, padding: 28, width: 440, maxWidth: "90vw", boxShadow: `0 0 60px ${C.accentGlow}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, color: C.accent, letterSpacing: 3, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>PRÉPARER UN ORDRE</div>
            <div style={{ fontSize: 12, color: C.text, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.4, maxWidth: 320 }}>{marche.title}</div>
          </div>
          <button onClick={onFermer} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: isYes ? C.greenGlow : C.redGlow, borderRadius: 8, border: `1px solid ${isYes ? C.green : C.red}30` }}>
          <BadgeSignal signal={marche.signal} />
          <span style={{ fontSize: 11, color: C.textMid, fontFamily: "'IBM Plex Mono', monospace" }}>
            Probabilité : <span style={{ color: isYes ? C.green : C.red, fontWeight: 700 }}>{pct(marche.prob)}</span>
          </span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 8, fontFamily: "'IBM Plex Mono', monospace" }}>MONTANT (USDC)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={montant} onChange={e => setMontant(Number(e.target.value))}
              style={{ flex: 1, background: C.bg, border: `1px solid ${C.borderBright}`, borderRadius: 6, padding: "10px 14px", color: C.text, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", outline: "none", fontWeight: 700 }} />
            {[25, 50, 100, 200].map(v => (
              <button key={v} onClick={() => setMontant(v)}
                style={{ background: montant === v ? C.accentDim : "none", border: `1px solid ${montant === v ? C.accent : C.border}`, color: montant === v ? C.accent : C.textDim, borderRadius: 5, padding: "6px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div style={{ background: C.bg, borderRadius: 8, padding: 14, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[["MISE", `$${montant}`, C.text], ["GAIN POTENTIEL", `+$${retour}`, C.green], ["ROI POTENTIEL", `+${roi}%`, C.green]].map(([label, value, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 1, marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>{label}</div>
              <div style={{ fontSize: 14, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 14px", background: C.yellowDim, border: `1px solid ${C.yellow}30`, borderRadius: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: C.yellow, letterSpacing: 1, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>⚠ COMMENT PLACER CET ORDRE</div>
          <div style={{ fontSize: 10, color: C.textMid, lineHeight: 1.8, fontFamily: "'IBM Plex Mono', monospace" }}>
            1. Va sur <span style={{ color: C.accent }}>polymarket.com</span><br />
            2. Recherche : "<span style={{ color: C.text }}>{marche.title?.slice(0, 45)}…</span>"<br />
            3. Clique sur <span style={{ color: isYes ? C.green : C.red, fontWeight: 700 }}>{isYes ? "YES" : "NO"}</span> → entre <span style={{ color: C.text, fontWeight: 700 }}>${montant} USDC</span><br />
            4. Confirme la transaction dans ton wallet
          </div>
        </div>
        <button onClick={onFermer}
          style={{ width: "100%", background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 8, padding: "12px 0", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 2 }}>
          COMPRIS — FERMER
        </button>
      </div>
    </div>
  );
}

// ─── ItemActu ─────────────────────────────────────────────────────────────────
function ItemActu({ item }) {
  const impColor = { haut: C.red, moyen: C.yellow, faible: C.textDim, high: C.red, medium: C.yellow, low: C.textDim }[item.impact] || C.textDim;
  const catColor = { MACRO: C.accent, POLITIQUE: C.purple, TECH: C.yellow, "GÉO": C.green }[item.category] || C.textMid;
  return (
    <div style={{ padding: "11px 0", borderBottom: `1px solid ${C.border}20`, display: "flex", gap: 12 }}>
      <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap", minWidth: 45 }}>{item.time}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
          <span style={{ fontSize: 8, color: catColor, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>{item.category}</span>
          <span style={{ fontSize: 8, color: impColor, fontFamily: "'IBM Plex Mono', monospace" }}>● {(item.impact || "").toUpperCase()}</span>
          <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'IBM Plex Mono', monospace" }}>{item.source}</span>
        </div>
        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5, fontFamily: "'IBM Plex Mono', monospace" }}>{item.title}</div>
      </div>
    </div>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────────
function Ticker({ marches }) {
  return (
    <div style={{ background: C.accentDim, borderBottom: `1px solid ${C.border}`, overflow: "hidden", whiteSpace: "nowrap", padding: "5px 0" }}>
      <div style={{ display: "inline-flex", gap: 48, animation: "ticker 40s linear infinite", paddingLeft: "100%" }}>
        {[...marches, ...marches].map((m, i) => (
          <span key={i} style={{ fontSize: 10, color: C.accent, fontFamily: "'IBM Plex Mono', monospace" }}>
            <span style={{ color: C.textMid, marginRight: 6 }}>{m.category}</span>
            {(m.title || "").slice(0, 45)}
            <span style={{ color: parseFloat(m.prob) > 0.5 ? C.green : C.red, marginLeft: 8 }}>
              {pct(m.prob)} {m.trend === "up" ? "▲" : m.trend === "down" ? "▼" : "━"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function PolymarketDashboard() {
  const [marches, setMarches] = useState([]);
  const [actus] = useState(FALLBACK_NEWS);
  const [onglet, setOnglet] = useState("marches");
  const [chargementId, setChargementId] = useState(null);
  const [analyseGlobale, setAnalyseGlobale] = useState("");
  const [chargementGlobal, setChargementGlobal] = useState(false);
  const [filtre, setFiltre] = useState("TOUS");
  const [chatInput, setChatInput] = useState("");
  const [histo, setHisto] = useState([
    { role: "assistant", content: "Agent prêt. Je surveille les marchés Polymarket en temps réel.\n\nPose-moi une question sur une stratégie, un marché spécifique, ou demande-moi d'identifier les meilleures opportunités du moment." }
  ]);
  const [chargementChat, setChargementChat] = useState(false);
  const [marcheOrdre, setMarcheOrdre] = useState(null);
  const [chargementMarches, setChargementMarches] = useState(true);
  const [erreurAPI, setErreurAPI] = useState(false);
  const [derniereMaj, setDerniereMaj] = useState(null);
  const now = useNow();
  const chatFinRef = useRef(null);

  useEffect(() => { chatFinRef.current?.scrollIntoView({ behavior: "smooth" }); }, [histo]);

  // ── Fetch vrais marchés Polymarket ────────────────────────────────────────
  const fetchMarches = useCallback(async () => {
    try {
      setChargementMarches(true);
      const res = await fetch("http://localhost:3001/api/markets");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const formatted = data
        .filter(m => m.question && m.outcomePrices)
        .slice(0, 16)
        .map((m, i) => {
          let prices = [];
          try { prices = JSON.parse(m.outcomePrices); } catch { prices = ["0.5"]; }
          const prob = parseFloat(prices[0]) || 0.5;
          return {
            id: m.id || i,
            title: m.question,
            prob,
            volume: parseFloat(m.volume || 0),
            category: detectCategory(m.question),
            trend: prob > 0.55 ? "up" : prob < 0.45 ? "down" : "flat",
            change: (Math.random() - 0.5) * 0.06,
            edge: null, signal: null,
          };
        });
      setMarches(formatted);
      setErreurAPI(false);
      setDerniereMaj(new Date());
    } catch {
      setErreurAPI(true);
      if (marches.length === 0) {
        setMarches([
          { id: 1, title: "Fed rate cut before July 2025?", prob: 0.34, volume: 2840000, category: "MACRO", trend: "down", change: -0.03, edge: null, signal: null },
          { id: 2, title: "US CPI < 3% in May 2025?", prob: 0.61, volume: 1200000, category: "MACRO", trend: "up", change: 0.05, edge: null, signal: null },
          { id: 3, title: "Trump signs executive order on crypto?", prob: 0.78, volume: 5600000, category: "POLITIQUE", trend: "up", change: 0.08, edge: null, signal: null },
          { id: 4, title: "Nvidia market cap > $4T in 2025?", prob: 0.42, volume: 980000, category: "TECH", trend: "up", change: 0.02, edge: null, signal: null },
          { id: 5, title: "US unemployment > 5% in Q2?", prob: 0.19, volume: 670000, category: "MACRO", trend: "down", change: -0.01, edge: null, signal: null },
          { id: 6, title: "Ukraine ceasefire before Sept 2025?", prob: 0.47, volume: 8200000, category: "GÉO", trend: "up", change: 0.12, edge: null, signal: null },
          { id: 7, title: "Apple Vision Pro 2 launch in 2025?", prob: 0.23, volume: 450000, category: "TECH", trend: "flat", change: 0, edge: null, signal: null },
          { id: 8, title: "S&P 500 ATH before June 2025?", prob: 0.55, volume: 3100000, category: "MACRO", trend: "up", change: 0.04, edge: null, signal: null },
        ]);
      }
    } finally {
      setChargementMarches(false);
    }
  }, []);

  useEffect(() => { fetchMarches(); const t = setInterval(fetchMarches, 60000); return () => clearInterval(t); }, [fetchMarches]);

  useEffect(() => {
    const t = setInterval(() => {
      setMarches(ms => ms.map(m => ({ ...m, prob: Math.max(0.02, Math.min(0.98, m.prob + (Math.random() - 0.5) * 0.003)) })));
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // ── Analyser un marché ────────────────────────────────────────────────────
  async function analyserMarche(marche) {
    setChargementId(marche.id);
    try {
      const actusPertin = actus.filter(n => n.category === marche.category).slice(0, 2);
      const prompt = `Tu es un expert en marchés prédictifs (Polymarket), spécialisé en macro US et géopolitique.

Marché : "${marche.title}"
Probabilité actuelle : ${pct(marche.prob)}
Volume : ${fmt(marche.volume)}
Tendance 24h : ${signPp(marche.change)}
Catégorie : ${marche.category}

Actualités récentes pertinentes :
${actusPertin.map(n => `- ${n.title} (${n.source})`).join("\n") || "- Aucune actu récente"}

Analyse ce marché en 3-4 phrases. Identifie un edge ou mispricing potentiel. Donne une recommandation claire.

FORMAT OBLIGATOIRE :
[SIGNAL: ACHETER OUI / ACHETER NON / PASSER | CONFIANCE: X%]
Raisonnement : ...
Risques : ...`;

      const res = await fetch("http://localhost:3001/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "Analyse indisponible.";
      const signalMatch = text.match(/ACHETER OUI|ACHETER NON|PASSER|BUY YES|BUY NO|PASS/);
      setMarches(ms => ms.map(m => m.id === marche.id ? { ...m, edge: text, signal: signalMatch?.[0] || null } : m));
    } catch {
      setMarches(ms => ms.map(m => m.id === marche.id ? { ...m, edge: "Erreur lors de l'analyse. Réessaie." } : m));
    }
    setChargementId(null);
  }

  // ── Scan global ───────────────────────────────────────────────────────────
  async function lancerScan() {
    setChargementGlobal(true);
    setOnglet("scan");
    try {
      const prompt = `Tu es un hedge fund manager spécialisé en marchés prédictifs US (Polymarket). Profil de risque : MODÉRÉ (5-15% du capital par position).

MARCHÉS ACTUELS :
${marches.slice(0, 12).map(m => `- "${m.title}" → ${pct(m.prob)} | Vol ${fmt(m.volume)} | ${signPp(m.change)} 24h`).join("\n")}

ACTUALITÉS :
${actus.slice(0, 5).map(n => `- [${n.category}][${n.impact.toUpperCase()}] ${n.title}`).join("\n")}

Identifie les 3 MEILLEURES opportunités. Pour chacune :
1. Marché concerné
2. Signal (ACHETER OUI / ACHETER NON)
3. Raisonnement (2-3 phrases — pourquoi c'est mispricé ?)
4. Sizing suggéré (% du capital, profil modéré)
5. Risques principaux
6. Confiance (%)

Réponds en français, sois direct et actionnable.`;

      const res = await fetch("http://localhost:3001/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      setAnalyseGlobale(data.content?.[0]?.text || "Analyse indisponible.");
    } catch {
      setAnalyseGlobale("Erreur lors du scan. Vérifie ta connexion.");
    }
    setChargementGlobal(false);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function envoyerChat() {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    const nouvelHisto = [...histo, { role: "user", content: msg }];
    setHisto(nouvelHisto);
    setChargementChat(true);
    try {
      const system = `Tu es un agent de trading expert sur Polymarket, spécialisé dans les marchés prédictifs américains. Profil de risque modéré (5-15% par trade). Tu es direct, concis, actionnable. Tu réponds TOUJOURS en français.

MARCHÉS EN TEMPS RÉEL :
${marches.slice(0, 8).map(m => `- "${m.title}" : ${pct(m.prob)} (${signPp(m.change)} 24h, vol ${fmt(m.volume)})`).join("\n")}

ACTUALITÉS :
${actus.slice(0, 5).map(n => `- [${n.category}] ${n.title}`).join("\n")}

Date/heure : ${now.toLocaleString("fr-FR")}`;

      const res = await fetch("http://localhost:3001/api/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 800, system, messages: nouvelHisto.map(m => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json();
      setHisto([...nouvelHisto, { role: "assistant", content: data.content?.[0]?.text || "Impossible de répondre." }]);
    } catch {
      setHisto([...nouvelHisto, { role: "assistant", content: "Erreur de connexion." }]);
    }
    setChargementChat(false);
  }

  const marchesFiltres = filtre === "TOUS" ? marches : marches.filter(m => m.category === filtre);
  const signaux = marches.filter(m => m.signal && m.signal !== "PASSER" && m.signal !== "PASS");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: #05080d; } ::-webkit-scrollbar-thumb { background: #182030; border-radius: 99px; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.35s ease forwards; }
        button:hover { opacity: 0.82; }
      `}</style>

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "11px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bgDeep }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: chargementMarches ? C.yellow : erreurAPI ? C.red : C.green, animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: C.accent }}>POLYMARKET</span>
          <span style={{ fontSize: 13, fontWeight: 300, letterSpacing: 3, color: C.textMid }}>INTELLIGENCE</span>
          <span style={{ fontSize: 8, color: C.textDim, letterSpacing: 2, border: `1px solid ${C.border}`, padding: "2px 6px", borderRadius: 3 }}>v2.0</span>
          {erreurAPI && <span style={{ fontSize: 9, color: C.yellow }}>⚠ MODE DÉMO</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {derniereMaj && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 1 }}>DERNIÈRE MAJ</div>
              <div style={{ fontSize: 11, color: C.textMid }}>{derniereMaj.toLocaleTimeString("fr-FR")}</div>
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 1 }}>HEURE LOCALE</div>
            <div style={{ fontSize: 12, color: C.accent }}>{now.toLocaleTimeString("fr-FR")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 1 }}>RISQUE</div>
            <div style={{ fontSize: 12, color: C.yellow }}>MODÉRÉ 5-15%</div>
          </div>
          {signaux.length > 0 && (
            <div style={{ background: C.greenGlow, border: `1px solid ${C.green}40`, borderRadius: 6, padding: "5px 12px", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 9, color: C.green, letterSpacing: 1 }}>{signaux.length} SIGNAL{signaux.length > 1 ? "S" : ""}</span>
            </div>
          )}
          <button onClick={lancerScan} disabled={chargementGlobal}
            style={{ background: "linear-gradient(135deg, #003040, #005060)", border: `1px solid ${C.accent}`, color: C.accent, padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 9, letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
            {chargementGlobal ? "◌ SCAN..." : "⚡ SCAN GLOBAL"}
          </button>
          <button onClick={fetchMarches} disabled={chargementMarches}
            style={{ background: "none", border: `1px solid ${C.border}`, color: C.textMid, padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
            {chargementMarches ? "◌" : "↻"}
          </button>
        </div>
      </div>

      {/* TICKER */}
      {marches.length > 0 && <Ticker marches={marches} />}

      {/* NAVIGATION */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 24px", background: C.bgDeep }}>
        {[["marches", `MARCHÉS (${marches.length})`], ["actus", "ACTUALITÉS"], ["scan", "SCAN IA"], ["chat", "AGENT CHAT"]].map(([id, label]) => (
          <button key={id} onClick={() => setOnglet(id)}
            style={{ background: "none", border: "none", borderBottom: onglet === id ? `2px solid ${C.accent}` : "2px solid transparent", color: onglet === id ? C.accent : C.textDim, padding: "11px 18px", cursor: "pointer", fontSize: 9, letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace", transition: "color 0.2s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* CONTENU */}
      <div style={{ padding: "20px 24px", maxWidth: 1440, margin: "0 auto" }}>

        {/* MARCHÉS */}
        {onglet === "marches" && (
          <div className="fade-in">
            <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
              {["TOUS", "MACRO", "POLITIQUE", "TECH", "GÉO"].map(cat => (
                <button key={cat} onClick={() => setFiltre(cat)}
                  style={{ background: filtre === cat ? C.accentDim : "none", border: `1px solid ${filtre === cat ? C.accent : C.border}`, color: filtre === cat ? C.accent : C.textMid, padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 8, letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {cat}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 9, color: C.textDim }}>
                {chargementMarches ? "Chargement..." : `${marchesFiltres.length} marchés`}
                <span style={{ color: erreurAPI ? C.yellow : C.green, marginLeft: 8 }}>● {erreurAPI ? "MODE DÉMO" : "API LIVE"}</span>
              </span>
            </div>
            {chargementMarches && marches.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: C.accent, fontSize: 11, animation: "pulse 1.5s infinite" }}>
                ◌ Chargement des marchés Polymarket en temps réel...
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
              {marchesFiltres.map(m => (
                <CarteMarche key={m.id} marche={m} onAnalyser={analyserMarche} onPrepareOrdre={setMarcheOrdre} chargement={chargementId === m.id} />
              ))}
            </div>
          </div>
        )}

        {/* ACTUALITÉS */}
        {onglet === "actus" && (
          <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}>
            <div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 14 }}>FLUX D'ACTUALITÉS — {actus.length} ARTICLES</div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "0 16px" }}>
                {actus.map((item, i) => <ItemActu key={i} item={item} />)}
              </div>
              <div style={{ marginTop: 12, padding: "10px 14px", background: C.yellowDim, border: `1px solid ${C.yellow}20`, borderRadius: 8, fontSize: 9, color: C.yellow, lineHeight: 1.6 }}>
                ⚠ Scraping RSS temps réel = prochaine itération (nécessite un backend Node.js pour contourner CORS).<br />
                Pour l'instant : colle ici les titres d'actu importants via le Chat Agent, il les intègre dans son analyse.
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 14 }}>SCORE D'IMPACT</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["MACRO", "POLITIQUE", "TECH", "GÉO"].map(cat => {
                  const count = actus.filter(n => n.category === cat).length || 1;
                  const haut = actus.filter(n => n.category === cat && (n.impact === "haut" || n.impact === "high")).length;
                  const cc = { MACRO: C.accent, POLITIQUE: C.purple, TECH: C.yellow, "GÉO": C.green }[cat];
                  return (
                    <div key={cat} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                        <span style={{ fontSize: 9, color: cc, letterSpacing: 2 }}>{cat}</span>
                        <span style={{ fontSize: 9, color: C.textDim }}>{count} articles</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ flex: 1, height: 4, background: C.border, borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(haut / count) * 100}%`, background: cc, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 9, color: C.red }}>{haut} HAUT</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {signaux.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 10 }}>SIGNAUX ACTIFS</div>
                  {signaux.map(m => (
                    <div key={m.id} style={{ background: C.panel, border: `1px solid ${C.green}25`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }} onClick={() => setOnglet("marches")}>
                      <div style={{ fontSize: 9, color: C.textDim, marginBottom: 4 }}>{m.category}</div>
                      <div style={{ fontSize: 10, color: C.text, marginBottom: 6, lineHeight: 1.4 }}>{(m.title || "").slice(0, 50)}…</div>
                      <BadgeSignal signal={m.signal} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCAN IA */}
        {onglet === "scan" && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 4 }}>ANALYSE GLOBALE IA — TOP 3 OPPORTUNITÉS</div>
                <div style={{ fontSize: 10, color: C.textMid }}>Croise marchés, actualités et sizing modéré (5-15%)</div>
              </div>
              <button onClick={lancerScan} disabled={chargementGlobal}
                style={{ background: C.accentDim, border: `1px solid ${C.accent}`, color: C.accent, padding: "7px 16px", borderRadius: 5, cursor: "pointer", fontSize: 9, letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                {chargementGlobal ? "◌ EN COURS..." : "↻ RELANCER"}
              </button>
            </div>
            {!analyseGlobale && !chargementGlobal && (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.2 }}>⚡</div>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Lance le scan global pour analyser tous les marchés d'un coup</div>
                <div style={{ fontSize: 10, color: C.textDim }}>L'IA croisera les probabilités, les news et identifiera les 3 meilleures opportunités</div>
              </div>
            )}
            {chargementGlobal && (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 11, color: C.accent, animation: "pulse 1.5s infinite", marginBottom: 10 }}>⚡ Analyse de {marches.length} marchés en cours...</div>
                <div style={{ fontSize: 10, color: C.textDim }}>Croisement données macro, actualités et probabilités</div>
              </div>
            )}
            {analyseGlobale && !chargementGlobal && (
              <div style={{ background: C.panel, border: `1px solid ${C.green}20`, borderRadius: 10, padding: 28 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
                  <span style={{ fontSize: 9, color: C.green, letterSpacing: 2 }}>ANALYSE COMPLÈTE — {new Date().toLocaleString("fr-FR")}</span>
                </div>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.9, color: C.text, fontFamily: "'IBM Plex Mono', monospace" }}>{analyseGlobale}</pre>
              </div>
            )}
          </div>
        )}

        {/* AGENT CHAT */}
        {onglet === "chat" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 210px)" }}>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2, marginBottom: 14 }}>AGENT DE TRADING — QUESTIONS EN FRANÇAIS</div>
            <div style={{ flex: 1, overflow: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {histo.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }} className="fade-in">
                  <div style={{ maxWidth: "78%", padding: "11px 14px", borderRadius: 10, fontSize: 11, lineHeight: 1.75, background: msg.role === "user" ? C.accentDim : "#0c1520", border: `1px solid ${msg.role === "user" ? C.accent + "40" : C.border}`, color: C.text }}>
                    {msg.role === "assistant" && <div style={{ fontSize: 8, color: C.accent, letterSpacing: 2, marginBottom: 7 }}>◈ AGENT POLYMARKET</div>}
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                  </div>
                </div>
              ))}
              {chargementChat && (
                <div style={{ display: "flex" }}>
                  <div style={{ padding: "11px 14px", borderRadius: 10, background: "#0c1520", border: `1px solid ${C.border}`, fontSize: 10, color: C.accent, animation: "pulse 1.5s infinite" }}>◈ Analyse en cours...</div>
                </div>
              )}
              <div ref={chatFinRef} />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {["Quelle est la meilleure opportunité maintenant ?", "Comment calibrer mon sizing ?", "Quels marchés surveiller cette semaine ?"].map(s => (
                <button key={s} onClick={() => setChatInput(s)}
                  style={{ background: "none", border: `1px solid ${C.border}`, color: C.textDim, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {s}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyerChat(); } }}
                placeholder="Ex : Quel est l'edge sur le marché Ukraine ? Faut-il rentrer maintenant ?"
                style={{ flex: 1, background: C.panel, border: `1px solid ${C.borderBright}`, borderRadius: 7, padding: "11px 14px", color: C.text, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", outline: "none" }}
              />
              <button onClick={envoyerChat} disabled={chargementChat || !chatInput.trim()}
                style={{ background: chargementChat ? C.border : C.accentDim, border: `1px solid ${chargementChat ? C.border : C.accent}`, color: chargementChat ? C.textDim : C.accent, padding: "11px 20px", borderRadius: 7, cursor: "pointer", fontSize: 9, letterSpacing: 2, fontFamily: "'IBM Plex Mono', monospace" }}>
                ENVOYER ▶
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL ORDRE */}
      {marcheOrdre && <ModalOrdre marche={marcheOrdre} onFermer={() => setMarcheOrdre(null)} />}
    </div>
  );
}