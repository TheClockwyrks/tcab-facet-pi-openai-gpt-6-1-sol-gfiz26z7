import type { RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import type { DeepReadonly } from "ts-essentials";
import type { CellRef, GemState } from "./game";
import { cellX, cellY, index, type State } from "./simulation";
import { menuItems, targets } from "./controls";
import * as C from "./constants";

const INK = "#edf0df",
  GOLD = "#c5ac7c",
  DIM = "#82969d",
  LINE = "#2c3e45",
  TEAL = "#86d2cb";
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
type Ctx = CanvasRenderingContext2D;
function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size = 18,
  color = INK,
  align: CanvasTextAlign = "left",
  serif = false,
) {
  ctx.font = `${serif ? "400" : "500"} ${size}px ${serif ? 'Georgia, "Times New Roman", serif' : '"Trebuchet MS", Arial, sans-serif'}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function caps(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size = 12,
  color = DIM,
  spacing = 2,
) {
  ctx.font = `500 ${size}px "Trebuchet MS", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  let at = x;
  for (const letter of value) {
    ctx.fillText(letter, at, y);
    at += ctx.measureText(letter).width + spacing;
  }
}
function rule(ctx: Ctx, x: number, y: number, w: number, color = LINE) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.5);
  ctx.lineTo(x + w, y + 0.5);
  ctx.stroke();
}
function diamond(ctx: Ctx, x: number, y: number, r: number, color = GOLD) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.stroke();
}
function sprite(
  ctx: Ctx,
  s: State,
  path: string,
  x: number,
  y: number,
  w = 64,
  h = w,
) {
  const image = s.assets?.images[path];
  if (image) ctx.drawImage(image as ImageBitmap, x - w / 2, y - h / 2, w, h);
}
function drawGem(
  ctx: Ctx,
  s: State,
  g: DeepReadonly<GemState>,
  x: number,
  y: number,
  size = 64,
  time = s.simTime,
) {
  // Actual stones are native-size, nearest-neighbor sprites. No runtime color treatment.
  ctx.save();
  ctx.shadowColor = "#000b";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 5;
  const path =
    g.cut === "prism"
      ? `gems/prism-turn/${g.strain}/${Math.floor(time * 5) % 12}.png`
      : `gems/${g.kind ?? "prism"}-${g.strain}.png`;
  sprite(ctx, s, path, x, y, size);
  ctx.restore();
  if (g.cut === "brilliant" || g.cut === "star")
    sprite(ctx, s, `gems/${g.cut}.png`, x, y, size);
}
/** Reconstruct the live authored simulation at its state-owned age.
 * This keeps render pure, makes paused frames identical, and supports replay/seeking.
 */
