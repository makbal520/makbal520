// Self-ticking profile header — returns one SVG whose clock keeps running
// in the browser via SMIL, so it is live to the second even while GitHub's
// image proxy serves a cached copy.
//
// Deploy on Deno Deploy (no build step):
//   1. push this repo, go to https://dash.deno.com → New Project → pick the repo
//   2. entrypoint: server/clock-svg.ts
//   3. put the resulting URL into README.md as the header <img src>
//
// Query params: ?theme=dark|light

const BIO_LINES = [
  "Munich, building document-grounded RAG",
  "systems, cloud-deployed ML pipelines, and",
  "interfaces studied through real usability testing.",
];

const CELL_H = 18;   // vertical pitch of one digit cell
const TOP = 24;      // top of the clock row (baseline lands at TOP + 14)

type Strip = { x: number; values: string[]; dur: number; off: number; w: number };

/** A clipped column of glyphs that steps down one cell per tick, forever. */
function strip(id: string, s: Strip, ink: string): string {
  const { x, values, dur, off, w } = s;
  const cells = values
    .map((v, i) => `<text x="${x}" y="${TOP + i * CELL_H + 14}">${v}</text>`)
    .join("");
  const frames = values.map((_, i) => `0,${-i * CELL_H}`).join(";");
  return `<g clip-path="url(#${id})">
    <g fill="${ink}">${cells}
      <animateTransform attributeName="transform" type="translate"
        calcMode="discrete" values="${frames}" dur="${dur}s"
        begin="-${off}s" repeatCount="indefinite"/>
    </g>
  </g>
  <clipPath id="${id}"><rect x="${x - 1}" y="${TOP}" width="${w}" height="${CELL_H}"/></clipPath>`;
}

function parts(tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(f.find((p) => p.type === t)!.value);
  return { h: get("hour"), m: get("minute"), s: get("second") };
}

const pad = (n: number) => String(n).padStart(2, "0");
const seq = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));
/** rotate so index 0 is the value showing right now */
const rot = (a: string[], k: number) => a.slice(k % a.length).concat(a.slice(0, k % a.length));

/** Five strips = HH : MM : SS, each on its own natural cycle. */
function clock(prefix: string, x: number, tz: string, ink: string): string {
  const { h, m, s } = parts(tz);
  const CW = 7.83; // monospace advance at 13px
  const rows: Strip[] = [
    { x,             values: rot(seq(24, (i) => pad(i)), h),                    dur: 86400, off: m * 60 + s,        w: CW * 2 + 2 },
    { x: x + CW * 3, values: rot(seq(6,  (i) => String(i)), Math.floor(m / 10)), dur: 3600,  off: (m % 10) * 60 + s, w: CW + 2 },
    { x: x + CW * 4, values: rot(seq(10, (i) => String(i)), m % 10),             dur: 600,   off: s,                 w: CW + 2 },
    { x: x + CW * 6, values: rot(seq(6,  (i) => String(i)), Math.floor(s / 10)), dur: 60,    off: s % 10,            w: CW + 2 },
    { x: x + CW * 7, values: rot(seq(10, (i) => String(i)), s % 10),             dur: 10,    off: 0,                 w: CW + 2 },
  ];
  const colons = `<text x="${x + CW * 2}" y="${TOP + 14}" fill="${ink}">:</text>` +
                 `<text x="${x + CW * 5}" y="${TOP + 14}" fill="${ink}">:</text>`;
  return colons + rows.map((r, i) => strip(`${prefix}${i}`, r, ink)).join("");
}

function header(theme: "light" | "dark"): string {
  const ink   = theme === "dark" ? "#ffffff" : "#111111";
  const muted = theme === "dark" ? "#9a9a9a" : "#6b6b6b";
  const paper = theme === "dark" ? "#0d1117" : "#ffffff";
  const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600" font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
  <rect width="1200" height="600" fill="${paper}"/>
  <g font-family="${MONO}" font-size="13" letter-spacing="0.5">
    ${clock("a", 28, "Europe/Berlin", ink)}
    <text x="98" y="${TOP + 14}" fill="${ink}">MUC</text>
    ${clock("b", 176, "Asia/Shanghai", ink)}
    <text x="246" y="${TOP + 14}" fill="${ink}">PEK</text>
  </g>
  <text x="1172" y="39" font-size="16" fill="${ink}" text-anchor="end">Menu</text>
  <g font-size="17">
    <text x="780" y="222" fill="${ink}" font-weight="700">Baylee (Mahebali). <tspan fill="${muted}" font-weight="400">AI Master&#39;s student at TU</tspan></text>
    ${BIO_LINES.map((l, i) => `<text x="780" y="${249 + i * 27}" fill="${muted}">${l}</text>`).join("\n    ")}
  </g>
  <text x="24" y="560" font-size="207" fill="${ink}" letter-spacing="-3">MAHEBALI</text>
</svg>`;
}

Deno.serve((req) => {
  const theme = new URL(req.url).searchParams.get("theme") === "dark" ? "dark" : "light";
  return new Response(header(theme), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // keep the baked start time fresh; the SMIL animation covers the gaps
      "cache-control": "public, max-age=0, s-maxage=60, must-revalidate",
    },
  });
});
