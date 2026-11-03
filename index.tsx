import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JHTV — TV ao vivo grátis" },
      { name: "description", content: "JHTV: canais abertos e gratuitos ao vivo, com navegação por controle remoto." },
      { property: "og:title", content: "JHTV — TV ao vivo grátis" },
      { property: "og:description", content: "Canais abertos e gratuitos ao vivo, feitos para a TV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Bebas+Neue&display=swap" },
    ],
  }),
  component: Index,
});

const PT: Record<string, string> = {
  Animation: "Animação", Auto: "Automóveis", Business: "Negócios", Classic: "Clássicos", Comedy: "Comédia",
  Cooking: "Culinária", Culture: "Cultura", Documentary: "Documentários", Education: "Educação",
  Entertainment: "Entretenimento", Family: "Família", General: "Geral", Kids: "Infantil", Legislative: "Legislativo",
  Lifestyle: "Estilo de vida", Movies: "Filmes", Music: "Música", News: "Notícias", Outdoor: "Ar livre",
  Relax: "Relaxar", Religious: "Religioso", Science: "Ciência", Series: "Séries", Shop: "Compras",
  Sports: "Esportes", Travel: "Viagem", Weather: "Clima", Undefined: "Outros", Public: "Públicos",
};

type Channel = { name: string; logo: string; group: string; url: string };

const LISTS = {
  Brasil: "https://iptv-org.github.io/iptv/countries/br.m3u",
  Portugal: "https://iptv-org.github.io/iptv/countries/pt.m3u",
  Notícias: "https://iptv-org.github.io/iptv/categories/news.m3u",
  Música: "https://iptv-org.github.io/iptv/categories/music.m3u",
};

function parseM3U(text: string): Channel[] {
  const out: Channel[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (!l.startsWith("#EXTINF")) continue;
    const name = l.split(",").slice(1).join(",").trim();
    const logo = /tvg-logo="([^"]*)"/.exec(l)?.[1] ?? "";
    const group = (/group-title="([^"]*)"/.exec(l)?.[1] || "Geral").split(";")[0] ?? "Geral";
    const groupPt = PT[group] ?? group;
    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      const lj = lines[j] ?? ""; if (lj && !lj.startsWith("#")) { url = lj.trim(); i = j; break; }
    }
    if (url) out.push({ name, logo, group: groupPt, url });
  }
  return out;
}

// Spatial navigation for remote control (arrow keys + OK/Enter + Back)
function useSpatialNav(onBack: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["Escape", "Backspace", "GoBack", "BrowserBack"].includes(e.key)) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" && e.key === "Backspace") return;
        e.preventDefault(); onBack(); return;
      }
      const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const d = dirs[e.key];
      if (!d) return;
      const cur = document.activeElement as HTMLElement | null;
      if (cur?.tagName === "INPUT" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-nav]")).filter((x) => x.offsetParent);
      if (!cur || !els.includes(cur)) { els[0]?.focus(); e.preventDefault(); return; }
      const r = cur.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best: HTMLElement | null = null, bestScore = Infinity;
      for (const el of els) {
        if (el === cur) continue;
        const b = el.getBoundingClientRect();
        const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
        const main = dx * d[0] + dy * d[1];
        if (main <= 1) continue;
        const cross = Math.abs(dx * d[1] + dy * d[0]);
        const score = main + cross * 2.5;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      if (best) { e.preventDefault(); best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBack]);
}

function Player({ ch, onClose, onPrev, onNext }: { ch: Channel; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setErr(false);
    const v = ref.current!;
    let hls: { destroy: () => void } | null = null;
    (async () => {
      const src = "/api/public/hls?url=" + encodeURIComponent(ch.url);
      if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = src; v.onerror = () => setErr(true); v.play().catch(() => {}); return; }
      const Hls = (await import("hls.js")).default;
      if (Hls.isSupported()) {
        const h = new Hls({ manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2 });
        h.loadSource(src); h.attachMedia(v);
        h.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) setErr(true); });
        h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        hls = h;
      } else { v.src = src; }
    })();
    return () => hls?.destroy();
  }, [ch]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ChannelUp") { e.preventDefault(); e.stopImmediatePropagation(); onPrev(); }
      if (e.key === "ArrowDown" || e.key === "ChannelDown") { e.preventDefault(); e.stopImmediatePropagation(); onNext(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onPrev, onNext]);
  return (
    <div className="fixed inset-0 z-50 bg-background">
      <video ref={ref} className="h-full w-full" controls autoPlay />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-background to-transparent p-6">
        {ch.logo && <img src={ch.logo} alt="" className="h-12 w-12 object-contain" />}
        <div>
          <div className="font-display text-4xl tracking-wide">{ch.name}</div>
          <div className="text-sm text-muted-foreground">▲▼ trocar canal · Voltar para sair</div>
        </div>
      </div>
      {err && <div className="absolute inset-0 flex items-center justify-center text-xl text-muted-foreground">Canal indisponível no momento. Use ▲▼ para trocar.</div>}
      <button data-nav onClick={onClose} className="tv-focus absolute right-6 top-6 rounded-lg bg-secondary px-5 py-3 font-semibold">✕ Fechar</button>
    </div>
  );
}

