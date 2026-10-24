import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import zlib from "zlib";
import crypto from "crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const argValue = (name, fallback) => {
  const prefix = `${name}=`;
  const hit = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const playlistPath = path.resolve(
  root,
  argValue("--playlist", "outputs/demo/master.m3u8")
);
const configPath = path.resolve(root, "config.json");
const uploadFileArg = argValue("--file", "");
const compareUrl = argValue("--url", "");
const cdnOnly = args.has("--cdn-only");
const uploadOnly = args.has("--upload-only");
const keepTemp = args.has("--keep-temp");

const statusIcon = {
  ok: "OK",
  fail: "FAIL",
  skip: "SKIP",
};

function log(status, message) {
  console.log(`[${statusIcon[status]}] ${message}`);
}

function extractUrlsFromPlaylist(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line));
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function describePng(buf) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const pngSig = buf.slice(0, 8).equals(signature);
  const result = { pngSig, chunks: [], trailingBytes: 0 };
  if (!pngSig) return result;

  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString("ascii");
    const start = off + 8;
    const end = start + len;
    if (end + 4 > buf.length) break;
    const data = buf.slice(start, end);
    result.chunks.push(`${type}:${len}`);
    if (type === "IHDR") {
      result.width = data.readUInt32BE(0);
      result.height = data.readUInt32BE(4);
      result.bitDepth = data[8];
      result.colorType = data[9];
    }
    off = end + 4;
    if (type === "IEND") {
      result.trailingBytes = buf.length - off;
      break;
    }
  }
  return result;
}

async function requestUrl(url) {
  const head = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
    headers: { "user-agent": "free-cdn-stream-smoke-test/1.0" },
  }).catch((error) => ({ error }));

  if (!head.error && head.ok) {
    return {
      ok: true,
      method: "HEAD",
      status: head.status,
      type: head.headers.get("content-type") || "",
      length: head.headers.get("content-length") || "",
    };
  }

  const get = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      range: "bytes=0-31",
      "user-agent": "free-cdn-stream-smoke-test/1.0",
    },
  }).catch((error) => ({ error }));

  if (get.error) {
    return {
      ok: false,
      method: "GET",
      error: get.error.message,
      headStatus: head.status,
    };
  }

  return {
    ok: get.ok,
    method: "GET",
    status: get.status,
    type: get.headers.get("content-type") || "",
    length: get.headers.get("content-length") || "",
    headStatus: head.status,
  };
}

async function testCdnUrls() {
  if (!fs.existsSync(playlistPath)) {
    log("skip", `CDN check skipped: playlist not found at ${playlistPath}`);
    return false;
  }

  const playlist = await fsp.readFile(playlistPath, "utf8");
  const urls = extractUrlsFromPlaylist(playlist);
  if (urls.length === 0) {
    log("skip", `CDN check skipped: no absolute URLs in ${playlistPath}`);
    return false;
  }

  console.log(`\nCDN fetch check (${urls.length} URL(s), sampling first 3)`);
  let passed = true;
  for (const url of urls.slice(0, 3)) {
    const result = await requestUrl(url);
    const shortUrl = url.length > 110 ? `${url.slice(0, 107)}...` : url;
    if (result.ok) {
      log(
        "ok",
        `${result.method} ${result.status} ${result.type || "unknown-type"} ${shortUrl}`
      );
    } else {
      passed = false;
      log(
        "fail",
        `${result.method} ${result.status || result.error || "request failed"} ${shortUrl}`
      );
    }
  }

  return passed;
}

async function readConfig() {
  if (!fs.existsSync(configPath)) {
    return { ok: false, reason: `missing ${configPath}` };
  }

  const config = JSON.parse(await fsp.readFile(configPath, "utf8"));
  if (!config.tiktok?.org_id || !config.tiktok?.cookie) {
    return {
      ok: false,
      reason: "config.json must include tiktok.org_id and tiktok.cookie",
    };
  }

  return { ok: true, config };
}

