/**
 * Test: TikTok material/image listing API
 *
 * KEY FINDING: GET /api/v3/bm/material/image/ returns 404 on TikTok.
 * The real endpoint is POST /api/v3/bm/material/list/?org_id=...&call_platform=library
 *
 * This script maps the user's GET query-params to the working POST body format
 * and tests all parameter combinations.
 *
 * Usage:
 *   node scripts/test-material-image-api.js
 *   node scripts/test-material-image-api.js --keyword=test
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- helpers ----

function loadConfig() {
  const p = path.resolve(root, "config.json");
  if (!fs.existsSync(p)) { console.error("Missing config.json"); process.exit(1); }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function csrfTokenFromCookie(cookie) {
  const m = (cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith("csrftoken="));
  return m ? decodeURIComponent(m.slice(10)) : "";
}

function headers(cfg) {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.5",
    "cache-control": "no-cache",
    "content-type": "application/json",
    origin: "https://business.tiktok.com",
    pragma: "no-cache",
    referer: `https://business.tiktok.com/manage/material/image?org_id=${cfg.tiktok.org_id}`,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "x-csrftoken": cfg.tiktok.csrf_token || csrfTokenFromCookie(cfg.tiktok.cookie),
    Cookie: cfg.tiktok.cookie,
  };
}

// Parse CLI --key=value args
function cliArgs() {
  const a = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const k = arg.slice(2, eq === -1 ? undefined : eq);
    let v = eq === -1 ? true : arg.slice(eq + 1);
    if (v === "true") v = true; else if (v === "false") v = false; else if (v === "null") v = null;
    else if (/^\d+$/.test(v)) v = Number(v);
    a[k] = v;
  }
  return a;
}

// ---- parameter mapping ----
//
// The user's GET query params map to POST body fields as follows:
//
// | GET query param     | POST body field    | Notes                          |
// |---------------------|--------------------|--------------------------------|
// | org_id              | (query string)     | passed as URL query param      |
// | page                | page               | same                           |
// | page_size           | page_size          | same                           |
// | keyword             | keyword            | same                           |
// | material_ids[]      | file_ids[]         | filter by file_id list         |
// | filtering.width     | —                  | not in POST body; filter client-side |
// | filtering.height    | —                  | not in POST body; filter client-side |
// | filtering.format[]  | image_mode[]       | map "png"→?, "jpg"→?, etc.     |
// | filtering.status    | permission_type[]  | "ALL"→[], "ENABLED"→[1], etc.  |
// | order_by            | order_field        | same field name                |
// | order_type          | order_type         | "DESC"→1, "ASC"→2             |

function buildBody(userParams) {
  const p = userParams;
  const f = p.filtering || {};

  return {
    m_type: 2,                          // 2 = image
    metrics: [],
    is_lifetime: 0,
    st: "2026-04-20",                   // last 7 days
    et: "2026-04-27",
    order_field: p.order_by || "create_time",
    order_type: (p.order_type === "ASC") ? 2 : 1,   // "DESC"→1, "ASC"→2
    keyword_type: 6,
    page: p.page ?? 1,
    page_size: p.page_size ?? 20,
    keyword: p.keyword || "",
    country: [],
    image_mode: f.format || [],         // ["png"] etc.
    placement_id: [],
    cost_lower: "",
    cost_upper: "",
    permission_type: mapStatus(f.status || "ALL"),
  };
}

function mapStatus(status) {
  // TikTok permission_type: 1=ENABLED, 2=DISABLED, empty=ALL
  if (status === "ENABLED") return [1];
  if (status === "DISABLED") return [2];
  return []; // "ALL"
}

function summarize(d) {
  if (!d) return { error: "empty response" };
  const infos = d.data?.material_infos;
  return {
    code: d.code,
    msg: d.msg,
    total: d.data?.total,
    page: d.data?.page,
    page_size: d.data?.page_size,
    returned: infos?.length ?? 0,
    items: infos?.map(m => ({
      id: m.base_info?.material_id,
      name: m.base_info?.material_name,
      size: `${m.base_info?.resolution?.width}x${m.base_info?.resolution?.height}`,
      url: (m.base_info?.image_url || "").slice(0, 80),
    })) || [],
  };
}

// ---- main ----

async function main() {
  const cfg = loadConfig();
  const oid = cfg.tiktok.org_id;
  const cli = cliArgs();
  const hdrs = headers(cfg);

  const baseUrl = `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${oid}&call_platform=library`;

  // Default params (matching the user's original sketch)
  const defaults = {
    page: 1,
    page_size: 5,
    keyword: cli.keyword || "",
    material_ids: [],
    filtering: { width: null, height: null, format: [], status: "ALL" },
    order_by: "create_time",
    order_type: "DESC",
  };

  const tests = [
    { label: "Test 1: default list (page 1, size 5, status ALL)",  params: { ...defaults } },
    { label: "Test 2: status=ENABLED only",                         params: { ...defaults, filtering: { ...defaults.filtering, status: "ENABLED" } } },
    { label: "Test 3: status=DISABLED only",                        params: { ...defaults, filtering: { ...defaults.filtering, status: "DISABLED" } } },
    { label: 'Test 4: order ASC',                                   params: { ...defaults, order_type: "ASC" } },
    { label: "Test 5: page_size=3, page=2",                         params: { ...defaults, page: 2, page_size: 3 } },
  ];

  // Add keyword test if provided
  if (cli.keyword) {
    tests.push({ label: `Test N: keyword="${cli.keyword}"`, params: { ...defaults, keyword: cli.keyword } });
  }

  console.log("=".repeat(70));
  console.log(`Endpoint: POST ${baseUrl}`);
  console.log(`Org: ${oid}  (total materials: fetching...)`);
  console.log("=".repeat(70));

  for (const t of tests) {
    console.log(`\n--- ${t.label} ---`);
    const body = buildBody(t.params);
    console.log(`  Request body: ${JSON.stringify(body)}`);
    try {
      const resp = await axios.post(baseUrl, body, { headers: hdrs, timeout: 15000, validateStatus: () => true });
      const s = summarize(resp.data);
      console.log(`  HTTP ${resp.status}  code=${s.code}  msg=${s.msg}`);
      if (s.code === 0) {
        console.log(`  total=${s.total}  page=${s.page}/${Math.ceil((s.total || 1) / (s.page_size || 1))}  returned=${s.returned}`);
        for (const item of s.items) {
          console.log(`    ${item.id}  ${item.size.padEnd(12)} ${item.name}`);
        }
      } else {
        console.log(`  Full response: ${JSON.stringify(resp.data).slice(0, 300)}`);
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
