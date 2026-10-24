/**
 * Verify: is the CDN file byte-identical to the original upload?
 * Generates a unique PNG, uploads, creates, then downloads from CDN and compares SHA256.
 */
import axios from "axios";
import fs from "fs";
import crypto from "crypto";
import zlib from "zlib";
import FormData from "form-data";
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

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function crc32(data) {
  let c = ~0 >>> 0;
  for (let i = 0; i < data.length; i++) { c ^= data[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makeUniquePng(seed) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(64, 0); ihdrData.writeUInt32BE(64, 4);
  ihdrData[8] = 8; ihdrData[9] = 6; // RGBA
  const ihdr = pngChunk("IHDR", ihdrData);

  // Unique random pixels via HMAC-derived stream
  const rng = crypto.createHmac("sha256", String(seed)).digest();
  const pixels = Buffer.alloc(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = rng[i % rng.length] ^ (i & 0xff);

  const rowSize = 1 + 64 * 4;
  const raw = Buffer.alloc(64 * rowSize);
  for (let y = 0; y < 64; y++) {
    raw[y * rowSize] = 0; // filter=none
    pixels.copy(raw, y * rowSize + 1, y * 64 * 4, (y + 1) * 64 * 4);
  }
  const compressed = zlib.deflateSync(raw);
  const idat = pngChunk("IDAT", compressed);
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

async function main() {
  const seed = Date.now();
  const original = makeUniquePng(seed);
  const origHash = sha256(original);
  console.log(`Original PNG: ${original.length} bytes, SHA256=${origHash}`);

  const tmpDir = path.join(root, ".tmp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `hash-verify-${seed}.png`);
  fs.writeFileSync(tmpPath, original);

  // UPLOAD
  console.log("\n--- Upload ---");
  const form = new FormData();
  form.append("Filedata", fs.createReadStream(tmpPath), { filename: `hash-verify-${seed}.png` });
  const up = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/image/upload/?org_id=${oid}`,
    form,
    { headers: { ...upHdrs, ...form.getHeaders() }, timeout: 30000, validateStatus: () => true }
  );
  if (up.data?.code !== 0) { console.error("Upload failed:", JSON.stringify(up.data).slice(0, 400)); process.exit(1); }
  const webUri = up.data.data.image_info.web_uri;
  console.log(`web_uri: ${webUri}`);

  // CREATE
  console.log("\n--- Create ---");
  const testName = `hash-verify-${seed}`;
  const cr = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/image/create/?org_id=${oid}`,
    { web_uri: webUri, original_web_uri: webUri, name: testName, show_error: false },
    { headers: hdrs, timeout: 15000, validateStatus: () => true }
  );
  console.log(`code=${cr.data?.code}  file_id="${cr.data?.data?.file_id}"`);

  // Wait for propagation
  await new Promise(r => setTimeout(r, 3000));

  // LIST to get CDN URL
  console.log("\n--- List (get CDN URL) ---");
  const list = await axios.post(
    `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${oid}&call_platform=library`,
    { m_type: 2, metrics: [], is_lifetime: 1, order_field: "create_time", order_type: 1, keyword_type: 6, page: 1, page_size: 5, keyword: testName, country: [], image_mode: [], placement_id: [], cost_lower: "", cost_upper: "", permission_type: [] },
    { headers: hdrs, timeout: 15000 }
  );
  const material = list.data?.data?.material_infos?.[0]?.base_info;
  if (!material) { console.error("Material not found in list"); process.exit(1); }
  const cdnUrl = material.image_url;
  console.log(`material_name: ${material.material_name}`);
  console.log(`CDN URL: ${cdnUrl.slice(0, 130)}`);

  // DOWNLOAD from CDN
  console.log("\n--- Download from CDN ---");
  const dl = await fetch(cdnUrl);
  const cdnData = Buffer.from(await dl.arrayBuffer());
  const cdnHash = sha256(cdnData);
  console.log(`CDN file: ${cdnData.length} bytes, SHA256=${cdnHash}`);

  // COMPARE
  console.log("\n" + "=".repeat(60));
  console.log(`Original SHA256: ${origHash}`);
  console.log(`CDN SHA256:      ${cdnHash}`);
  const match = origHash === cdnHash;
  console.log(`MATCH:           ${match ? "YES - byte-identical" : "NO - files differ"}`);
  console.log(`Size:            ${original.length} vs ${cdnData.length} ${original.length === cdnData.length ? "(match)" : "(DIFFER)"}`);

  if (!match) {
    const minLen = Math.min(original.length, cdnData.length);
    for (let i = 0; i < minLen; i++) {
      if (original[i] !== cdnData[i]) {
        console.log(`\nFirst diff at byte ${i}: orig=0x${original[i].toString(16).padStart(2,"0")} cdn=0x${cdnData[i].toString(16).padStart(2,"0")}`);
        console.log(`Context (+-16):`);
        console.log(`  orig: ${original.slice(Math.max(0,i-16), Math.min(original.length,i+16)).toString("hex")}`);
        console.log(`  cdn:  ${cdnData.slice(Math.max(0,i-16), Math.min(cdnData.length,i+16)).toString("hex")}`);
        break;
      }
    }
  }

  fs.rmSync(tmpPath, { force: true });
  console.log("\nDone.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