async function makeTinyPng() {
  if (uploadFileArg) return path.resolve(root, uploadFileArg);

  const dir = path.resolve(root, ".tmp");
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `tiktok-smoke-${Date.now()}.png`);
  await fsp.writeFile(filePath, makeTransparentPng());
  return filePath;
}

function crc32(bytes) {
  let c = ~0 >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  return Buffer.concat([
    u32be(data.length),
    typeBuf,
    data,
    u32be(crc32(Buffer.concat([typeBuf, data]))),
  ]);
}

function makeTransparentPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.from([0, 0, 0, 0, 0]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function testUpload() {
  const configState = await readConfig();
  if (!configState.ok) {
    log("skip", `Upload check skipped: ${configState.reason}`);
    return false;
  }

  const uploadPath = await makeTinyPng();
  if (!fs.existsSync(uploadPath)) {
    log("fail", `Upload file does not exist: ${uploadPath}`);
    return false;
  }

  console.log(`\nTikTok upload check (${path.basename(uploadPath)})`);
  try {
    const { uploadToTiktok } = await import("../uploader.js");
    const imgURL = await uploadToTiktok(uploadPath);
    const origin = configState.config.tiktok.orgin_link || "";
    const fullUrl = /^https?:\/\//i.test(imgURL) ? imgURL : `${origin}${imgURL}`;
    log("ok", `upload returned web_uri: ${imgURL}`);

    if (origin) {
      const result = await requestUrl(fullUrl);
      if (result.ok) {
        log("ok", `uploaded CDN fetch ${result.method} ${result.status} ${result.type || "unknown-type"}`);
      } else {
        log("fail", `uploaded CDN fetch failed: ${result.status || result.error || "request failed"}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    const response = error.response;
    if (response) {
      log(
        "fail",
        `upload failed: HTTP ${response.status} ${JSON.stringify(response.data).slice(0, 500)}`
      );
    } else {
      log("fail", `upload failed: ${error.message}`);
    }
    return false;
  } finally {
    if (!uploadFileArg && !keepTemp) {
      await fsp.rm(uploadPath, { force: true }).catch(() => {});
    }
  }
}

async function compareRemoteFile() {
  if (!uploadFileArg || !compareUrl) return true;

  const filePath = path.resolve(root, uploadFileArg);
  if (!fs.existsSync(filePath)) {
    log("fail", `Compare file does not exist: ${filePath}`);
    return false;
  }

  console.log(`\nRemote file compare (${path.basename(filePath)})`);
  const local = await fsp.readFile(filePath);
  const res = await fetch(compareUrl, { redirect: "follow" }).catch((error) => ({
    error,
  }));

  if (res.error) {
    log("fail", `remote fetch failed: ${res.error.message}`);
    return false;
  }

  const remote = Buffer.from(await res.arrayBuffer());
  const localPng = describePng(local);
  const remotePng = describePng(remote);

  console.log(
    JSON.stringify(
      {
        status: res.status,
        contentType: res.headers.get("content-type"),
        localBytes: local.length,
        remoteBytes: remote.length,
        localSha256: sha256(local),
        remoteSha256: sha256(remote),
        byteIdentical: local.equals(remote),
        localPng,
        remotePng,
      },
      null,
      2
    )
  );

  if (!res.ok) {
    log("fail", `remote returned HTTP ${res.status}`);
    return false;
  }

  if (local.equals(remote)) {
    log("ok", "remote file is byte-identical to local file");
    return true;
  }

  if (localPng.trailingBytes > 0 && remotePng.trailingBytes === 0) {
    log("fail", "remote PNG lost local trailing bytes after IEND");
    return false;
  }

  log("fail", "remote file differs from local file");
  return false;
}

console.log("TikTok smoke test");
console.log(`Root: ${root}`);

let ok = true;
if (compareUrl) {
  ok = (await compareRemoteFile()) && ok;
} else {
  if (!uploadOnly) ok = (await testCdnUrls()) && ok;
  if (!cdnOnly) ok = (await testUpload()) && ok;
}

console.log(`\nResult: ${ok ? "PASS" : "CHECK OUTPUT"}`);
process.exitCode = ok ? 0 : 1;
