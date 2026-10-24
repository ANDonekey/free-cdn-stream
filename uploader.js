import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import { basenameNoExt } from "./util.js";
import appConfig from "./config.js";

const REQUEST_TIMEOUT_MS = Number(process.env.TIKTOK_TIMEOUT_MS || 60000);

function cookieValue(name) {
  const cookie = appConfig.tiktok.cookie || "";
  const part = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

function csrfToken() {
  return (
    appConfig.tiktok.csrf_token ||
    cookieValue("csrftoken") ||
    cookieValue("tt_csrf_token") ||
    "38o6tIpLYKxAsDj6JFZK25w4FMNgtH8H"
  );
}

function businessHeaders(extra = {}) {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language":
      "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,es-US;q=0.6,es;q=0.5,fr-FR;q=0.4,fr;q=0.3,mt;q=0.2",
    "cache-control": "no-cache",
    origin: "https://business.tiktok.com",
    pragma: "no-cache",
    referer: `https://business.tiktok.com/manage/material/image?org_id=${appConfig.tiktok.org_id}`,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0",
    "x-csrftoken": csrfToken(),
    Cookie: appConfig.tiktok.cookie,
    ...extra,
  };
}

async function createImage(fileUrl, fileName) {
  let data = JSON.stringify({
    web_uri: fileUrl,
    original_web_uri: fileUrl,
    name: fileName,
    show_error: false,
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: `https://business.tiktok.com/api/v3/bm/material/image/create/?org_id=${appConfig.tiktok.org_id}`,
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language":
        "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,es-US;q=0.6,es;q=0.5,fr-FR;q=0.4,fr;q=0.3,mt;q=0.2",
      "cache-control": "no-cache",
      "content-type": "application/json",
      origin: "https://business.tiktok.com",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: `https://business.tiktok.com/manage/material/image?org_id=${appConfig.tiktok.org_id}`,
      "sec-ch-ua":
        '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "trace-log-adv-id": "",
      "trace-log-user-id": "",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "x-csrftoken": csrfToken(),
      Cookie: appConfig.tiktok.cookie,
    },
    timeout: REQUEST_TIMEOUT_MS,
    data: data,
  };

  const response = await axios.request(config);

  return response.data;
}

export async function shareMaterial(
  shareTo = appConfig.tiktok.share_to,
  filter = {}
) {
  if (!shareTo) {
    throw new Error(
      "shareTo is required. Pass it as an argument or set tiktok.share_to in config.json"
    );
  }

  // Fetch material list via API
  const listResult = await listMaterials(filter);
  const materials = listResult.material_infos;

  if (!materials || materials.length === 0) {
    throw new Error("No materials found to share");
  }

  const targets = Array.isArray(shareTo) ? shareTo : [shareTo];
  const data = {
    material_list: materials.map((m) => ({
      id: String(m.base_info.file_id),
      material_type: 2,
    })),
    share_to: targets.map((target) => ({
      tenant_type: Number(target.tenant_type),
      tenant_id: String(target.tenant_id),
    })),
  };

  const response = await axios.request({
    method: "post",
    maxBodyLength: Infinity,
    url: `https://business.tiktok.com/api/v3/bm/material/share/?org_id=${appConfig.tiktok.org_id}`,
    headers: businessHeaders({ "content-type": "application/json" }),
    timeout: REQUEST_TIMEOUT_MS,
    data,
  });

  const respData = response.data;
  if (respData?.code !== 0) {
    throw new Error(
      `TikTok share failed: ${JSON.stringify(respData).slice(0, 1000)}`
    );
  }

  return respData;
}

/**
 * List materials from TikTok Business material library.
 * Full API reference: docs/tiktok-material-api.md
 *
 * @param {Object} opts - Query options
 * @param {number} opts.page - Page number (default: 1)
 * @param {number} opts.pageSize - Items per page (default: 20)
 * @param {number} opts.mType - Material type, 2=image (default: 2)
 * @param {string} opts.keyword - Search keyword
 * @param {string} opts.startDate - Start date YYYY-MM-DD
 * @param {string} opts.endDate - End date YYYY-MM-DD
 * @param {string} opts.orderField - Sort field (default: "create_time")
 * @param {number} opts.orderType - Sort order 1=DESC 2=ASC (default: 1)
 * @returns {Promise<{material_infos:Array, total:number, page:number, page_size:number}>}
 */
