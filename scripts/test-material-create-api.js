/**
 * Test: POST /api/v3/bm/material/image/create/
 *
 * Registers an uploaded image in the TikTok material library.
 * This is step 2 of the 3-step upload→create→list lifecycle.
 *
 * Usage:
 *   node scripts/test-material-create-api.js
 *   node scripts/test-material-create-api.js --name=my-image
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadConfig() {
  const p = path.resolve(root, "config.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function csrfTokenFromCookie(cookie) {
  const m = (cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith("csrftoken="));
  return m ? decodeURIComponent(m.slice(10)) : "";
}

function makeHeaders(cfg, ct) {
  const h = {
    accept: "application/json, text/plain, */*",
    origin: "https://business.tiktok.com",
    referer: `https://business.tiktok.com/manage/material/image?org_id=${cfg.tiktok.org_id}`,
    "x-csrftoken": cfg.tiktok.csrf_token || csrfTokenFromCookie(cfg.tiktok.cookie),
    Cookie: cfg.tiktok.cookie,
  };
  if (ct) h["content-type"] = ct;
  return h;
}

function cliArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

async function main() {
  const cfg = loadConfig();
  const oid = cfg.tiktok.org_id;
  const testName = cliArg("name", "test-create-" + Date.now());
  const testPng = path.resolve(root, "test", "random-1mv3.png");

  if (!fs.existsSync(testPng)) {
    console.error("Test PNG not found:", testPng);
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("Testing POST /api/v3/bm/material/image/create/");
  console.log(`Org: ${oid}`);
  console.log("=".repeat(70));

  // ================================================================
  // Step 1: Upload to get web_uri
  // ================================================================
  console.log("\n--- Step 1: Upload (to get web_uri) ---");
  const form = new FormData();
  form.append("Filedata", fs.createReadStream(testPng));
  const uploadUrl = `https://business.tiktok.com/api/v3/bm/material/image/upload/?org_id=${oid}`;
  const upResp = await axios.post(uploadUrl, form, {
    headers: { ...makeHeaders(cfg), ...form.getHeaders() },
    timeout: 30000,
    validateStatus: () => true,
  });
  console.log(`  HTTP ${upResp.status}  code=${upResp.data?.code}`);
  const webUri = upResp.data?.data?.image_info?.web_uri;
  console.log(`  web_uri: ${webUri}`);

  if (!webUri) {
    console.error("Upload did not return web_uri — aborting.");
    process.exit(1);
  }

  // ================================================================
  // Step 2: Create with various parameter combos
  // ================================================================
  const createUrl = `https://business.tiktok.com/api/v3/bm/material/image/create/?org_id=${oid}`;
  const headers = makeHeaders(cfg, "application/json");

  const tests = [
    {
      label: "Full params (recommended)",
      body: { web_uri: webUri, original_web_uri: webUri, name: testName, show_error: false },
    },
  ];

  for (const t of tests) {
    console.log(`\n--- Test: ${t.label} ---`);
    console.log(`  Body: ${JSON.stringify(t.body)}`);
    const r = await axios.post(createUrl, t.body, {
      headers,
      timeout: 15000,
      validateStatus: () => true,
    });
    console.log(`  HTTP ${r.status}  code=${r.data?.code}  msg=${r.data?.msg}`);
    console.log(`  Response: ${JSON.stringify(r.data).slice(0, 300)}`);
  }

  // ================================================================
  // Step 3: Verify material exists in list (get material_id + url)
  // ================================================================
  console.log("\n--- Step 3: List to retrieve material_id + url ---");
  {
    const listBody = {
      m_type: 2, metrics: [], is_lifetime: 1,
      st: "2026-04-20", et: "2026-04-27",
      order_field: "create_time", order_type: 1,
      keyword_type: 6, page: 1, page_size: 5,
      keyword: testName,
      country: [], image_mode: [], placement_id: [],
      cost_lower: "", cost_upper: "", permission_type: [],
    };
    const r = await axios.post(
      `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${oid}&call_platform=library`,
      listBody,
      { headers: makeHeaders(cfg, "application/json"), timeout: 15000, validateStatus: () => true }
    );
    const items = r.data?.data?.material_infos || [];
    console.log(`  Found: ${items.length} matching "${testName}"`);
    if (items[0]) {
      const m = items[0].base_info;
      console.log(`  material_id: ${m.material_id}`);
      console.log(`  file_id:     ${m.file_id}`);
      console.log(`  name:        ${m.material_name}`);
      console.log(`  url:         ${m.image_url.slice(0, 100)}`);
      console.log(`  size:        ${m.resolution.width}x${m.resolution.height}`);
      console.log(`  created:     ${m.create_time}`);
    }
  }

  // ================================================================
  // Summary: parameter reference
  // ================================================================
  console.log("\n" + "=".repeat(70));
  console.log("Parameter reference");
  console.log("=".repeat(70));
  console.log(`
  Endpoint: POST /api/v3/bm/material/image/create/?org_id={org_id}

  Body parameters:
  ┌─────────────────────┬──────────┬──────────────────────────────────┐
  │ Field               │ Required │ Notes                            │
  ├─────────────────────┼──────────┼──────────────────────────────────┤
  │ web_uri             │ YES      │ URI returned by upload step      │
  │ name                │ no       │ Display name (defaults to upload │
  │                     │          │ filename)                        │
  │ original_web_uri    │ no       │ Defaults to same as web_uri      │
  │ show_error          │ no       │ Boolean, defaults to false       │
  └─────────────────────┴──────────┴──────────────────────────────────┘

  Response:
  ┌─────────────────────┬────────────────────────────────────────────┐
  │ Field               │ Value                                      │
  ├─────────────────────┼────────────────────────────────────────────┤
  │ data.file_id        │ "" (always empty — use list to get real    │
  │                     │ material_id)                               │
  │ code                │ 0 on success                               │
  │ msg                 │ "success"                                  │
  └─────────────────────┴────────────────────────────────────────────┘

  ⚠ create does NOT return material_id or url.
    Use POST /api/v3/bm/material/list/ with keyword search by name
    to retrieve the full material record after creating.

  User's expected fields → actual source:
    material_id → list endpoint (base_info.material_id)
    url         → list endpoint (base_info.image_url)
  `);

  console.log("Done.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
