// Language + contribution band, rendered as one monochrome SVG.
// Replaces github-readme-stats / streak-stats with something that matches
// the editorial style of the profile (no color, hairlines, mono micro-labels).
//
// Deploy: same Deno Deploy app pattern as clock-svg.ts, entrypoint server/stats-svg.ts
// REQUIRED env var: GH_TOKEN  — a classic GitHub token with `read:user` + `public_repo`
//   (Deno Deploy → your app → Settings → Environment Variables)
//
// Query params: ?user=makbal520&theme=dark|light

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount } }
      }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:PUSHED_AT,direction:DESC}){
      nodes{ languages(first:10, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } }
    }
  }
}`;

type Day = { date: string; contributionCount: number };
type Stats = {
  langs: { name: string; pct: number }[];
  total: number;
  totalRange: string;
  current: number;
  currentRange: string;
  longest: number;
  longestRange: string;
};

const fmtDay = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function streaks(days: Day[]) {
  let cur = 0, curStart = "", best = 0, bestStart = "", bestEnd = "";
  let run = 0, runStart = "";
  for (const d of days) {
    if (d.contributionCount > 0) {
      if (run === 0) runStart = d.date;
      run++;
      if (run > best) { best = run; bestStart = runStart; bestEnd = d.date; }
    } else run = 0;
  }
  // current streak: walk backwards, tolerating an empty today
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.contributionCount > 0) { cur++; curStart = d.date; }
    else if (i === days.length - 1) continue;
    else break;
  }
  const last = days[days.length - 1];
  return {
    current: cur,
    currentRange: cur ? `${fmtDay(curStart)} – ${fmtDay(last.date)}` : "—",
    longest: best,
    longestRange: best ? `${fmtDay(bestStart)} – ${fmtDay(bestEnd)}` : "—",
  };
}

async function fetchStats(login: string): Promise<Stats> {
  const token = Deno.env.get("GH_TOKEN");
  if (!token) throw new Error("GH_TOKEN env var is not set");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  const u = json.data.user;

  const sizes = new Map<string, number>();
  for (const repo of u.repositories.nodes) {
    for (const e of repo.languages.edges) sizes.set(e.node.name, (sizes.get(e.node.name) ?? 0) + e.size);
  }
  const sum = [...sizes.values()].reduce((a, b) => a + b, 0) || 1;
  const langs = [...sizes.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, size]) => ({ name, pct: (size / sum) * 100 }));

  const cal = u.contributionsCollection.contributionCalendar;
  const days: Day[] = cal.weeks.flatMap((w: { contributionDays: Day[] }) => w.contributionDays);

  return {
    langs,
    total: cal.totalContributions,
    totalRange: `${fmtDay(days[0].date)} – Present`,
    ...streaks(days),
  };
}

// ── rendering ───────────────────────────────────────────────────────────────
const W = 1200, H = 300;

function render(s: Stats, theme: "dark" | "light"): string {
  const dark = theme === "dark";
  const paper = dark ? "#111111" : "#ffffff";
  const ink = dark ? "#ffffff" : "#111111";
  const muted = dark ? "#7c7c7c" : "#8a8a8a";
  const rule = dark ? "#3a3a3a" : "#dcdcdc";
  const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";

  // language bar: one hairline-separated segment per language, tinted by rank
  let x = 40;
  const bar = s.langs.map((l, i) => {
    const w = (l.pct / 100) * 340;
    const fill = dark
      ? `rgba(255,255,255,${(1 - i * 0.14).toFixed(2)})`
      : `rgba(17,17,17,${(1 - i * 0.14).toFixed(2)})`;
    const seg = `<rect x="${x.toFixed(1)}" y="150" width="${Math.max(w - 1, 0).toFixed(1)}" height="10" fill="${fill}"/>`;
    x += w;
    return seg;
  }).join("");

  const legend = s.langs.map((l, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    return `<text x="${40 + col * 116}" y="${190 + row * 20}" font-family="${MONO}" font-size="11" fill="${muted}" letter-spacing="0.5">${
      l.name.toUpperCase()} ${l.pct.toFixed(0)}%</text>`;
  }).join("");

  const stat = (cx: number, value: string | number, label: string, sub: string) => `
    <text x="${cx}" y="128" font-size="46" fill="${muted}" text-anchor="middle" font-family="${SANS}">${value}</text>
    <text x="${cx}" y="158" font-size="11" fill="${muted}" text-anchor="middle" font-family="${MONO}" letter-spacing="1">${label}</text>
    <text x="${cx}" y="180" font-size="10" fill="${muted}" text-anchor="middle" font-family="${MONO}">${sub}</text>`;

  const R = 44, C = 2 * Math.PI * R;
  const ringCx = 820, ringCy = 128;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${SANS}">
  <rect width="${W}" height="${H}" fill="${paper}"/>

  <text x="40" y="72" font-size="21" font-weight="700" fill="${ink}">Most Used</text>
  <text x="40" y="100" font-size="21" font-weight="700" fill="${ink}">Languages</text>
  ${bar}
  ${legend}

  <line x1="470" y1="40" x2="470" y2="${H - 40}" stroke="${rule}"/>

  ${stat(620, s.total, "TOTAL CONTRIBUTIONS", s.totalRange)}

  <circle cx="${ringCx}" cy="${ringCy}" r="${R}" fill="none" stroke="${rule}" stroke-width="2"/>
  <circle cx="${ringCx}" cy="${ringCy}" r="${R}" fill="none" stroke="${ink}" stroke-width="2"
          stroke-linecap="butt" stroke-dasharray="${C}" stroke-dashoffset="${C}"
          transform="rotate(-90 ${ringCx} ${ringCy})">
    <animate attributeName="stroke-dashoffset" from="${C}" to="${(C * (1 - Math.min(s.current, 30) / 30)).toFixed(1)}"
             dur="1.1s" fill="freeze" calcMode="spline" keySplines="0.2 0 0 1" keyTimes="0;1"/>
  </circle>
  <text x="${ringCx}" y="${ringCy + 12}" font-size="34" fill="${ink}" text-anchor="middle">${s.current}</text>
  <text x="${ringCx}" y="188" font-size="11" fill="${ink}" text-anchor="middle" font-family="${MONO}" letter-spacing="1">CURRENT STREAK</text>
  <text x="${ringCx}" y="208" font-size="10" fill="${muted}" text-anchor="middle" font-family="${MONO}">${s.currentRange}</text>

  ${stat(1030, s.longest, "LONGEST STREAK", s.longestRange)}
</svg>`;
}

function errorCard(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 120" width="${W}" height="120" font-family="ui-monospace, Menlo, monospace">
  <rect width="${W}" height="120" fill="#111111"/>
  <text x="40" y="56" font-size="13" fill="#ffffff">STATS UNAVAILABLE</text>
  <text x="40" y="80" font-size="11" fill="#7c7c7c">${msg.replace(/[<&]/g, "")}</text>
</svg>`;
}

const cache = new Map<string, { at: number; body: string }>();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const user = url.searchParams.get("user") ?? "makbal520";
  const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
  const key = `${user}:${theme}`;
  const hit = cache.get(key);

  let body: string;
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) {
    body = hit.body;
  } else {
    try {
      body = render(await fetchStats(user), theme);
      cache.set(key, { at: Date.now(), body });
    } catch (e) {
      body = errorCard(e instanceof Error ? e.message : String(e));
    }
  }
  return new Response(body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=600, must-revalidate",
    },
  });
});