export async function listMaterials(opts = {}) {
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const body = {
    m_type: opts.mType ?? 2,
    metrics: [],
    is_lifetime: opts.isLifetime ? 1 : 0,
    st: opts.startDate || defaultStart,
    et: opts.endDate || defaultEnd,
    order_field: opts.orderField || "create_time",
    order_type: opts.orderType ?? 1,
    keyword_type: 6,
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 20,
    keyword: opts.keyword || "",
    country: [],
    image_mode: [],
    placement_id: [],
    cost_lower: "",
    cost_upper: "",
    permission_type: [],
  };

  const response = await axios.request({
    method: "post",
    maxBodyLength: Infinity,
    url: `https://business.tiktok.com/api/v3/bm/material/list/?org_id=${appConfig.tiktok.org_id}&call_platform=library`,
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language":
        "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,es-US;q=0.6,es;q=0.5,fr-FR;q=0.4,fr;q=0.3,mt;q=0.2",
      "cache-control": "no-cache",
      "content-type": "application/json",
      origin: "https://business.tiktok.com",
      pragma: "no-cache",
      referer: `https://business.tiktok.com/manage/material/image?org_id=${appConfig.tiktok.org_id}`,
      "sec-ch-ua":
        '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "trace-log-adv-id": "",
      "trace-log-user-id": "",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "x-csrftoken": csrfToken(),
      Cookie: appConfig.tiktok.cookie,
    },
    timeout: REQUEST_TIMEOUT_MS,
    data: body,
  });

  const respData = response.data;
  if (respData?.code !== 0) {
    throw new Error(
      `TikTok material list failed: ${JSON.stringify(respData).slice(0, 1000)}`
    );
  }

  return respData.data;
}

/**
 * Get detail for one or more materials by material_id.
 *
 * TikTok has no dedicated GET/POST detail endpoint. This wraps the list API
 * and filters client-side. Keyword search by material_name is used as an
 * optimization when names are known.
 *
 * Full API reference: docs/tiktok-material-api.md
 *
 * @param {string|string[]} materialIds - Single material_id or array of them
 * @param {Object} opts - Optional extra params (keyword, pageSize hint, etc.)
 * @returns {Promise<Array>} - Array of {material_id, url, width, height, create_time, ...}
 */
export async function getMaterialDetail(materialIds, opts = {}) {
  const ids = Array.isArray(materialIds) ? materialIds : [materialIds];
  if (ids.length === 0) return [];

  const pageSize = opts.pageSize ?? 50;

  // Fetch all materials (is_lifetime=1 to bypass date filter), then filter
  const all = await listMaterials({
    page: 1,
    pageSize: Math.max(pageSize, ids.length),
    keyword: opts.keyword || "",
    mType: 2,
    orderField: "create_time",
    orderType: 1,
    isLifetime: true,
  });

  const materials = all.material_infos || [];
  const idSet = new Set(ids);
  const matched = materials.filter((m) => {
    const info = m.base_info || m;
    return idSet.has(info.material_id) || idSet.has(info.file_id);
  });

  // Map to the flat output format
  return matched.map((m) => {
    const info = m.base_info || m;
    return {
      material_id: info.material_id,
      file_id: info.file_id,
      url: info.image_url || "",
      width: info.resolution?.width ?? 0,
      height: info.resolution?.height ?? 0,
      create_time: info.create_time,
      material_name: info.material_name || "",
      permission_type: info.permission_type,
    };
  });
}

/**
 * Get material CDN links from ads.tiktok.com statistics API
 * Returns full image_url (CDN) for each material — the final shareable link
 * @param {Object} opts - Same filter options as listMaterials
 * @returns {Promise<{material_infos:Array, total:number}>}
 */
