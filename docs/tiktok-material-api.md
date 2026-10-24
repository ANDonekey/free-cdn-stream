# TikTok Business API — 素材/图片列表

> 最后验证日期: 2026-04-27  
> 测试脚本: `scripts/test-material-image-api.js`

---

## 端点发现结果

| 端点 | 方法 | 结果 |
|---|---|---|
| `/api/v3/bm/material/image/` | GET | **404** — 不存在 |
| `/api/v3/bm/material/image/` | POST | **404** — 不存在 |
| `/api/v3/bm/material/image/list/` | GET / POST | **404** — 不存在 |
| `/api/v3/bm/material/list/` | GET | **404** — 不存在 |
| **`/api/v3/bm/material/list/`** | **POST** | **200 ✓** — 唯一可用的素材列表接口 |
| `/api/v3/bm/material/detail/` | GET | **404** — 不存在 |
| `/api/v3/bm/material/detail/` | POST | **404** — 不存在 |
| `/api/v3/bm/material/info/` | GET / POST | **404** — 不存在 |
| `/api/v3/bm/material/read/` | GET / POST | **404** — 不存在 |
| `/api/v3/bm/material/query/` | GET / POST | **404** — 不存在 |
| `/api/v3/bm/file/detail/` | GET / POST | **404** — 不存在 |
| `/api/v3/bm/material/image/detail/` | GET / POST | **404** — 不存在 |
| `/api/v3/bm/material/image/info/` | POST | **404** — 不存在 |
| `/api/v3/i18n/statistics/material/detail/` | GET / POST | **404** — 不存在 |

**结论**: TikTok **没有** `GET /api/v3/bm/material/image/` 和 `GET /api/v3/bm/material/detail/` 端点。所有素材查询只能通过 `POST /api/v3/bm/material/list/` 实现，返回数据已包含 detail 所需的全部字段。

---

## 可用端点

```
POST https://business.tiktok.com/api/v3/bm/material/list/?org_id={org_id}&call_platform=library
```

### 必需 Headers

```js
{
  "accept": "application/json, text/plain, */*",
  "content-type": "application/json",
  "origin": "https://business.tiktok.com",
  "referer": "https://business.tiktok.com/manage/material/image?org_id={org_id}",
  "x-csrftoken": "{csrf_token}",
  "Cookie": "{full_cookie_string}"
}
```

CSRF token 从 cookie 中的 `csrftoken=` 字段提取。

---

## 请求参数完整参考

### Body (JSON)

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `m_type` | int | 是 | `2` | 素材类型: `2`=图片, `1`=视频 |
| `page` | int | 否 | `1` | 页码 |
| `page_size` | int | 否 | `20` | 每页条数 |
| `keyword` | string | 否 | `""` | 按素材名称模糊搜索 |
| `keyword_type` | int | 否 | `6` | 搜索类型（固定为 `6`） |
| `order_field` | string | 否 | `"create_time"` | 排序字段 |
| `order_type` | int | 否 | `1` | 排序方向: `1`=DESC, `2`=ASC |
| `st` | string | 否 | 7天前 | 开始日期 `YYYY-MM-DD` |
| `et` | string | 否 | 今天 | 结束日期 `YYYY-MM-DD` |
| `is_lifetime` | int | 否 | `0` | `1`=全部时间, `0`=按日期范围 |
| `permission_type` | int[] | 否 | `[]` | `[]`=全部, `[1]`=已启用, `[2]`=已停用 |
| `image_mode` | string[] | 否 | `[]` | 图片格式过滤（TikTok 内部枚举） |
| `country` | string[] | 否 | `[]` | 国家过滤 |
| `placement_id` | string[] | 否 | `[]` | 广告位过滤 |
| `metrics` | string[] | 否 | `[]` | 统计指标（通常为空） |
| `cost_lower` | string | 否 | `""` | 消耗下限 |
| `cost_upper` | string | 否 | `""` | 消耗上限 |

### Query String

| 参数 | 说明 |
|---|---|
| `org_id` | 组织 ID（从 Business Center 获取） |
| `call_platform` | 固定值 `library` |

---

## 参数映射对照表

将假想的 GET 查询参数映射到实际 POST body:

```
GET query param         →  POST body field        转换规则
───────────────────────────────────────────────────────────
org_id                  →  (query string)         直接拼接在 URL 上
page                    →  page                   相同
page_size               →  page_size              相同
keyword                 →  keyword                相同
material_ids            →  ❌ 不支持              需客户端自行过滤 base_info.file_id
filtering.status        →  permission_type        "ALL"→[]  "ENABLED"→[1]  "DISABLED"→[2]
filtering.format        →  image_mode             格式枚举待确认，通常留 []
filtering.width         →  ❌ 不支持              需客户端按 base_info.resolution.width 过滤
filtering.height        →  ❌ 不支持              需客户端按 base_info.resolution.height 过滤
order_by                →  order_field            "create_time" 直接映射
order_type              →  order_type             "DESC"→1  "ASC"→2
```

