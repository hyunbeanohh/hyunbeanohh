import fs from "node:fs";
import path from "node:path";
import minimist from "minimist";
import sharp from "sharp";
import GIFEncoder from "gif-encoder-2";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const argv = minimist(process.argv.slice(2));

/**
 * README-friendly default:
 * 720x200, 12fps, 8s => 96 frames
 */
const WIDTH = Number(argv.w ?? 720);
const HEIGHT = Number(argv.h ?? 200);
const FPS = Number(argv.fps ?? 12);
const DURATION_SEC = Number(argv.sec ?? 8);
const FRAMES = Math.max(1, Math.floor(FPS * DURATION_SEC));

const ROOT = process.cwd();
const SVGS_DIR = path.join(ROOT, "assets", "svgs");
const OUT_GIF = path.join(ROOT, "assets", "quokka-forest.gif");

// Assets (use your existing names 그대로)
const ASSETS = {
  quokka: path.join(SVGS_DIR, "quokka.svg"),
  leaves: [
    { key: "JS", file: "leaf-js.svg" },
    { key: "REACT", file: "leaf-react.svg" },
    { key: "TS", file: "leaf-ts.svg" },
    { key: "NEXT", file: "leaf-nextjs.svg" },
    { key: "AI", file: "leaft-ai.svg" }
  ].map((x) => ({ ...x, path: path.join(SVGS_DIR, x.file) }))
};

// ---------- utils ----------
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }

async function svgToImage(svgPath, targetPx) {
  const buf = await sharp(svgPath)
    .resize({ width: targetPx, height: targetPx, fit: "inside" })
    .png()
    .toBuffer();
  return loadImage(buf);
}

function setPixelArt(ctx) {
  ctx.imageSmoothingEnabled = false;
}

// ---------- pixel bitmap font (5x7) for + and uppercase letters we use ----------
const FONT_5X7 = {
  "+": [
    "00100",
    "00100",
    "11111",
    "00100",
    "00100",
    "00000",
    "00000"
  ],
  "A": ["01110","10001","10001","11111","10001","10001","10001"],
  "C": ["01111","10000","10000","10000","10000","10000","01111"],
  "E": ["11111","10000","10000","11110","10000","10000","11111"],
  "I": ["11111","00100","00100","00100","00100","00100","11111"],
  "J": ["00111","00010","00010","00010","00010","10010","01100"],
  "N": ["10001","11001","10101","10011","10001","10001","10001"],
  "O": ["01110","10001","10001","10001","10001","10001","01110"],
  "R": ["11110","10001","10001","11110","10100","10010","10001"],
  "S": ["01111","10000","10000","01110","00001","00001","11110"],
  "T": ["11111","00100","00100","00100","00100","00100","00100"],
  "X": ["10001","01010","00100","00100","00100","01010","10001"],
  "Y": ["10001","01010","00100","00100","00100","00100","00100"]
};

function drawPixelText(ctx, text, x, y, scale = 2, color = "#2b1b0f", alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  setPixelArt(ctx);

  let cursor = x;
  for (const chRaw of text) {
    const ch = chRaw.toUpperCase();
    const glyph = FONT_5X7[ch] || null;

    if (!glyph) {
      cursor += 6 * scale;
      continue;
    }

    for (let row = 0; row < 7; row++) {
      const line = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (line[col] === "1") {
          ctx.fillRect(
            Math.round(cursor + col * scale),
            Math.round(y + row * scale),
            scale,
            scale
          );
        }
      }
    }
    cursor += 6 * scale; // 5px + 1px spacing
  }

  ctx.restore();
}

// ---------- improved pixel background (inspired by your references: wide field, clouds, hills, winding path) ----------
function drawCloud(ctx, x, y, w, h, c1, c2, block) {
  // blocky cloud made of rectangles
  ctx.fillStyle = c1;
  ctx.fillRect(x, y + block, w, h - block);
  ctx.fillRect(x + block, y, w - 2 * block, h);
  ctx.fillStyle = c2;
  ctx.fillRect(x + block, y + 2 * block, w - 2 * block, h - 3 * block);
}

function drawHills(ctx, groundY) {
  // far hills
  ctx.fillStyle = "#1b6a4a";
  ctx.fillRect(0, groundY - 64, WIDTH, 28);
  // mid hills
  ctx.fillStyle = "#2b7f55";
  ctx.fillRect(0, groundY - 46, WIDTH, 22);
  // near hill silhouette lumps
  ctx.fillStyle = "#1f704d";
  for (let i = 0; i < 6; i++) {
    const cx = i * 140 + 40;
    ctx.fillRect(cx, groundY - 58, 120, 18);
    ctx.fillRect(cx + 18, groundY - 66, 84, 12);
  }
}

