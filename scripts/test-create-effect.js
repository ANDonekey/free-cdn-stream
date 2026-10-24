/**
 * A/B test: does create() have observable effect?
 * Compares "upload only" vs "upload + create" with unique PNG content.
 */
import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const oid = cfg.tiktok.org_id;
const csrf = (cfg.tiktok.cookie || "").split(";").map(s => s.trim()).find(s => s.startsWith("csrftoken="));
const csrfToken = csrf ? decodeURIComponent(csrf.slice(10)) : "";

const hdrs = {
  accept: "application/json",
  "content-type": "application/json",
  origin: "https://business.tiktok.com",
  referer: `https://business.tiktok.com/manage/material/image?org_id=${oid}`,
  "x-csrftoken": csrfToken,
  Cookie: cfg.tiktok.cookie,
};
const upHdrs = { ...hdrs };
delete upHdrs["content-type"];

function makeUniquePng(seed) {
  // minimal PNG with unique random IDAT chunk
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.from([0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222]);
  const randomData = crypto.randomBytes(8);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(8, 0);
  const idatType = Buffer.from("IDAT");
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32_ieee(Buffer.concat([idatType, randomData])), 0);
  const idat = Buffer.concat([idatLen, idatType, randomData, idatCrc]);
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function crc32_ieee(data) {
  let c = ~0 >>> 0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

async function getTotal() {
  const r = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${oid}&call_platform=library`,
    { m_type: 2, metrics: [], is_lifetime: 1, order_field: "create_time", order_type: 1, keyword_type: 6, page: 1, page_size: 1, keyword: "", country: [], image_mode: [], placement_id: [], cost_lower: "", cost_upper: "", permission_type: [] },
    { headers: hdrs, timeout: 15000 }
  );
  return r.data?.data?.total;
}

async function searchByName(name) {
  const r = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${oid}&call_platform=library`,
    { m_type: 2, metrics: [], is_lifetime: 1, order_field: "create_time", order_type: 1, keyword_type: 6, page: 1, page_size: 5, keyword: name, country: [], image_mode: [], placement_id: [], cost_lower: "", cost_upper: "", permission_type: [] },
    { headers: hdrs, timeout: 15000 }
  );
  return r.data?.data;
}

async function main() {
  const countBefore = await getTotal();
  console.log(`Total materials before: ${countBefore}`);

  const nameA = "unique-A-" + Date.now();
  const nameB = "unique-B-" + Date.now();

  // === A: Upload ONLY (skip create) ===
  console.log(`\n=== A: Upload ONLY (skip create) ===`);
  const pngA = makeUniquePng(Date.now());
  let formA = new FormData();
  formA.append("Filedata", pngA, { filename: nameA + ".png" });
  const upA = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/image/upload/?org_id=${oid}`,
    formA,
    { headers: { ...upHdrs, ...formA.getHeaders() }, timeout: 30000, validateStatus: () => true }
  );
  console.log(`upload HTTP ${upA.status}  code=${upA.data?.code}  name_in_upload=${upA.data?.data?.image_info?.name}`);

  // === B: Upload + Create ===
  console.log(`\n=== B: Upload + Create ===`);
  const pngB = makeUniquePng(Date.now() + 1);
  let formB = new FormData();
  formB.append("Filedata", pngB, { filename: nameB + ".png" });
  const upB = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/image/upload/?org_id=${oid}`,
    formB,
    { headers: { ...upHdrs, ...formB.getHeaders() }, timeout: 30000, validateStatus: () => true }
  );
  const uriB = upB.data?.data?.image_info?.web_uri;
  console.log(`upload HTTP ${upB.status}  code=${upB.data?.code}`);
  const crB = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/image/create/?org_id=${oid}`,
    { web_uri: uriB, original_web_uri: uriB, name: nameB + "-created", show_error: false },
    { headers: hdrs, timeout: 15000, validateStatus: () => true }
  );
  console.log(`create HTTP ${crB.status}  code=${crB.data?.code}  data=${JSON.stringify(crB.data?.data)}`);

  // Wait for propagation
  await new Promise(r => setTimeout(r, 3000));

  // === Results ===
  const countAfter = await getTotal();
  console.log(`\n=== Results ===`);
  console.log(`Total before: ${countBefore}`);
  console.log(`Total after:  ${countAfter}`);
  console.log(`Delta:        ${countAfter - countBefore}`);

  // Search for A (upload only)
  const resA = await searchByName(nameA);
  console.log(`\nSearch "${nameA}": ${resA.total} result(s)`);
  if (resA.material_infos?.[0]) {
    const m = resA.material_infos[0].base_info;
    console.log(`  material_id: ${m.material_id}`);
    console.log(`  url: ${m.image_url.slice(0, 80)}`);
    console.log(`  size: ${m.resolution.width}x${m.resolution.height}`);
  } else {
    console.log(`  NOT FOUND in material library`);
  }

  // Search for B (upload + create)
  const resB = await searchByName(nameB);
  console.log(`\nSearch "${nameB}": ${resB.total} result(s)`);
  if (resB.material_infos?.[0]) {
    const m = resB.material_infos[0].base_info;
    console.log(`  material_id: ${m.material_id}`);
    console.log(`  url: ${m.image_url.slice(0, 80)}`);
    console.log(`  size: ${m.resolution.width}x${m.resolution.height}`);
  } else {
    console.log(`  NOT FOUND in material library`);
  }

  // Also check if either appears in the recent list
  console.log(`\n=== Recent materials (first 5) ===`);
  const recent = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${oid}&call_platform=library`,
    { m_type: 2, metrics: [], is_lifetime: 1, order_field: "create_time", order_type: 1, keyword_type: 6, page: 1, page_size: 5, keyword: "", country: [], image_mode: [], placement_id: [], cost_lower: "", cost_upper: "", permission_type: [] },
    { headers: hdrs, timeout: 15000 }
  );
  const items = recent.data?.data?.material_infos || [];
  for (let i = 0; i < items.length; i++) {
    const m = items[i].base_info;
    const tagA = m.material_name.includes(nameA) ? " <-- A (upload only)" : "";
    const tagB = m.material_name.includes(nameB) ? " <-- B (upload+create)" : "";
    console.log(`  [${i}] ${m.material_name.slice(0, 40)} id=${m.material_id}${tagA}${tagB}`);
  }

  console.log("\nDone.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