### 客户端过滤示例

```js
// API 不支持的字段需要在拿到结果后自行过滤
function filterClientSide(materials, filtering) {
  let list = materials;
  if (filtering.width != null) {
    list = list.filter(m => m.base_info.resolution.width === filtering.width);
  }
  if (filtering.height != null) {
    list = list.filter(m => m.base_info.resolution.height === filtering.height);
  }
  if (filtering.material_ids?.length) {
    const ids = new Set(filtering.material_ids);
    list = list.filter(m => ids.has(m.base_info.file_id) || ids.has(m.base_info.material_id));
  }
  return list;
}
```

---

## 响应结构

### 成功响应 (code: 0)

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "total": 19,
    "page": 1,
    "page_size": 5,
    "material_infos": [
      {
        "base_info": {
          "file_id": "7633332598953197585",
          "material_id": "7633337156753719312",
          "material_name": "random-1mv3",
          "material_cover": "",
          "duration": 0,
          "resolution": {
            "width": 64,
            "height": 64
          },
          "video_type": 0,
          "permission_type": 1,
          "create_time": "2026-04-27",
          "video_id": "",
          "image_url": "https://p19-ad-site-sign-sg.ibyteimg.com/ad-site-i18n-sg/20260427...",
          "add_on_id": "",
          "add_on_type": 0,
          "preview_info": "",
          "upload_account_id": "7633135778248982529",
          "upload_account_name": "黄化有限公司"
        }
      }
    ]
  }
}
```

### 关键字段说明

| 路径 | 类型 | 说明 |
|---|---|---|
| `data.total` | int | 素材总数 |
| `data.page` | int | 当前页码 |
| `data.page_size` | int | 每页条数 |
| `data.material_infos[].base_info.file_id` | string | 文件 ID（上传返回的 ID） |
| `data.material_infos[].base_info.material_id` | string | 素材 ID（共享等操作使用） |
| `data.material_infos[].base_info.material_name` | string | 素材名称 |
| `data.material_infos[].base_info.resolution` | object | `{width, height}` 像素尺寸 |
| `data.material_infos[].base_info.image_url` | string | CDN 图片链接（带签名，有过期时间） |
| `data.material_infos[].base_info.permission_type` | int | `1`=已启用, `2`=已停用 |
| `data.material_infos[].base_info.create_time` | string | 创建日期 `YYYY-MM-DD` |

---

## 验证过的测试用例

在 19 个素材的测试账号上验证（2026-04-27）:

| 测试 | 参数 | 返回 | 验证 |
|---|---|---|---|
| 默认列表 | `page=1, page_size=5, permission_type=[]` | 19 total, 5 items | ✓ |
| 仅启用 | `permission_type=[1]` | 18 total | ✓ (19-1=18) |
| 仅停用 | `permission_type=[2]` | 1 total | ✓ |
| 升序排列 | `order_type=2` (ASC) | 同默认但顺序相反 | ✓ |
| 分页第2页 | `page=2, page_size=3` | page=2, 3 items | ✓ |
| 关键词搜索 | `keyword="5481011c"` | 仅匹配素材 | ✓ (HAR 文件确认) |

---

## 素材详情查询 (Material Detail)

### 端点探测

15 种 URL/方法组合全部返回 **404**，TikTok 没有独立的素材详情端点。

### 替代方案

`POST /api/v3/bm/material/list/` 返回的 `material_infos[].base_info` 已包含详情所需的全部字段:

| 期望字段 | 来源路径 | 类型 | 说明 |
|---|---|---|---|
| `material_id` | `base_info.material_id` | string | 素材 ID |
| `url` | `base_info.image_url` | string | CDN 图片链接（带签名，有时效） |
| `width` | `base_info.resolution.width` | int | 图片宽度 |
| `height` | `base_info.resolution.height` | int | 图片高度 |
| `create_time` | `base_info.create_time` | string | 创建日期 `YYYY-MM-DD` |

### 按 ID 查询

API 不支持 `material_ids` 过滤参数（传入会被忽略）。`getMaterialDetail()` 通过拉取列表 + 客户端匹配实现:

- **按 `material_id` 匹配** — 支持
- **按 `file_id` 匹配** — 支持
- **按 `material_name` 关键词** — 支持（API 原生 keyword 搜索）

```js
import { getMaterialDetail } from "./uploader.js";

// 单个 ID
const [detail] = await getMaterialDetail("7633337156753719312");
// → { material_id, url, width: 64, height: 64, create_time: "2026-04-27", ... }

// 批量 ID
const results = await getMaterialDetail(["id1", "id2", "id3"]);
// → [{...}, {...}, {...}]