function drawWindingPath(ctx, groundY, t) {
  // path color palette
  const pathBase = "#f4f0c8";
  const pathShade = "#e8e0ad";

  const topY = groundY - 10;
  const bottomY = HEIGHT;

  // path centerline uses a sin curve
  const amp = 48;
  const freq = 0.010;
  const shift = t * 0.8;

  // draw as stacked horizontal segments (pixel-ish)
  for (let y = topY; y < bottomY; y += 4) {
    const p = (y - topY) / (bottomY - topY);
    const width = 120 + p * 220; // expands towards bottom
    const cx = WIDTH * 0.46 + Math.sin((y + shift) * freq) * amp;
    const x1 = Math.round(cx - width / 2);
    const x2 = Math.round(cx + width / 2);

    ctx.fillStyle = pathBase;
    ctx.fillRect(x1, y, x2 - x1, 4);

    // subtle shade stripes
    if (Math.random() < 0.20) {
      ctx.fillStyle = pathShade;
      ctx.fillRect(x1 + randInt(6, 18), y, randInt(20, 60), 2);
    }
  }
}

function drawFlowers(ctx, groundY) {
  // small pixel flowers in foreground
  const colors = ["#d84a4a", "#f0c94a", "#ff6b6b"];
  for (let i = 0; i < 26; i++) {
    const x = randInt(10, WIDTH - 10);
    const y = randInt(groundY + 18, HEIGHT - 10);
    const c = colors[randInt(0, colors.length - 1)];
    // stem
    ctx.fillStyle = "#2b7f55";
    ctx.fillRect(x, y, 2, 6);
    // petal
    ctx.fillStyle = c;
    ctx.fillRect(x - 2, y - 2, 6, 4);
    // center
    ctx.fillStyle = "#f4f0c8";
    ctx.fillRect(x, y - 1, 2, 2);
  }
}

function drawPixelBackground(ctx, frameIndex, groundY) {
  setPixelArt(ctx);

  // sky: warm sunset gradient blocks (inspired by your orange reference)
  const bands = [
    "#f7b24a",
    "#f1a13d",
    "#ea8d33",
    "#e4792b"
  ];
  const bandH = Math.floor((groundY - 70) / bands.length);
  for (let i = 0; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    ctx.fillRect(0, i * bandH, WIDTH, bandH + 2);
  }

  // upper sky thin streaks
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  for (let i = 0; i < 18; i++) {
    const y = randInt(6, groundY - 88);
    const x = randInt(0, WIDTH - 60);
    ctx.fillRect(x, y, randInt(30, 110), 2);
  }

  // clouds (slow drift)
  const drift = (frameIndex / FPS) * 10;
  drawCloud(ctx, Math.round(60 + drift) % (WIDTH + 140) - 140, 36, 160, 46, "#fff6e8", "#ffe7cf", 6);
  drawCloud(ctx, Math.round(380 + drift * 0.7) % (WIDTH + 180) - 180, 48, 190, 56, "#fff6e8", "#ffe7cf", 6);
  drawCloud(ctx, Math.round(560 + drift * 0.5) % (WIDTH + 160) - 160, 28, 150, 44, "#fff6e8", "#ffe7cf", 6);

  // horizon light
  ctx.fillStyle = "#fff7d1";
  ctx.fillRect(0, groundY - 70, WIDTH, 16);

  // hills
  drawHills(ctx, groundY);

  // ground base
  ctx.fillStyle = "#5fb06b";
  ctx.fillRect(0, groundY - 10, WIDTH, HEIGHT - (groundY - 10));

  // winding path
  drawWindingPath(ctx, groundY, frameIndex);

  // grass noise pixels
  const speck = 6;
  for (let i = 0; i < 220; i++) {
    const x = randInt(0, Math.floor(WIDTH / speck) - 1) * speck;
    const y = randInt(groundY + 8, HEIGHT - 8);
    ctx.fillStyle = Math.random() < 0.5 ? "#4aa35b" : "#3a8e4f";
    ctx.fillRect(x, y, speck, speck);
  }

  // flowers
  drawFlowers(ctx, groundY);
}

// ---------- spawn zones (낙엽 존) ----------
// 잎은 아래 zone 안에서만 리스폰/생성됨. (길 주변/잔디 구역)
function createSpawnZones(groundY) {
  const top = groundY + 14;
  const bottom = HEIGHT - 16;

  return [
    // left foreground
    { x1: 40, x2: 260, y1: top + 10, y2: bottom },
    // right foreground
    { x1: 460, x2: WIDTH - 40, y1: top + 10, y2: bottom },
    // mid-left near horizon
    { x1: 60, x2: 320, y1: top, y2: top + 32 },
    // mid-right near horizon
    { x1: 400, x2: WIDTH - 60, y1: top, y2: top + 32 }
  ];
}

