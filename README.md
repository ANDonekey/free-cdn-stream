# TikTok CDN Video Encryption Demo

## About
A small demo inspired by the article  
👉 [Các web phim đã giảm chi phí bằng TikTok như thế nào?](https://voz.vn/t/cac-web-phim-%C4%90a-giam-chi-phi-bang-tiktok-nhu-the-nao.913788)

This project shows how a normal video can be **converted to HLS**, **encrypted with AES-128**, then **embedded into PNG files** that can be uploaded to TikTok — using TikTok’s CDN as a fast, global content delivery layer.

How it works:
- Video is re-encoded with FFmpeg → split into `.ts` segments → `.m3u8` playlist.
- Each segment is AES-encrypted, then wrapped inside valid PNG files.
- These PNGs can be served directly (even via TikTok CDN) and decrypted in the player.
- The player reads the disguised PNGs, extracts, decrypts, and streams the video.

This is purely for **educational and research** purposes.

---

## Run
1. Copy the example config and edit values:
```bash
cp config.json.example config.json
# edit config.json
```
2. Build & run with Docker Compose:
```bash
docker compose up -d
```

Then open: [http://localhost:3000](http://localhost:3000)

Upload a video, run the conversion, inspect generated files (playlist, segments, PNGs), and try playback.

## TikTok smoke test
Run a quick check for both existing TikTok CDN URLs and the upload API:
```bash
npm run tiktok:test
```

Useful variants:
```bash
npm run tiktok:test -- --cdn-only
npm run tiktok:test -- --upload-only
npm run tiktok:test -- --playlist=outputs/demo/master.m3u8
npm run tiktok:test -- --file=path/to/test.png
```

The upload check requires `config.json` with `tiktok.org_id`, `tiktok.cookie`, and `tiktok.orgin_link`.

## Refresh expired TikTok CDN links
TikTok material CDN URLs can expire. Uploaded jobs keep enough metadata in
`outputs/<jobId>/uploaded.json` to look up the same PNG materials again and
rewrite `outputs/<jobId>/master.m3u8` with fresh `image_url` values from the
material library.

Opening `/player.html?key=<jobId>` refreshes the playlist before playback. You
can also refresh manually:

```bash
curl -X POST http://localhost:3000/refresh/<jobId>
```

This does not re-upload the video. It searches TikTok Business material library
by the original job id and material names, then updates the playlist with the
latest signed CDN links.

## Disclaimer
This project is for learning only.
Do not use it to bypass bandwidth or CDN limitations on third-party platforms.