// 不存在的 ID 返回空数组
const empty = await getMaterialDetail("9999999999999999999");
// → []
```

---

## 项目内已有封装

### `listMaterials(opts)` — `uploader.js:157`

```js
import { listMaterials } from "./uploader.js";

const result = await listMaterials({
  page: 1,
  pageSize: 20,
  keyword: "random",
  startDate: "2026-04-20",
  endDate: "2026-04-27",
  orderField: "create_time",
  orderType: 1,         // 1=DESC, 2=ASC
});
// result = { material_infos: [...], total: 19, page: 1, page_size: 20 }
```

### `getMaterialDetail(materialIds, opts)` — `uploader.js:223`

根据 `material_id`（或 `file_id`）获取单个/批量素材详情。内部调用 `listMaterials` + 客户端 ID 匹配。返回扁平结构 `{material_id, url, width, height, create_time, ...}`。

### `getMaterialLinks(opts)` — `uploader.js:283`

从 `ads.tiktok.com` 的统计接口获取带 CDN 链接的素材列表。参数结构与 `listMaterials` 类似，但多出 `metrics`、`source` 等统计相关字段。

### `createImage(fileUrl, fileName)` — `uploader.js:48` (内部函数)

注册已上传的图片到素材库。由 `uploadToTiktok()` 在上传后自动调用。

### `uploadToTiktok(filePath)` — `uploader.js:378`

完整上传流程：上传文件 → 注册素材。返回 `web_uri`。

---

## 素材创建 (POST /api/v3/bm/material/image/create/)

### 端点发现

```
POST https://business.tiktok.com/api/v3/bm/material/image/create/?org_id={org_id}
```

此端点已在项目中使用。探测 5 种参数组合确认了完整参数集。

### 生命周期

```
upload (获取 web_uri) → create (注册) → list (获取 material_id + url)
```

create 是三步流程中的第二步，本身**不返回 `material_id` 或 `url`**。

### Body 参数

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `web_uri` | string | **是** | — | Upload 步骤返回的 URI 路径 |
| `name` | string | 否 | 上传文件名 | 素材显示名称 |
| `original_web_uri` | string | 否 | 同 `web_uri` | 原始 URI（通常与 web_uri 相同） |
| `show_error` | bool | 否 | `false` | 是否显示错误提示 |

缺失 `web_uri` 返回 HTTP 400 `"missing required parameter"`。`name` 可省略。额外字段（如 `file_id`、`width`）会被静默忽略。

### 响应

```json
{
  "data": { "file_id": "" },
  "code": 0,
  "msg": "success",
  "extra": { "i18n_key": "SUCCESS", "i18n_msg": true }
}
```

`data.file_id` **始终为空字符串** — 这是 TikTok API 的行为，不代表操作无效。

### create 的实际效果

A/B 测试证实（`scripts/test-create-effect.js`）:

- **只 upload 不 create** — 文件存储在 CDN，但**不会出现在素材库**中，list API 搜不到，无 `material_id`
- **upload + create** — 文件注册为素材库条目，出现在列表中，可通过 keyword 搜索到

**create 是将已上传文件注册为可见素材的必要步骤。** 不调用它，素材库中不会出现新条目。

### 获取 material_id + url（创建后）

```js
import { listMaterials } from "./uploader.js";