function pickSpawnPoint(zones) {
  const z = zones[randInt(0, zones.length - 1)];
  return {
    x: rand(z.x1, z.x2),
    y: rand(z.y1, z.y2)
  };
}

// ---------- simulation objects ----------
function createLeaves(leafImgs, zones) {
  const count = 9;
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const img = leafImgs[i % leafImgs.length];
    const p = pickSpawnPoint(zones);
    leaves.push({
      id: i,
      img,
      label: ASSETS.leaves[i % ASSETS.leaves.length].key, // "+JS" etc
      state: "alive", // alive | eating | dead
      eatStartMs: 0,
      eatDurationMs: 250, // 2~3 frames at 12fps ~ 166~250ms
      respawnAt: 0,
      x: p.x,
      y: p.y,
      r: 14
    });
  }
  return leaves;
}

function respawnLeaf(leaf, zones) {
  const p = pickSpawnPoint(zones);
  leaf.state = "alive";
  leaf.x = p.x;
  leaf.y = p.y;
  leaf.respawnAt = 0;
  leaf.eatStartMs = 0;
}

function startEatLeaf(leaf, nowMs) {
  leaf.state = "eating";
  leaf.eatStartMs = nowMs;
}

function finishEatLeaf(leaf, nowMs) {
  leaf.state = "dead";
  // 리스폰 1.4~3.6초
  leaf.respawnAt = nowMs + randInt(1400, 3600);
}

// quokka = 완전 랜덤 워크
function createQuokka(groundY) {
  return {
    x: WIDTH * 0.5,
    y: groundY + 26,
    vx: 0,
    vy: 0,
    dirX: 1,
    dirY: 0,
    nextDirAt: 0,
    speed: 56, // px/sec
    r: 18
  };
}

function updateQuokka(q, dtSec, nowMs, groundY) {
  if (nowMs >= q.nextDirAt) {
    const angle = rand(0, Math.PI * 2);
    q.dirX = Math.cos(angle);
    q.dirY = Math.sin(angle) * 0.35;
    q.nextDirAt = nowMs + randInt(320, 900);
  }

  const ax = q.dirX * q.speed * 2.2;
  const ay = q.dirY * q.speed * 2.2;

  q.vx += ax * dtSec;
  q.vy += ay * dtSec;

  q.vx *= Math.pow(0.06, dtSec);
  q.vy *= Math.pow(0.06, dtSec);

  q.x += q.vx * dtSec;
  q.y += q.vy * dtSec;

  q.x = clamp(q.x, 20, WIDTH - 20);
  q.y = clamp(q.y, groundY + 12, HEIGHT - 10);

  if (q.x <= 22 || q.x >= WIDTH - 22) q.nextDirAt = 0;
  if (q.y <= groundY + 14 || q.y >= HEIGHT - 12) q.nextDirAt = 0;
}

function collideStartEat(q, leaf, nowMs) {
  if (leaf.state !== "alive") return false;
  const rr = (q.r + leaf.r) * (q.r + leaf.r);
  if (dist2(q.x, q.y, leaf.x, leaf.y) <= rr) {
    startEatLeaf(leaf, nowMs);
    return true;
  }
  return false;
}

// ---------- floating "+STACK" popups ----------
function createPopup(text, x, y, nowMs) {
  return {
    text: `+${text}`,
    x,
    y,
    startMs: nowMs,
    durationMs: 1200
  };
}

function updatePopups(popups, nowMs) {
  return popups.filter((p) => nowMs - p.startMs <= p.durationMs);
}

function drawPopups(ctx, popups, nowMs) {
  // bottom area baseline
  const baseY = HEIGHT - 26;
  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    const t = (nowMs - p.startMs) / p.durationMs;
    const alpha = clamp(1 - t, 0, 1);

    // slight upward float, slight left/right jitter based on index
    const dy = Math.round(t * 12);
    const dx = (i % 2 === 0 ? -1 : 1) * Math.round(t * 10);

    // drop shadow
    drawPixelText(ctx, p.text, Math.round(WIDTH / 2 - 60 + dx) + 2, baseY - dy + 2, 2, "#000000", alpha * 0.25);
    // main
    drawPixelText(ctx, p.text, Math.round(WIDTH / 2 - 60 + dx), baseY - dy, 2, "#2b1b0f", alpha);
  }
}

