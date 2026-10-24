/**
 * Test: getMaterialDetail — fetch single/batch material detail by ID.
 *
 * Usage:
 *   node scripts/test-material-detail-api.js
 *   node scripts/test-material-detail-api.js --id=7633337156753719312
 *   node scripts/test-material-detail-api.js --ids=7633337156753719312,7633329517117276161
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cliArgs() {
  const a = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const k = arg.slice(2, eq === -1 ? undefined : eq);
    let v = eq === -1 ? true : arg.slice(eq + 1);
    if (v.includes(",")) v = v.split(",").map(s => s.trim());
    a[k] = v;
  }
  return a;
}

async function main() {
  const cli = cliArgs();

  // Import the function from uploader.js (ESM import)
  const { getMaterialDetail, listMaterials } = await import("../uploader.js");

  // If no IDs given, auto-discover from the first page of list
  let ids = cli.ids || (cli.id ? [cli.id] : null);
  if (!ids) {
    console.log("No --ids provided, discovering from first 3 materials...\n");
    const list = await listMaterials({ page: 1, pageSize: 3, isLifetime: true });
    ids = list.material_infos.slice(0, 3).map(m => m.base_info.material_id);
    console.log("Discovered IDs:", ids.join(", "));
  }

  console.log("\n" + "=".repeat(70));
  console.log(`getMaterialDetail(${ids.length} IDs)`);
  console.log("=".repeat(70));

  // Test 1: single ID
  if (ids.length >= 1) {
    console.log("\n--- Test 1: single material_id ---");
    const result = await getMaterialDetail(ids[0]);
    console.log(JSON.stringify(result[0], null, 2));
  }

  // Test 2: batch
  if (ids.length > 1) {
    console.log(`\n--- Test 2: batch (${ids.length} IDs) ---`);
    const results = await getMaterialDetail(ids);
    for (const r of results) {
      console.log(`  ${r.material_id}  ${r.width}x${r.height}  ${r.material_name}`);
    }
  }

  // Test 3: by file_id
  console.log("\n--- Test 3: by file_id ---");
  {
    const list = await listMaterials({ page: 1, pageSize: 3, isLifetime: true });
    const fileId = list.material_infos[0]?.base_info?.file_id;
    if (fileId) {
      const result = await getMaterialDetail(fileId);
      console.log(`Looked up file_id=${fileId}:`);
      console.log(`  material_id=${result[0]?.material_id}  name=${result[0]?.material_name}  MATCH=${result.length > 0 ? 'YES' : 'NO'}`);
    }
  }

  // Test 4: non-existent ID
  console.log("\n--- Test 4: non-existent ID ---");
  {
    const result = await getMaterialDetail("9999999999999999999");
    console.log(`Returned: ${result.length} items (expected 0)`);
  }

  console.log("\nDone.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
