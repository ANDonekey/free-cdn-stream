/**
 * Test: GET /api/v1/creative/detail/ (TikTok Marketing API)
 *
 * This endpoint requires OAuth 2.0 Access Token — not cookie auth.
 * Uses sandbox app credentials to obtain token, then tests the endpoint.
 *
 * Prerequisites:
 *   1. Sandbox app registered at https://developers.tiktok.com/
 *   2. You need the NUMERIC app_id from the developer console
 *      (NOT the client key string — app_id is a number like "1234567890123456789")
 *   3. The app must be authorized for the target advertiser account
 *
 * Usage:
 *   node scripts/test-creative-detail-api.js
 *   node scripts/test-creative-detail-api.js --app_id=1234567890123456789
 *   node scripts/test-creative-detail-api.js --access_token=xxx  (skip OAuth)
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));

// Sandbox credentials from user
const CLIENT_KEY = "sbawk7sjohx438emr7";
const CLIENT_SECRET = "owfkU8O3YUI6fIjiTP30ARFvfY36pkmu";

// These values must be set — app_id is from Developer Console, not from config
const APP_ID = cliArg("app_id", "");
const ACCESS_TOKEN = cliArg("access_token", "");
const ADVERTISER_ID = cfg.tiktok.aadvid || "7633135815273644049";
const CREATIVE_ID = cliArg("creative_id", "");

// TikTok Marketing API base
const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";
const REDIRECT_URI = "http://localhost:8765/callback";
const REDIRECT_PORT = 8765;

function cliArg(name, fallback) {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

// ================================================================
// Step 0: Find app_id candidates
// ================================================================
function findAppIdCandidates() {
  const candidates = [];
  // From config
  if (cfg.tiktok.aadvid) candidates.push({ value: cfg.tiktok.aadvid, source: "config.aadvid" });
  if (cfg.tiktok.org_id) candidates.push({ value: cfg.tiktok.org_id, source: "config.org_id" });
  // Derive from client_key (some platforms encode app_id in the key)
  // TikTok client keys are usually random strings, not derived from app_id
  return candidates;
}

// ================================================================
// Step 1: OAuth — get authorization_code via browser
// ================================================================
async function getAuthCode(appId) {
  const scopes = ["user_info", "ads_management", "creative_management"];
  const scopeParam = JSON.stringify(scopes);
  const authUrl = [
    `${API_BASE}/oauth2/authorize/`,
    `?app_id=${appId}`,
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
    `&state=${Date.now()}`,
    `&scope=${encodeURIComponent(scopeParam)}`,
  ].join("");

  console.log("\n=== OAuth Authorization Required ===");
  console.log(`App ID: ${appId}`);
  console.log(`Client Key: ${CLIENT_KEY}`);
  console.log(`\nOpen this URL in your browser:\n`);
  console.log(authUrl);
  console.log(`\nAfter authorization, you'll be redirected to ${REDIRECT_URI}?auth_code=XXXXX&state=...`);
  console.log(`Copy the "auth_code" value from the redirect URL.\n`);

  // Start a local HTTP server to catch the redirect automatically
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      const code = url.searchParams.get("auth_code");
      const state = url.searchParams.get("state");

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h1>Authorization successful!</h1><p>You can close this window now.</p></body></html>");
        server.close();
        resolve(code);
      } else {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body><h1>Error</h1><pre>${JSON.stringify(Object.fromEntries(url.searchParams), null, 2)}</pre></body></html>`);
        server.close();
        reject(new Error("No auth_code in redirect. URL params: " + JSON.stringify(Object.fromEntries(url.searchParams))));
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Listening on http://localhost:${REDIRECT_PORT}/callback for the redirect...`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for OAuth redirect (5 minutes)"));
    }, 300000);
  });
}

// ================================================================
// Step 2: Exchange auth_code for access_token
// ================================================================
async function exchangeToken(appId, authCode) {
  console.log(`\n=== Exchanging auth_code for access_token ===`);
  console.log(`app_id: ${appId}`);
  console.log(`auth_code: ${authCode.slice(0, 20)}...`);

  const body = {
    app_id: String(appId),
    secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    auth_code: authCode,
  };

  const r = await axios.post(`${API_BASE}/oauth2/access_token/`, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log(`HTTP ${r.status}`);
  console.log(`Response: ${JSON.stringify(r.data, null, 2).slice(0, 500)}`);

  if (r.data?.code === 0 && r.data?.data?.access_token) {
    console.log(`\n✓ Got access_token!`);
    return r.data.data;
  }

  return r.data;
}

// ================================================================
// Step 3: Call creative/detail/
// ================================================================
async function callCreativeDetail(accessToken, advertiserId, creativeId) {
  console.log(`\n=== Testing GET /open_api/v1.3/creative/detail/ ===`);
  console.log(`advertiser_id: ${advertiserId}`);
  console.log(`creative_id: ${creativeId || "(not provided — need a real creative ID)"}`);

  if (!creativeId) {
    console.log(`\n⚠ No creative_id provided. First, list creatives to find one...`);
    // Try listing creatives first
    const listBody = {
      advertiser_id: String(advertiserId),
      page: 1,
      page_size: 10,
      fields: ["creative_id", "creative_name", "creative_type", "image_id", "video_id"],
    };
    const listR = await axios.get(
      `${API_BASE}/creative/list/?${new URLSearchParams(listBody)}`,
      {
        headers: { "Access-Token": accessToken },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    console.log(`Creative list: HTTP ${listR.status} ${JSON.stringify(listR.data).slice(0, 500)}`);

    const firstCreative = listR.data?.data?.creatives?.[0];
    if (!firstCreative) {
      console.log("No creatives found in this advertiser account.");
      return null;
    }
    creativeId = firstCreative.creative_id;
    console.log(`Using creative_id: ${creativeId} (${firstCreative.creative_name})`);
  }

  // Now call detail
  const params = {
    advertiser_id: String(advertiserId),
    creative_id: String(creativeId),
    fields: JSON.stringify(["creative_id", "creative_name", "creative_type", "video_id", "image_id", "play_url", "image_url", "width", "height", "create_time"]),
  };

  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/creative/detail/?${qs}`;

  console.log(`\nRequest: GET ${url}`);
  const r = await axios.get(url, {
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log(`HTTP ${r.status}`);
  console.log(`Response: ${JSON.stringify(r.data, null, 2).slice(0, 2000)}`);

  return r.data;
}

// ================================================================
// Step 4: Try client_credentials as fallback
// ================================================================
async function tryClientCredentials(appId) {
  console.log(`\n=== Trying client_credentials grant (fallback) ===`);

  const body = {
    app_id: String(appId),
    secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  };

  const r = await axios.post(`${API_BASE}/oauth2/access_token/`, body, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log(`HTTP ${r.status}`);
  console.log(`Response: ${JSON.stringify(r.data, null, 2).slice(0, 500)}`);

  if (r.data?.code === 0 && r.data?.data?.access_token) {
    return r.data.data;
  }
  return null;
}

// ================================================================
// Main
// ================================================================
async function main() {
  console.log("=".repeat(70));
  console.log("TikTok Marketing API — Creative Detail Test");
  console.log("=".repeat(70));
  console.log(`Client Key:    ${CLIENT_KEY}`);
  console.log(`Client Secret: ${CLIENT_SECRET.slice(0, 8)}...`);
  console.log(`Advertiser ID: ${ADVERTISER_ID}`);
  console.log();

  let appId = APP_ID;
  let accessToken = ACCESS_TOKEN;

  // If access_token already provided, skip OAuth and go straight to API test
  if (accessToken) {
    console.log("Using provided access_token, skipping OAuth.");
    await callCreativeDetail(accessToken, ADVERTISER_ID, CREATIVE_ID);
    return;
  }

  // If app_id not provided, try candidates
  if (!appId) {
    console.log("No --app_id provided. Trying candidates from config...\n");
    const candidates = findAppIdCandidates();

    for (const c of candidates) {
      console.log(`Trying app_id=${c.value} (source: ${c.source})...`);
      const tokenResult = await tryClientCredentials(c.value);
      if (tokenResult) {
        console.log(`\n✓ client_credentials worked with app_id=${c.value}!`);
        appId = c.value;
        accessToken = tokenResult.access_token;
        break;
      }
      // Also try authorization_code with a dummy code to see error
      const r = await axios.post(`${API_BASE}/oauth2/access_token/`, {
        app_id: String(c.value),
        secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        auth_code: "test_probe",
      }, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
        validateStatus: () => true,
      });

      const errMsg = r.data?.msg || r.data?.message || "";
      console.log(`  Probe response: code=${r.data?.code} msg="${errMsg}"`);

      if (errMsg.includes("secret") && errMsg.includes("incorrect")) {
        console.log(`  → app_id ${c.value}: SECRET MISMATCH — not the right app for these credentials`);
      } else if (errMsg.includes("app_id") && errMsg.includes("not exist")) {
        console.log(`  → app_id ${c.value}: APP DOES NOT EXIST`);
      } else if (errMsg.includes("auth_code")) {
        console.log(`  → app_id ${c.value}: VALID APP — just needs real auth_code from browser OAuth`);
        appId = c.value;
        break;
      }
    }

    if (!appId) {
      console.log("\n" + "=".repeat(70));
      console.log("Could not auto-discover the numeric app_id.");
      console.log("\nTo find your app_id:");
      console.log("  1. Go to https://developers.tiktok.com/");
      console.log("  2. Log in and open your sandbox app");
      console.log("  3. The numeric App ID is shown on the app's detail page");
      console.log("  4. Then re-run: node scripts/test-creative-detail-api.js --app_id=YOUR_NUMERIC_APP_ID");
      console.log("\nAlternatively, if you can generate a test access token directly");
      console.log("from the developer console, pass it with --access_token=XXX");
      console.log("=".repeat(70));

      // Ask for manual input
      console.log("\nIf you know the numeric app_id, re-run with --app_id=<number>");
      console.log("Or if this is a sandbox app that requires a different auth flow,");
      console.log("check the TikTok Developer docs for sandbox-specific instructions.");
      process.exit(1);
    }
  }

  // If we got here with appId but no token yet, do the browser OAuth flow
  if (!accessToken) {
    console.log(`\nUsing app_id: ${appId}`);
    console.log("Need to complete browser-based OAuth authorization_code flow...");

    try {
      const authCode = await getAuthCode(appId);
      const tokenData = await exchangeToken(appId, authCode);

      if (tokenData?.access_token) {
        accessToken = tokenData.access_token;
        console.log(`Access Token: ${accessToken.slice(0, 20)}...`);
        if (tokenData.refresh_token) {
          console.log(`Refresh Token: ${tokenData.refresh_token.slice(0, 20)}...`);
        }
        if (tokenData.expires_in) {
          console.log(`Expires in: ${tokenData.expires_in}s (${(tokenData.expires_in / 3600).toFixed(1)}h)`);
        }
      } else {
        console.error("Failed to get access_token from exchange.");
        console.error(JSON.stringify(tokenData, null, 2));
        process.exit(1);
      }
    } catch (err) {
      console.error("OAuth flow failed:", err.message);
      process.exit(1);
    }
  }

  // Finally, test the creative/detail endpoint
  await callCreativeDetail(accessToken, ADVERTISER_ID, CREATIVE_ID);

  console.log("\nDone.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