// ---------- render entities ----------
function drawLeaves(ctx, leaves, leafPx, nowMs) {
  for (const lf of leaves) {
    if (lf.state === "dead") continue;

    // scale-down animation while eating
    let scale = 1;
    if (lf.state === "eating") {
      const t = clamp((nowMs - lf.eatStartMs) / lf.eatDurationMs, 0, 1);
      // ease-out shrink
      scale = (1 - t) * (1 - t);
    }

    const w = Math.max(1, Math.round(leafPx * scale));
    const h = Math.max(1, Math.round(leafPx * scale));

    ctx.save();
    setPixelArt(ctx);
    ctx.drawImage(lf.img, Math.round(lf.x - w / 2), Math.round(lf.y - h / 2), w, h);
    ctx.restore();
  }
}

function drawLeafShadows(ctx, leaves, nowMs) {
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  for (const lf of leaves) {
    if (lf.state === "dead") continue;

    let shadowW = 18;
    if (lf.state === "eating") {
      const t = clamp((nowMs - lf.eatStartMs) / lf.eatDurationMs, 0, 1);
      shadowW = Math.max(2, Math.round(18 * (1 - t)));
    }

    ctx.fillRect(Math.round(lf.x - shadowW / 2), Math.round(lf.y + 12), shadowW, 5);
  }
}

function drawQuokka(ctx, quokkaImg, q, quokkaPx) {
  const w = quokkaPx;
  const h = quokkaPx;
  const flip = q.vx < -5 ? -1 : q.vx > 5 ? 1 : 0;

  ctx.save();
  setPixelArt(ctx);
  ctx.translate(Math.round(q.x), Math.round(q.y));
  if (flip < 0) ctx.scale(-1, 1);
  ctx.drawImage(quokkaImg, Math.round(-w / 2), Math.round(-h / 2), w, h);
  ctx.restore();
}

// ---------- main ----------
async function main() {
  const quokkaPx = Number(argv.quokkaPx ?? 64);
  const leafPx = Number(argv.leafPx ?? 40);
  const groundY = Math.floor(HEIGHT * 0.58);

  if (!fs.existsSync(SVGS_DIR)) {
    throw new Error(`Missing folder: ${SVGS_DIR}`);
  }
  if (!fs.existsSync(ASSETS.quokka)) {
    throw new Error(`Missing quokka svg: ${ASSETS.quokka}`);
  }

  const quokkaImg = await svgToImage(ASSETS.quokka, quokkaPx);

  const leafImgs = [];
  for (const lf of ASSETS.leaves) {
    if (!fs.existsSync(lf.path)) {
      throw new Error(`Missing leaf svg: ${lf.path}`);
    }
    leafImgs.push(await svgToImage(lf.path, leafPx));
  }

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  setPixelArt(ctx);

  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  encoder.setRepeat(0);
  encoder.setDelay(Math.floor(1000 / FPS));
  encoder.setQuality(18);
  encoder.start();

  const dtSec = 1 / FPS;

  // zones + entities
  const zones = createSpawnZones(groundY);
  const leaves = createLeaves(leafImgs, zones);
  const q = createQuokka(groundY);
  let popups = [];

  for (let i = 0; i < FRAMES; i++) {
    const nowMs = Math.floor((i * 1000) / FPS);

    // respawn dead leaves
    for (const lf of leaves) {
      if (lf.state === "dead" && nowMs >= lf.respawnAt) {
        respawnLeaf(lf, zones);
      }
    }

    // update quokka
    updateQuokka(q, dtSec, nowMs, groundY);

    // collisions => start eating
    for (const lf of leaves) {
      const started = collideStartEat(q, lf, nowMs);
      if (started) {
        popups.push(createPopup(lf.label, q.x, q.y, nowMs));
      }
    }

    // finish eating when duration passes
    for (const lf of leaves) {
      if (lf.state === "eating") {
        if (nowMs - lf.eatStartMs >= lf.eatDurationMs) {
          finishEatLeaf(lf, nowMs);
        }
      }
    }

    // update popups
    popups = updatePopups(popups, nowMs);

    // render
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // improved background
    drawPixelBackground(ctx, i, groundY);

    // entity shadows + leaves + quokka
    drawLeafShadows(ctx, leaves, nowMs);
    drawLeaves(ctx, leaves, leafPx, nowMs);
    drawQuokka(ctx, quokkaImg, q, quokkaPx);

    // bottom popups overlay
    drawPopups(ctx, popups, nowMs);

    const imgData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    encoder.addFrame(imgData.data);
  }

  encoder.finish();
  const gifBuffer = encoder.out.getData();
  fs.mkdirSync(path.dirname(OUT_GIF), { recursive: true });
  fs.writeFileSync(OUT_GIF, gifBuffer);

  const kb = Math.round(gifBuffer.length / 1024);
  console.log(`✅ Wrote ${OUT_GIF} (${kb} KB)`);
  console.log(`   size=${WIDTH}x${HEIGHT}, fps=${FPS}, frames=${FRAMES}`);
}

main().catch((e) => {
  console.error("❌ render failed:", e);
  process.exit(1);
});