function Index() {
  const [list, setList] = useState("Brasil");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState("Todos");
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<number | null>(null);
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => { setFavs(JSON.parse(localStorage.getItem("jhtv-favs") || "[]")); }, []);
  const toggleFav = (u: string) => setFavs((f) => { const n = f.includes(u) ? f.filter((x) => x !== u) : [...f, u]; localStorage.setItem("jhtv-favs", JSON.stringify(n)); return n; });

  useEffect(() => {
    setLoading(true); setGroup("Todos");
    fetch(LISTS[list as keyof typeof LISTS]).then((r) => r.text()).then((t) => setChannels(parseM3U(t))).catch(() => setChannels([])).finally(() => setLoading(false));
  }, [list]);

  const groups = useMemo(() => ["Todos", "★ Favoritos", ...Array.from(new Set(channels.map((c) => c.group))).sort()], [channels]);
  const shown = useMemo(() => channels.filter((c) =>
    (group === "Todos" || (group === "★ Favoritos" ? favs.includes(c.url) : c.group === group)) &&
    c.name.toLowerCase().includes(q.toLowerCase())), [channels, group, q, favs]);

  const back = useMemo(() => () => setPlaying(null), []);
  useSpatialNav(back);
  useEffect(() => { if (!loading && playing === null) (document.querySelector("[data-nav]") as HTMLElement)?.focus(); }, [loading, playing]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r bg-card/60 p-5 backdrop-blur">
        <h1 className="font-display text-6xl leading-none text-primary">JH<span className="text-accent">TV</span></h1>
        <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">Ao vivo · Grátis</p>
        <div className="mb-2 text-xs font-bold uppercase text-muted-foreground">Listas</div>
        {Object.keys(LISTS).map((k) => (
          <button key={k} data-nav onClick={() => setList(k)}
            className={`tv-focus rounded-lg px-4 py-3 text-left font-semibold ${list === k ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{k}</button>
        ))}
        <div className="mb-2 mt-4 text-xs font-bold uppercase text-muted-foreground">Categorias</div>
        {groups.map((g) => (
          <button key={g} data-nav onClick={() => setGroup(g)}
            className={`tv-focus rounded-lg px-4 py-2 text-left text-sm ${group === g ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}>{g}</button>
        ))}
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-6 flex items-center gap-4">
          <input data-nav value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar canal..."
            className="tv-focus w-full max-w-md rounded-lg border bg-input px-4 py-3 text-lg" />
          <span className="text-muted-foreground">{shown.length} canais</span>
        </div>
        {loading ? <p className="text-xl text-muted-foreground">Carregando canais…</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-5">
            {shown.map((c) => (
              <div key={c.url} className="relative">
                <button data-nav onClick={() => setPlaying(channels.indexOf(c))}
                  className="tv-focus flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-xl bg-card p-4">
                  {c.logo ? <img src={c.logo} alt="" loading="lazy" className="h-16 w-24 object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
                    : <span className="font-display text-4xl text-primary">{c.name.slice(0, 2)}</span>}
                  <span className="line-clamp-2 text-center text-sm font-semibold">{c.name}</span>
                </button>
                <button data-nav onClick={() => toggleFav(c.url)} aria-label="Favoritar"
                  className="tv-focus absolute right-2 top-2 rounded-full bg-background/70 px-2 text-lg text-primary">{favs.includes(c.url) ? "★" : "☆"}</button>
              </div>
            ))}
          </div>
        )}
      </main>
      {playing !== null && channels[playing] && (
        <Player ch={channels[playing]} onClose={back}
          onPrev={() => setPlaying((p) => (p! - 1 + channels.length) % channels.length)}
          onNext={() => setPlaying((p) => (p! + 1) % channels.length)} />
      )}
    </div>
  );
}