function particles(
  ctx: Ctx,
  s: State,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  const source = s.assets?.fx[name];
  if (!source || age < 0 || age > 2.6) return;
  const sim = new ParticleSimulator(source as ParticleSystem, {
    seed,
    maxParticles: 70,
  });
  let ms = age * 1000;
  while (ms > 0) {
    const dt = Math.min(ms, 1000 / 60);
    sim.step(dt);
    ms -= dt;
  }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    const px = x + p.position[0] - source.field.width / 2,
      py = y - (p.position[1] - source.field.height / 2);
    const r = Math.max(0.2, p.size);
    const color = p.color.map((c) => Math.round(Math.min(1, c) * 255));
    ctx.fillStyle = `rgba(${color.join(",")},${p.opacity})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 1.7) {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(px - r * 2, py - 0.5, r * 4, 1);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
function field(ctx: Ctx) {
  const glow = ctx.createRadialGradient(
    C.STAGE_CX,
    330,
    20,
    C.STAGE_CX,
    C.STAGE_CY,
    750,
  );
  glow.addColorStop(0, "#1b3038");
  glow.addColorStop(0.65, "#101e27");
  glow.addColorStop(1, "#0b141b");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#a7b99a08";
  ctx.lineWidth = 1;
  for (let i = -8; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 100, 0);
    ctx.lineTo(i * 100 + 720, 720);
    ctx.stroke();
  }
  ctx.strokeStyle = "#738f8b0b";
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 100, 0);
    ctx.lineTo(i * 100 - 720, 720);
    ctx.stroke();
  }
  rule(ctx, 48, 22, 1184, "#50605c4d");
  rule(ctx, 48, 698, 1184, "#50605c4d");
  diamond(ctx, 40, 22, 3);
  diamond(ctx, 1240, 22, 3);
  diamond(ctx, 40, 698, 3);
  diamond(ctx, 1240, 698, 3);
}
function mark(ctx: Ctx, cell: CellRef, color = GOLD) {
  const x = cellX(cell.col),
    y = cellY(cell.row),
    r = C.GEM_R + 4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const dx of [-1, 1])
    for (const dy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * (r - 10), y + dy * r);
      ctx.lineTo(x + dx * r, y + dy * r);
      ctx.lineTo(x + dx * r, y + dy * (r - 10));
      ctx.stroke();
    }
}
function board(ctx: Ctx, s: State) {
  sprite(ctx, s, "gems/board-frame.png", C.BOARD_CX, C.BOARD_CY, 608);
  const shatter = s.lastWaves * C.WAVE_SECONDS;
  const t = s.stepTimer;
  const quiet = s.screen !== "playing";
  const time = quiet ? 0 : s.simTime;
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    cellX(0) - C.CELL_PITCH / 2,
    cellY(0) - C.CELL_PITCH / 2,
    C.CELL_PITCH * C.GRID_COLS,
    C.CELL_PITCH * C.GRID_ROWS,
  );
  ctx.clip();
  if (s.phase === "resolving" && s.visual?.before && t < shatter) {
    const cleared = new Set(s.visual.broken.map((b) => index(b.gem)));
    for (const g of s.visual.before.cells)
      if (!cleared.has(index(g)))
        drawGem(ctx, s, g, cellX(g.col), cellY(g.row), 64, time);
  } else
    for (const g of s.board.cells) {
      let x = cellX(g.col),
        y = cellY(g.row);
      if (s.phase === "swapping" && s.visual?.swap) {
        const [a, b] = s.visual.swap;
        const from =
          index(g) === index(a) ? b : index(g) === index(b) ? a : null;
        if (from) {
          const p = ease(s.swapTimer / C.SWAP_SECONDS);
          x = cellX(from.col) + (x - cellX(from.col)) * p;
          y = cellY(from.row) + (y - cellY(from.row)) * p;
        }
      } else if (s.phase === "resolving") {
        const fallAge = Math.max(0, t - shatter);
        y -=
          Math.max(0, g.fell - fallAge / C.FALL_SECONDS_PER_ROW) * C.CELL_PITCH;
      } else if ((s.visual?.opening ?? 1) < 1) {
        const age =
          (s.visual?.opening ?? 1) * C.GRID_ROWS * C.FALL_SECONDS_PER_ROW;
        y -= Math.max(0, g.fell - age / C.FALL_SECONDS_PER_ROW) * C.CELL_PITCH;
      }
      if (s.selection && s.offer && s.phase === "idle") {
        if (index(g) === index(s.selection)) {
          x = cellX(s.offer.col);
          y = cellY(s.offer.row);
        } else if (index(g) === index(s.offer)) {
          x = cellX(s.selection.col);
          y = cellY(s.selection.row);
        }
      }
      if (g.cut !== "plain")
        particles(
          ctx,
          s,
          "aura",
          x,
          y,
          1 + ((time * 0.65 + index(g) * 0.17) % 1.5),
          index(g) + s.score,
        );
      drawGem(ctx, s, g, x, y, 64, time);
    }
  if (s.phase === "resolving" && s.visual) {
    for (const b of s.visual.broken) {
      const age = t - b.wave * C.WAVE_SECONDS,
        x = cellX(b.gem.col),
        y = cellY(b.gem.row);
      if (age < 0) drawGem(ctx, s, b.gem, x, y, 64, time);
      else {
        if (age < 0.27 && b.gem.kind) {
          ctx.globalAlpha = 1 - age / 0.3;
          sprite(
            ctx,
            s,
            `gems/break/${b.gem.kind}/${Math.min(5, Math.floor(age / 0.045))}.png`,
            x,
            y,
          );
          ctx.globalAlpha = 1;
        }
        particles(
          ctx,
          s,
          b.gem.strain === C.MAX_STRAIN ? "flawed" : "clear",
          x,
          y,
          age,
          index(b.gem) + s.score,
        );
      }
    }
    for (const g of s.visual.created)
      particles(
        ctx,
        s,
        "cut",
        cellX(g.col),
        cellY(g.row),
        t,
        index(g) + s.score + 911,
      );
  }
  ctx.restore();
  if (s.selection) mark(ctx, s.selection, TEAL);
  if (s.offer) mark(ctx, s.offer, GOLD);
  if (s.refusal) {
    mark(ctx, s.refusal.a, "#ee817d");
    mark(ctx, s.refusal.b, "#ee817d");
  }
}
function button(
  ctx: Ctx,
  label: string,
  t: { x: number; y: number; w: number; h: number },
  selected: boolean,
  indexLabel?: string,
) {
  ctx.fillStyle = selected ? "#c6af7d" : "#14242c";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = selected ? "#f1ddb0" : "#42555b";
  ctx.lineWidth = 1;
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  const color = selected ? "#15242b" : INK;
  if (indexLabel)
    text(ctx, indexLabel, t.x + 22, t.y + 43, 12, selected ? "#4c5145" : DIM);
  text(
    ctx,
    label,
    t.x + (indexLabel ? 58 : t.w / 2),
    t.y + t.h / 2 + 7,
    19,
    color,
    indexLabel ? "left" : "center",
  );
  if (indexLabel) text(ctx, "↗", t.x + t.w - 30, t.y + 44, 22, color, "center");
}
function footer(ctx: Ctx, s: State) {
  caps(ctx, "FACET  /  A STUDY IN STRAIN", 64, 683, 10, DIM, 1.4);
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1210,
    683,
    11,
    DIM,
    "right",
  );
}
function title(ctx: Ctx, s: State) {
  caps(ctx, "THE LAPIDARY COLLECTION", 154, 112, 12, GOLD, 3);
  rule(ctx, 154, 139, 78, GOLD);
  text(ctx, C.TITLE_TEXT, 143, 308, 140, INK, "left", true);
  caps(ctx, C.TAGLINE_TEXT, 157, 352, 15, GOLD, 3.5);
  text(
    ctx,
    "A gem-matching game of beautiful consequences.",
    155,
    389,
    17,
    DIM,
  );
  for (const [i, t] of targets(s).entries())
    button(ctx, C.TITLE_ITEMS[i], t, s.menuIndex === i, `0${i + 1}`);
  text(ctx, "DRAG TO SWAP   /   FIND THE CHAIN", 155, 622, 11, DIM);
  // A small still life of actual produced stones, not a title-screen board.
  const cx = 902,
    cy = 343;
  for (const r of [147, 205]) {
    ctx.strokeStyle = r === 147 ? "#a9906140" : "#7d999020";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  diamond(ctx, cx, cy, 238, "#5d77714a");
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.strokeStyle = "#a9906155";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 199, cy + Math.sin(a) * 199);
    ctx.lineTo(cx + Math.cos(a) * 210, cy + Math.sin(a) * 210);
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = "#91f2de30";
  ctx.shadowBlur = 55;
  drawGem(
    ctx,
    s,
    { col: 0, row: 0, kind: null, cut: "prism", strain: 0, fell: 0 },
    cx,
    cy,
    230,
  );
  ctx.restore();
  const stones: [number, number, number][] = [
    [3, 765, 193],
    [0, 1060, 245],
    [5, 800, 509],
    [6, 1063, 458],
  ];
  for (const [k, x, y] of stones)
    drawGem(
      ctx,
      s,
      {
        col: 0,
        row: 0,
        kind: C.GEM_KINDS[k],
        cut: k === 6 ? "star" : "plain",
        strain: 0,
        fell: 0,
      },
      x,
      y,
      82,
    );
  caps(ctx, "CUT. CRACK. CASCADE.", 808, 623, 12, GOLD, 2.3);
}
function hud(ctx: Ctx, s: State) {
  caps(ctx, C.TITLE_TEXT, 64, 69, 25, INK, 6);
  caps(ctx, "PRESSURE FINDS THE FLAW", 65, 91, 9, GOLD, 1.5);
  caps(ctx, C.HUD_SCORE_LABEL, 352, 45, 10, DIM);
  text(ctx, s.score.toLocaleString("en-US"), 352, 79, 30, INK, "left", true);
  caps(
    ctx,
    `${C.HUD_LEVEL_LABEL}  ${String(s.level).padStart(2, "0")}`,
    590,
    43,
    11,
    GOLD,
  );
  text(
    ctx,
    `${s.levelScore.toLocaleString("en-US")} / ${(s.level * C.LEVEL_TARGET_STEP).toLocaleString("en-US")}`,
    928,
    43,
    12,
    DIM,
    "right",
  );
  ctx.fillStyle = "#283940";
  ctx.fillRect(590, 60, 338, 5);
  ctx.fillStyle = GOLD;
  ctx.fillRect(
    590,
    60,
    338 * clamp(s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
    5,
  );
  const pause = targets({ ...s, screen: "playing" })[0];
  button(ctx, C.PAUSE_LABEL, pause, false);
  // Marginalia: calm instructional notes outside the board's fixed extent.
  caps(ctx, "01 / THE BENCH", 64, 168, 11, GOLD);
  rule(ctx, 64, 187, 224);
  text(ctx, "Every clear leaves", 64, 223, 23, INK, "left", true);
  text(ctx, "a little pressure.", 64, 253, 23, INK, "left", true);
  text(ctx, "Match three. Watch what", 64, 287, 15, DIM);
  text(ctx, "the stones beside it become.", 64, 310, 15, DIM);
  caps(ctx, "STRAIN", 64, 370, 10, GOLD);
  for (let i = 0; i <= C.MAX_STRAIN; i++) {
    sprite(ctx, s, `gems/jade-${i}.png`, 88 + i * 53, 411, 44);
    text(
      ctx,
      String(i),
      88 + i * 53,
      450,
      11,
      i === C.MAX_STRAIN ? GOLD : DIM,
      "center",
    );
  }
  text(ctx, "CLEAN", 66, 476, 10, DIM);
  text(ctx, "FLAWED  ×2", 276, 476, 10, GOLD, "right");
  rule(ctx, 64, 503, 224);
  text(ctx, "Flawed stones shatter with", 64, 535, 15, DIM);
  text(ctx, "any clear that touches them.", 64, 558, 15, DIM);
  caps(ctx, "02 / SPECIAL CUTS", 980, 168, 11, GOLD);
  rule(ctx, 980, 187, 224);
  const cuts: [string, string, string, string][] = [
    ["brilliant", "BRILLIANT", "Four in a line", "Breaks the ring around it."],
    ["star", "STAR", "Two lines crossing", "Takes its row + column."],
    ["prism", "PRISM", "Five or more", "Swap to clear one kind."],
  ];
  cuts.forEach(([cut, label, earned, desc], i) => {
    const y = 230 + i * 112;
    const g: GemState = {
      col: 0,
      row: 0,
      kind: cut === "prism" ? null : "beryl",
      cut: cut as GemState["cut"],
      strain: 0,
      fell: 0,
    };
    drawGem(ctx, s, g, 1005, y + 8, 45, s.screen === "playing" ? s.simTime : 0);
    caps(ctx, label, 1041, y, 11, INK, 1.4);
    text(ctx, earned, 1041, y + 23, 12, GOLD);
    text(ctx, desc, 980, y + 61, 13, DIM);
  });
  rule(ctx, 980, 564, 224);
  if (s.phase === "resolving") {
    caps(ctx, C.HUD_CHAIN_LABEL, 980, 598, 11, GOLD);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      1198,
      638,
      51,
      INK,
      "right",
      true,
    );
    text(
      ctx,
      `+${s.lastPoints}  ·  ${s.lastCleared} stones`,
      980,
      636,
      14,
      TEAL,
    );
  } else {
    text(ctx, "Take hold. Move beside.", 980, 602, 15, INK, "left", true);
    text(ctx, "Let go to make your move.", 980, 629, 13, DIM);
  }
}
function wrap(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  width: number,
  size = 16,
  color = DIM,
  leading = 24,
) {
  ctx.font = `500 ${size}px "Trebuchet MS", Arial, sans-serif`;
  const words = value.split(" ");
  let line = "",
    at = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      text(ctx, line, x, at, size, color);
      at += leading;
      line = word;
    } else line = next;
  }
  if (line) text(ctx, line, x, at, size, color);
}
function howto(ctx: Ctx, s: State) {
  caps(ctx, "A FIELD GUIDE", 64, 77, 11, GOLD);
  text(ctx, "The beauty is in the break.", 62, 133, 51, INK, "left", true);
  const panels = [
    [
      "01",
      "Take hold. Let go.",
      "Seven kinds, one gem grid. With a mouse, pen, or finger, take hold of a gem, carry it onto its neighbor, then let go. Carry it back before release to play nothing.",
    ],
    [
      "02",
      "Find a fault line.",
      "Three or more of one kind in a line shatter. A swap that breaks nothing is refused. Stones fall into the gaps; fresh matches continue the chain, worth more at every step.",
    ],
    [
      "03",
      "Pressure is potential.",
      "Every gem beside a clear gains strain. At three it is flawed: cracked through, worth double, and ready to shatter with any clear that touches it.",
    ],
    [
      "04",
      "Earn a finer cut.",
      "Four in a line leaves a brilliant: it breaks its surrounding ring. Cross two lines for a star that takes its row and column. Five or more leaves a kindless prism: swap it to clear every gem of one kind.",
    ],
    [
      "05",
      "One level further.",
      "Reach the level’s target to tally your longest chain and best move, then open a new bench. Your score carries on. The round ends when no productive move remains.",
    ],
    [
      "06",
      "At your fingertips.",
      "Drag or tap neighboring gems. Menus answer your pointer, ↑ / ↓, and Enter / Space. P or Escape pauses and resumes. M toggles all sound. Escape returns from this guide or the final score.",
    ],
  ];
  panels.forEach(([num, heading, body], i) => {
    const x = i % 2 === 0 ? 64 : 668,
      y = 194 + Math.floor(i / 2) * 143;
    caps(ctx, num, x, y, 12, GOLD);
    rule(ctx, x + 37, y - 4, 499);
    text(ctx, heading, x, y + 29, 23, INK, "left", true);
    wrap(ctx, body, x, y + 57, 532, 15, DIM, 22);
  });
  button(ctx, C.BACK_LABEL, targets(s)[0], false);
}
function overlay(ctx: Ctx, s: State) {
  ctx.fillStyle = "#061019d9";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#14242c";
  ctx.fillRect(400, 166, 480, 440);
  ctx.strokeStyle = "#7f7457";
  ctx.strokeRect(400.5, 166.5, 479, 439);
  rule(ctx, 424, 181, 432, "#34464a");
  diamond(ctx, C.STAGE_CX, 185, 5, GOLD);
  const heading =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  caps(
    ctx,
    s.screen === "paused"
      ? "THE BENCH IS YOURS TO RETURN TO"
      : s.screen === "levelclear"
        ? `LEVEL ${String(s.level).padStart(2, "0")} / COMPLETE`
        : "EVERY STONE HAD ITS MOMENT",
    441,
    228,
    10,
    GOLD,
    1.7,
  );
  text(
    ctx,
    heading,
    C.STAGE_CX,
    286,
    s.screen === "gameover" ? 37 : 45,
    INK,
    "center",
    true,
  );
  if (s.screen === "paused") {
    text(
      ctx,
      "A little stillness before the next cascade.",
      C.STAGE_CX,
      342,
      16,
      DIM,
      "center",
    );
    text(ctx, "P / ESC TO RESUME", C.STAGE_CX, 377, 10, GOLD, "center");
  }
  if (s.screen === "levelclear") {
    caps(ctx, C.BEST_CHAIN_LABEL, 446, 330, 10, DIM, 1.2);
    caps(ctx, C.BEST_MOVE_LABEL, 666, 330, 10, DIM, 1.2);
    text(ctx, `${s.bestChain} STEPS`, 446, 370, 28, INK, "left", true);
    text(
      ctx,
      s.bestMove.toLocaleString("en-US"),
      666,
      370,
      28,
      INK,
      "left",
      true,
    );
  }
  if (s.screen === "gameover") {
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}   ${s.score.toLocaleString("en-US")}`,
      C.STAGE_CX,
      341,
      27,
      GOLD,
      "center",
      true,
    );
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level} REACHED`,
      C.STAGE_CX,
      377,
      12,
      DIM,
      "center",
    );
  }
  for (const [i, t] of targets(s).entries())
    button(ctx, menuItems(s)[i], t, s.menuIndex === i, `0${i + 1}`);
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  field(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    hud(ctx, s);
    if (s.board.cells.length) board(ctx, s);
    if (s.screen !== "playing") overlay(ctx, s);
  }
  footer(ctx, s);
}