// 创建完成后，按名称搜索
const result = await listMaterials({
  keyword: "my-material-name",
  isLifetime: true,
  pageSize: 5,
});
const created = result.material_infos.find(
  m => m.base_info.material_name === "my-material-name"
);
// created.base_info.material_id  ← 素材 ID
// created.base_info.image_url    ← CDN 链接
```

### 参数映射（用户预期 vs 实际）

| 用户参数 | 实际字段 | 说明 |
|---|---|---|
| `org_id` | *(query string)* | 正确，URL 查询参数 |
| `file_id` | `web_uri` | **注意**: 不是 file_id，是 upload 返回的 URI |
| `name` | `name` | 相同 |

| 用户预期返回 | 实际来源 | 说明 |
|---|---|---|
| `material_id` | list API | create 不返回，需 list 查询 |
| `url` | list API | create 不返回，需 list 查询 |

---

## 配置要求 (`config.json`)

```json
{
  "tiktok": {
    "org_id": "7633135778248982529",
    "aadvid": "7633135815273644049",
    "cookie": "csrftoken=...; sessionid_ads=...; ...",
    "share_to": [
      {
        "tenant_type": 10022,
        "tenant_id": "7633135815273644049"
      }
    ]
  }
}
```

| 字段 | 来源 | 说明 |
|---|---|---|
| `org_id` | Business Center → Organization | URL 中的 `org_id` 参数 |
| `aadvid` | Ads Manager → 广告账号 | URL 中的 `aadvid` 参数 |
| `cookie` | 浏览器 DevTools → Network | 完整 cookie 字符串（含 csrftoken） |
| `share_to` | API 响应 | 共享目标账号列表 |

---

## 相关端点

| 方法 | 路径 | 用途 | 项目内函数 |
|---|---|---|---|
| POST | `/api/v3/bm/material/image/upload/` | 上传图片文件 (step 1/3) | `uploadToTiktok()` |
| POST | `/api/v3/bm/material/image/create/` | 注册图片 (step 2/3, 不返回 material_id) | `createImage()` |
| POST | `/api/v3/bm/material/list/` | 列出素材 (step 3/3, 获取 material_id+url) | `listMaterials()`, `getMaterialDetail()` |
| POST | `/api/v3/bm/material/share/` | 共享素材到广告账号 | `shareMaterial()` |
| POST | `/api/v3/bm/material/share/list/` | 查看共享列表 | `getShareList()` |
| POST | `/api/v3/i18n/statistics/material/list/` | 带统计数据的素材列表 | `getMaterialLinks()` |

---

## 创意详情 (GET /api/v1/creative/detail/)

### 端点发现

> 测试日期: 2026-04-28

| 探测范围 | 结果 |
|---|---|
| `ads.tiktok.com` × 20+ 路径变体 | 全部 404 |
| `business.tiktok.com` × 20+ 路径变体 | 全部 404 |
| `business-api.tiktok.com` × `/open_api/v1.{0-4}/creative/*` | 全部 404 |
| POST 变体 | 全部 404 |

**结论**: 此端点**不是** Business Center / Ads Manager 的 cookie 鉴权 API。它是 **TikTok Marketing API**（开放 API），需要 TikTok Developer App 的 OAuth 2.0 Access Token。

### 端点规范（基于 TikTok 公开文档推断）

```
GET https://business-api.tiktok.com/open_api/v1.3/creative/detail/
```

### 鉴权

| 方式 | 说明 |
|---|---|
| **类型** | OAuth 2.0 (Bearer Token) |
| **Header** | `Access-Token: {access_token}` |
| **获取** | 通过 TikTok Developer App (`app_id` + `app_secret`) 授权流程获取 |
| **注意** | Cookie + CSRF 鉴权**不适用**于此端点 |

### 请求参数（推测完整版）

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `advertiser_id` | string | **是** | 广告主 ID（等同于 `aadvid`） |
| `creative_id` | string | **是** | 创意 ID |
| `fields` | string[] | 否 | 指定返回字段，如 `[\"video_id\",\"image_id\",\"play_url\"]` |

### 响应字段（推测完整版）

| 字段 | 类型 | 说明 |
|---|---|---|
| `creative_id` | string | 创意 ID |
| `creative_name` | string | 创意名称 |
| `creative_type` | string | 类型: `IMAGE` / `VIDEO` |
| `video_id` | string | 视频素材 ID（视频创意） |
| `image_id` | string | 图片素材 ID（图片创意） |
| `play_url` | string | 视频播放 CDN 链接（带签名，有时效） |
| `image_url` | string | 图片 CDN 链接 |
| `width` | int | 素材宽度 |
| `height` | int | 素材高度 |
| `create_time` | string | 创建时间 |

### 当前项目中的替代方案

由于项目没有 Marketing API 凭据，相关数据可以通过 cookie 鉴权的端点获取:

| 需要的数据 | 替代来源 | 说明 |
|---|---|---|
| `image_id` + `image_url` | `POST /api/v3/bm/material/list/` | `base_info.material_id` + `base_info.image_url` |
| `video_id` | `POST /api/v3/bm/material/list/` (`m_type=1`) | `base_info.video_id`（需有视频素材） |
| `play_url` | **暂不可用** | 需要 Marketing API 获取视频播放链接 |
| `width` / `height` | `POST /api/v3/bm/material/list/` | `base_info.resolution` |

### 参数映射

| 用户预期参数 | Marketing API 参数 | 替代方案（Business API） |
|---|---|---|
| `advertiser_id` | `advertiser_id` (query) | `aadvid` / `org_id` (query) |
| `creative_id` | `creative_id` (query) | ❌ 无直接映射 — Business API 用 `material_id` |

| 用户预期返回 | Marketing API 返回 | 替代方案 |
|---|---|---|
| `video_id` | `data.video_id` | `base_info.video_id`（list API） |
| `image_id` | `data.image_id` | `base_info.material_id`（list API） |
| `play_url` | `data.play_url` | ❌ 不可用 — 需 Marketing API |

### 接入 Marketing API 的前提

1. 在 [TikTok Developer](https://developers.tiktok.com/) 创建 App
2. 通过 OAuth 2.0 授权流程获取 `access_token`（有效期通常 24h，可用 refresh_token 续期）
3. App 需被广告主授权访问其素材和创意数据
4. 调用时使用 `Access-Token` header 而非 `Cookie`