export async function getMaterialLinks(opts = {}) {
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const body = {
    m_type: opts.mType ?? 2,
    source: [],
    metrics: ["stat_cost", "cpm", "show_cnt", "click_cnt", "ctr", "cpc"],
    is_lifetime: 0,
    st: opts.startDate || defaultStart,
    et: opts.endDate || defaultEnd,
    order_field: opts.orderField || "create_time",
    order_type: opts.orderType ?? 1,
    page: opts.page ?? 1,
    page_size: opts.pageSize ?? 20,
    keyword: opts.keyword || "",
    keyword_type: 6,
    country: [],
    image_mode: [],
    placement_id: [],
    permission_type: [],
  };

  const response = await axios.request({
    method: "post",
    maxBodyLength: Infinity,
    url: `https://ads.tiktok.com/api/v3/i18n/statistics/material/list/?aadvid=${appConfig.tiktok.aadvid}`,
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language":
        "zh-CN,zh;q=0.9,zh-TW;q=0.8,zh-HK;q=0.7,en-US;q=0.6,en;q=0.5",
      "cache-control": "no-cache",
      "content-type": "application/json",
      origin: "https://ads.tiktok.com",
      pragma: "no-cache",
      referer: `https://ads.tiktok.com/i18n/creative-library/own/image?aadvid=${appConfig.tiktok.aadvid}`,
      "sec-ch-ua":
        '"Google Chrome";v="143", "Not?A_Brand";v="8", "Chromium";v="143"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      "x-csrftoken": csrfToken(),
      Cookie: appConfig.tiktok.cookie,
    },
    timeout: REQUEST_TIMEOUT_MS,
    data: body,
  });

  const respData = response.data;
  if (respData?.code !== 0) {
    throw new Error(
      `TikTok material links failed: ${JSON.stringify(respData).slice(0, 1000)}`
    );
  }

  return respData.data;
}

/**
 * Check share status of a material (which tenants it's been shared to)
 * @param {string} fileId - The material's file_id
 * @returns {Promise<{share_info: Array, total: number}>}
 */
export async function getShareList(fileId) {
  const body = {
    file_id: fileId,
    type: "ad_accounts",
    page: 1,
    page_size: 20,
    business_source: 10022,
  };

  const response = await axios.request({
    method: "post",
    maxBodyLength: Infinity,
    url: `https://business.tiktok.com/api/v3/bm/material/share/list/?org_id=${appConfig.tiktok.org_id}`,
    headers: businessHeaders({ "content-type": "application/json" }),
    timeout: REQUEST_TIMEOUT_MS,
    data: body,
  });

  const respData = response.data;
  if (respData?.code !== 0) {
    throw new Error(
      `TikTok share list failed: ${JSON.stringify(respData).slice(0, 1000)}`
    );
  }

  return respData.data;
}

export async function uploadToTiktok(filePath) {
  let data = new FormData();
  data.append("Filedata", fs.createReadStream(filePath));

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: `https://business.tiktok.com/api/v3/bm/material/image/upload/?org_id=${appConfig.tiktok.org_id}`,
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language":
        "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7,es-US;q=0.6,es;q=0.5,fr-FR;q=0.4,fr;q=0.3,mt;q=0.2",
      "cache-control": "no-cache",
      origin: "https://business.tiktok.com",
      pragma: "no-cache",
      priority: "u=1, i",
      referer: `https://business.tiktok.com/manage/material/image?org_id=${appConfig.tiktok.org_id}`,
      "sec-ch-ua":
        '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "trace-log-adv-id": "",
      "trace-log-user-id": "",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      Cookie: appConfig.tiktok.cookie,
      ...data.getHeaders(),
    },
    timeout: REQUEST_TIMEOUT_MS,
    data: data,
  };

  const response = await axios.request(config);
  const respData = response.data;
  if (!respData?.data?.image_info?.web_uri) {
    throw new Error(
      `TikTok upload did not return web_uri: ${JSON.stringify(respData).slice(
        0,
        1000
      )}`
    );
  }
  const imgUrl = respData.data.image_info.web_uri;

  const name = basenameNoExt(filePath);
  await createImage(imgUrl, name);

  return imgUrl;
}
