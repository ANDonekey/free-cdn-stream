import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import zlib from "zlib";
import embedPayload from "../embed.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sizeMb = Number(process.argv[2] || 1);
if (!Number.isFinite(sizeMb) || sizeMb <= 0) {
  throw new Error("Usage: node scripts/make-random-png.js <size-mb> [name]");
}

const name = process.argv[3] || `random-${sizeMb}m`;
const outDir = path.resolve(root, "test");
const binPath = path.join(outDir, `${name}.bin`);
const pngPath = path.join(outDir, `${name}.png`);
const bytes = Math.floor(sizeMb * 1024 * 1024);

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function extractITXtAll(pngBuf, prefix = "payload-") {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!pngBuf.slice(0, 8).equals(sig)) throw new Error("PNG signature invalid");

  let off = 8;
  const parts = [];
  while (off + 12 <= pngBuf.length) {
    const len = pngBuf.readUInt32BE(off);
    const type = pngBuf.slice(off + 4, off + 8).toString("ascii");
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    const crcEnd = dataEnd + 4;
    if (crcEnd > pngBuf.length) throw new Error("PNG truncated");

    if (type === "iTXt") {
      const data = pngBuf.slice(dataStart, dataEnd);
      let p = 0;
      const kwEnd = data.indexOf(0, p);
      const keyword = data.slice(p, kwEnd).toString("latin1");
      p = kwEnd + 1;
      const compFlag = data[p++];
      p++;
      const langEnd = data.indexOf(0, p);
      p = langEnd + 1;
      const transEnd = data.indexOf(0, p);
      p = transEnd + 1;

      if (keyword.startsWith(prefix)) {
        const idx = Number.parseInt(keyword.slice(prefix.length), 10);
        const textData = data.slice(p);
        const utf8 = compFlag === 1 ? zlib.inflateSync(textData) : textData;
        parts.push({ idx, utf8 });
      }
    }

    off = crcEnd;
  }

  parts.sort((a, b) => a.idx - b.idx);
  return Buffer.from(
    parts.map((part) => part.utf8.toString("utf8")).join(""),
    "base64"
  );
}

await fsp.mkdir(outDir, { recursive: true });
const payload = crypto.randomBytes(bytes);
await fsp.writeFile(binPath, payload);

const png = embedPayload(binPath);
await fsp.writeFile(pngPath, png);

const restored = extractITXtAll(png);
const result = {
  binPath,
  pngPath,
  binBytes: payload.length,
  pngBytes: png.length,
  restoredBytes: restored.length,
  binSha256: sha256(payload),
  restoredSha256: sha256(restored),
  localRoundTripOk: payload.equals(restored),
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.localRoundTripOk ? 0 : 1;
