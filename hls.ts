import { createFileRoute } from "@tanstack/react-router";

// Stream proxy: fixes CORS and http-on-https blocking for public IPTV streams.
// Rewrites playlist URIs so every segment/sub-playlist also goes through the proxy.
export const Route = createFileRoute("/api/public/hls")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url");
        if (!target || !/^https?:\/\//i.test(target)) return new Response("bad url", { status: 400 });
        let upstream: Response;
        try {
          upstream = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 JHTV" }, redirect: "follow", signal: AbortSignal.timeout(10000) });
        } catch {
          return new Response("channel offline", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
        }
        const type = upstream.headers.get("content-type") ?? "";
        const headers = new Headers({ "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
        const isPlaylist = /mpegurl|m3u/i.test(type) || /\.m3u8?(\?|$)/i.test(target);
        if (!isPlaylist) {
          if (type) headers.set("content-type", type);
          return new Response(upstream.body, { status: upstream.status >= 500 ? 404 : upstream.status, headers });
        }
        const base = upstream.url || target;
        const wrap = (u: string) => "/api/public/hls?url=" + encodeURIComponent(new URL(u, base).toString());
        const text = await upstream.text();
        const out = text.split(/\r?\n/).map((line) => {
          const t = line.trim();
          if (!t) return line;
          if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${wrap(u)}"`);
          return wrap(t);
        }).join("\n");
        headers.set("content-type", "application/vnd.apple.mpegurl");
        return new Response(out, { status: upstream.status >= 500 ? 404 : upstream.status, headers });
      },
    },
  },
});
