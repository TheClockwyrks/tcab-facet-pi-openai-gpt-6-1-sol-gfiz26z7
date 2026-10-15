/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { game, type FacetState, type FacetDebugApi, type Screen } from "./game";
import { debug } from "./debug";
import { action, pointerEvent, targetCell, targets } from "./controls";
import {
  advance,
  cellX,
  cellY,
  clearSet,
  dealBoard,
  index,
  initialState,
  lastFall,
  legalSwap,
  openRound,
  productive,
  requestSwap,
  resolveStep,
  runs,
  stepHold,
} from "./simulation";
import * as C from "./constants";

const pattern = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => "RACJBSM"[(c + r * 2) % C.GEM_KIND_COUNT] + "0",
  ).join(" "),
);
function base(): FacetState {
  return debug.setScreen(debug.loadBoard(initialState(), pattern), "playing");
}
function set(
  s: FacetState,
  col: number,
  row: number,
  token: string,
): FacetState {
  return debug.setGem(s, col, row, token);
}
function lineBoard(n = 3): FacetState {
  let s = base();
  for (let c = 0; c < n; c++) s = set(s, c, 3, "R0");
  return s;
}
function seed(s: FacetState, chainStep = 1): FacetState {
  return { ...s, phase: "resolving", chainStep };
}
function deterministic(s: FacetState): FacetState {
  for (let col = 0; col < C.GRID_COLS; col++)
    s = debug.setRefillKinds(
      s,
      col,
      Array.from(
        { length: C.GRID_ROWS },
        (_, row) => "RACJBSM"[(col + row * 2 + 3) % C.GEM_KIND_COUNT],
      ).join(""),
    );
  return s;
}

describe("the render-free rules", () => {
  it("deals only productive, match-free opening boards from above", () => {
    for (let i = 0; i < 35; i++) {
      const b = dealBoard();
      expect(b.cells).toHaveLength(C.GRID_COLS * C.GRID_ROWS);
      expect(runs(b)).toEqual([]);
      expect(legalSwap(b)).toBe(true);
      for (const g of b.cells) {
        expect(g.strain).toBe(0);
        expect(g.cut).toBe("plain");
        expect(g.fell).toBeGreaterThanOrEqual(g.row + 1);
      }
    }
  });
  it("finds maximal runs of one kind regardless of strain and cut, never prisms", () => {
    let s = lineBoard(5);
    s = set(s, 1, 3, "R2b");
    s = set(s, 2, 3, "R3s");
    const rr = runs(s.board).filter((r) => r.horizontal);
    expect(rr).toHaveLength(1);
    expect(rr[0].cells).toEqual([24, 25, 26, 27, 28]);
    s = set(s, 2, 3, "X0");
    expect(runs(s.board)).toEqual([]);
  });
  it("refuses nonadjacency, unproductive swaps and non-idle boards immutably", () => {
    const s = base(),
      copy = structuredClone(s);
    for (const [a, b] of [
      [
        { col: 0, row: 0 },
        { col: 2, row: 0 },
      ],
      [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
    ]) {
      const next = requestSwap(s, a, b);
      expect(next.phase).toBe("idle");
      expect(next.board).toBe(s.board);
      expect(next.refusal).toMatchObject({ a, b, timer: 0 });
    }
    const busy = requestSwap(
      { ...lineBoard(), phase: "resolving" },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    );
    expect(busy.phase).toBe("resolving");
    expect(busy.refusal).not.toBeNull();
    expect(s).toEqual(copy);
  });
  it("accepts productive swaps immediately, animates before scoring, zeros both fell", () => {
    let s = lineBoard();
    s = {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g) => ({ ...g, fell: 4 })),
      },
    };
    s = requestSwap(s, { col: 6, row: 6 }, { col: 7, row: 6 });
    expect(s.phase).toBe("swapping");
    expect(s.chainStep).toBe(0);
    expect(s.score).toBe(0);
    expect(s.board.cells[54].fell).toBe(0);
    expect(s.board.cells[55].fell).toBe(0);
    s = advance(s, C.SWAP_SECONDS - 0.001);
    expect(s.score).toBe(0);
    s = advance(s, 0.001);
    expect(s.phase).toBe("resolving");
    expect(s.chainStep).toBe(1);
    expect(s.lastCleared).toBe(3);
    expect(s.score).toBe(C.BASE_SCORE * 3);
  });
  it("closes brilliant, star, and orthogonal flawed expansion with minimum waves", () => {
    let s = lineBoard();
    s = set(s, 1, 3, "R0b");
    s = set(s, 2, 2, "C0s");
    s = set(s, 4, 2, "B3");
    s = set(s, 4, 1, "S3");
    const setOf = clearSet(seed(s));
    expect(setOf.waves.get(index({ col: 1, row: 3 }))).toBe(0);
    expect(setOf.waves.get(index({ col: 2, row: 2 }))).toBe(1);
    expect(setOf.waves.get(index({ col: 4, row: 2 }))).toBe(2);
    expect(setOf.waves.get(index({ col: 4, row: 1 }))).toBe(3);
    expect(setOf.waves.get(index({ col: 7, row: 2 }))).toBe(2);
  });
  it("diagonal flawed gems do not join a plain clear", () => {
    let s = lineBoard();
    s = set(s, 3, 2, "B3");
    expect(clearSet(seed(s)).waves.has(19)).toBe(false);
  });
  it("raises strain once per step, caps it, scores flawed stones double", () => {
    let s = lineBoard();
    s = set(s, 0, 3, "R3");
    s = set(s, 1, 2, "B2");
    s = set(s, 3, 3, "C2");
    const before = s;
    const cues: string[] = [];
    s = resolveStep(seed(s, 2), clearSet(seed(s, 2)), (c) => cues.push(c));
    expect(s.lastPoints).toBe((C.FLAWED_SCORE + 2 * C.BASE_SCORE) * 2);
    expect(s.moveScore).toBe(s.lastPoints);
    expect(s.levelScore).toBe(s.lastPoints);
    expect(s.board.cells.find((g) => g.col === 3 && g.row === 3)?.strain).toBe(
      C.MAX_STRAIN,
    );
    expect(cues.filter((c) => c === C.CUES.flaw)).toHaveLength(1);
    expect(before.board.cells[17].strain).toBe(2);
  });
  it.each([4, 5, 6])("creates the right cut for a maximal line of %i", (n) => {
    const s = seed(lineBoard(n));
    const after = resolveStep(s, clearSet(s));
    const cuts = after.board.cells.filter((g) => g.cut !== "plain");
    expect(cuts).toHaveLength(1);
    expect(cuts[0].cut).toBe(n === 4 ? "brilliant" : "prism");
    expect(cuts[0].col).toBe(Math.floor((n - 1) / 2));
    expect(cuts[0].strain).toBe(0);
    expect(cuts[0].kind).toBe(n === 4 ? "ruby" : null);
  });
  it("puts a run's creation at the lower-index swapped cell, and a star at a crossing", () => {
    let s = seed(lineBoard(4));
    s = {
      ...s,
      visual: {
        swap: [
          { col: 2, row: 3 },
          { col: 3, row: 3 },
        ],
        before: null,
        broken: [],
        created: [],
        opening: 1,
      },
    };
    let after = resolveStep(s, clearSet(s));
    expect(after.visual?.created[0].col).toBe(2);
    s = seed(lineBoard());
    s = set(s, 1, 2, "R0");
    s = set(s, 1, 4, "R0");
    after = resolveStep(s, clearSet(s));
    expect(after.visual?.created).toContainEqual(
      expect.objectContaining({ col: 1, row: 3, cut: "star", strain: 0 }),
    );
  });
  it("prism priority beats a star when creations share a cell", () => {
    let s = seed(lineBoard(5));
    s = set(s, 2, 2, "R0");
    s = set(s, 2, 4, "R0");
    const after = resolveStep(s, clearSet(s));
    expect(after.visual?.created.find((g) => g.col === 2)?.cut).toBe("prism");
  });
  it("a prism swap seeds every gem of its partner kind, without creating cuts", () => {
    let s = base();
    s = set(s, 0, 0, "X1");
    s = set(s, 1, 0, "J0");
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    s = { ...s, chainStep: 1 };
    const clear = clearSet(s);
    expect(clear.runs).toEqual([]);
    const expected = s.board.cells.filter(
      (g) => g.kind === "jade" || g.cut === "prism",
    ).length;
    expect(clear.waves.size).toBe(expected);
    const after = resolveStep(s, clear);
    expect(after.visual?.created).toEqual([]);
  });
  it("a prism-prism swap clears the entire board", () => {
    let s = base();
    s = set(s, 0, 0, "X0");
    s = set(s, 1, 0, "X3");
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    const next = advance(deterministic(s), C.SWAP_SECONDS);
    expect(next.lastCleared).toBe(C.GRID_COLS * C.GRID_ROWS);
    expect(lastFall(next)).toBe(C.GRID_ROWS);
  });
  it("settles in order carrying damage and cuts, refills by destination row", () => {
    let s = lineBoard();
    s = set(s, 0, 0, "M2b");
    s = deterministic(s);
    const next = resolveStep(seed(s), clearSet(seed(s)));
    expect(next.board.cells[8]).toMatchObject({
      kind: "amethyst",
      cut: "brilliant",
      strain: 2,
      fell: 1,
    });
    expect(next.board.cells[0]).toMatchObject({
      kind: "jade",
      cut: "plain",
      strain: 0,
      fell: 1,
    });
    expect(next.board.cells[32].fell).toBe(0);
    expect(stepHold(next)).toBe(
      next.lastWaves * C.WAVE_SECONDS +
        lastFall(next) * C.FALL_SECONDS_PER_ROW +
        C.STEP_SECONDS,
    );
  });
  it("caps only the scoring multiplier, not the chain depth", () => {
    const s = seed(lineBoard(), 19),
      after = resolveStep(s, clearSet(s));
    expect(after.lastPoints).toBe(3 * C.BASE_SCORE * C.MAX_MULTIPLIER);
    expect(after.bestChain).toBe(19);
  });
  it("preserves elapsed time across swap and step boundaries", () => {
    const start = deterministic(
      requestSwap(lineBoard(), { col: 6, row: 6 }, { col: 7, row: 6 }),
    );
    const one = advance(start, 1.1);
    let many = start;
    for (let i = 0; i < 110; i++) many = advance(many, 0.01);
    expect(debug.snapshot(one).board).toEqual(debug.snapshot(many).board);
    expect(one.score).toBe(many.score);
    expect(one.phase).toBe(many.phase);
    expect(one.stepTimer).toBeCloseTo(many.stepTimer, 9);
  });
  it("settled journeys stay recorded and the best move is committed only on settling", () => {
    let s = deterministic(
      requestSwap(lineBoard(), { col: 6, row: 6 }, { col: 7, row: 6 }),
    );
    s = advance(s, C.SWAP_SECONDS);
    expect(s.bestMove).toBe(0);
    const fell = s.board.cells.map((g) => g.fell);
    s = advance(s, stepHold(s));
    expect(s.phase).toBe("idle");
    expect(s.board.cells.map((g) => g.fell)).toEqual(fell);
    expect(s.bestMove).toBe(s.moveScore);
  });
  it("evaluates the level target ahead of the no-move ending", () => {
    let s = deterministic(
      requestSwap(lineBoard(), { col: 6, row: 6 }, { col: 7, row: 6 }),
    );
    s = debug.setLevelScore(s, C.LEVEL_TARGET_STEP);
    s = advance(s, 2);
    expect(s.screen).toBe("levelclear");
    const old = s;
    const next = action(s, "confirm");
    expect(next.level).toBe(2);
    expect(next.score).toBe(old.score);
    expect(next.levelScore).toBe(0);
    expect(next.bestMove).toBe(0);
    expect(next.bestChain).toBe(0);
    expect(runs(next.board)).toEqual([]);
  });
  it("ages a refusal only on the playing screen", () => {
    let s = requestSwap(base(), { col: 0, row: 0 }, { col: 1, row: 0 });
    s = advance(s, 0.1);
    expect(s.refusal?.timer).toBe(0.1);
    const paused = advance({ ...s, screen: "paused" }, 8);
    expect(paused.refusal).toEqual(s.refusal);
    s = advance(s, C.REFUSAL_SECONDS);
    expect(s.refusal).toBeNull();
  });
});

describe("pointer, menus and debug poses", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "offers and releases immediately for %s",
    (device) => {
      let s = lineBoard();
      s = debug.pointerDown(s, cellX(6), cellY(6), device);
      expect(s.selection).toEqual({ col: 6, row: 6 });
      s = debug.pointerMove(s, cellX(7), cellY(6), device);
      expect(s.offer).toEqual({ col: 7, row: 6 });
      expect(s.phase).toBe("idle");
      s = debug.pointerUp(s, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.offer).toBeNull();
      expect(s.simTime).toBe(0);
    },
  );
  it("withdraws offers on return, keeps selection on release, and allows tap-tap", () => {
    let s = lineBoard();
    s = debug.pointerDown(s, cellX(6), cellY(6));
    s = debug.pointerMove(s, cellX(7), cellY(6));
    s = debug.pointerMove(s, cellX(6), cellY(6));
    s = debug.pointerUp(s);
    expect(s.offer).toBeNull();
    expect(s.selection).not.toBeNull();
    expect(s.phase).toBe("idle");
    s = debug.pointerDown(s, cellX(7), cellY(6));
    s = debug.pointerUp(s);
    expect(s.phase).toBe("swapping");
  });
  it("leaves the offer standing on a distant drag and clears selection on a distant press", () => {
    let s = debug.pointerDown(base(), cellX(2), cellY(2));
    s = debug.pointerMove(s, cellX(3), cellY(2));
    s = debug.pointerMove(s, 0, 0);
    expect(s.offer).toEqual({ col: 3, row: 2 });
    s = debug.pointerUp(s);
    expect(s.refusal).not.toBeNull();
    s = debug.pointerDown(s, 0, 0);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("retakes a selected cell or selects a nonneighbor", () => {
    let s = debug.setSelection(base(), 2, 2);
    s = debug.setOffer(s, 3, 2);
    s = debug.pointerDown(s, cellX(2), cellY(2));
    expect(s.offer).toBeNull();
    s = debug.pointerDown(s, cellX(7), cellY(7));
    expect(s.selection).toEqual({ col: 7, row: 7 });
  });
  it("cell targeting uses circular hits and reading-order tie breaks", () => {
    expect(targetCell(cellX(0) + C.GEM_HIT_R, cellY(0))).toEqual({
      col: 0,
      row: 0,
    });
    expect(targetCell(cellX(0), cellY(0) + C.GEM_HIT_R)).toEqual({
      col: 0,
      row: 0,
    });
    expect(targetCell(cellX(0) + 35, cellY(0) + 35)).toBeNull();
  });
  it.each([
    "title",
    "howto",
    "playing",
    "paused",
    "levelclear",
    "gameover",
  ] as Screen[])(
    "reports fingertip-sized, separated targets on %s",
    (screen) => {
      const list = targets({ ...base(), screen });
      expect(list.length).toBeGreaterThan(0);
      for (const t of list) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
      if (list.length > 1)
        expect(list[0].y + list[0].h).toBeLessThan(list[1].y);
    },
  );
  it("arms on press, cancels outside release and activates only the armed target", () => {
    let s = initialState();
    const t = targets(s)[1];
    s = debug.pointerMove(s, t.x + 5, t.y + 5);
    expect(s.menuIndex).toBe(1);
    s = debug.pointerDown(s, t.x + 5, t.y + 5);
    expect(s.armedTarget).toBe("menu-1");
    s = debug.pointerMove(s, 0, 0);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    s = debug.pointerDown(s, t.x + 5, t.y + 5);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("howto");
    expect(s.armedTarget).toBeNull();
    const back = targets(s)[0];
    s = debug.pointerDown(s, back.x + 5, back.y + 5);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
  });
  it("pointer pause and resume preserve a board exactly", () => {
    let s = openRound(initialState());
    const old = s.board,
      pause = targets(s)[0];
    s = debug.pointerDown(s, pause.x + 5, pause.y + 5);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("paused");
    const resume = targets(s)[0];
    s = debug.pointerDown(s, resume.x + 5, resume.y + 5);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("playing");
    expect(s.board).toBe(old);
  });
  it("menu navigation wraps and the title restarts a genuinely fresh round", () => {
    let s = action(initialState(), "up");
    expect(s.menuIndex).toBe(1);
    s = action(s, "down");
    expect(s.menuIndex).toBe(0);
    s = debug.setScore(s, 999);
    s = action(s, "confirm");
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.board.cells).toHaveLength(64);
    s = action(s, "pause");
    s = action(s, "pause");
    expect(s.screen).toBe("playing");
    expect(action(s, "back")).toEqual(s);
  });
  it.each(["paused", "levelclear", "gameover"] as Screen[])(
    "QUIT puts down the round from %s but preserves its figures",
    (screen) => {
      const s = { ...lineBoard(), screen, menuIndex: 1, score: 420 };
      const next = action(s, "confirm");
      expect(next.screen).toBe("title");
      expect(next.board.cells).toEqual([]);
      expect(next.phase).toBe("idle");
      expect(next.score).toBe(420);
      expect(next.selection).toBeNull();
      expect(next.armedTarget).toBeNull();
    },
  );
  it("back from gameover keeps the finished board, and play-again resets the round", () => {
    const s = { ...lineBoard(), screen: "gameover" as const, score: 870 };
    expect(action(s, "back").board).toBe(s.board);
    expect(action(s, "confirm").score).toBe(0);
  });
  it("poses exactly one named value and reconciles without simulation", () => {
    let s = debug.setSelection(initialState(), 7, 7);
    s = debug.setOffer(s, 0, 0);
    s = debug.setMenuIndex(s, 89);
    s = debug.setLevel(s, 5);
    s = debug.setLevelScore(s, 88888);
    s = debug.setBestMove(s, 45);
    s = debug.setMoveScore(s, 67);
    s = debug.setBestChain(s, 12);
    s = debug.setScore(s, 1234);
    s = debug.dealBoard(s);
    s = debug.clearBoard(s);
    expect(s.selection).toEqual({ col: 7, row: 7 });
    expect(s.offer).toEqual({ col: 0, row: 0 });
    expect(s.menuIndex).toBe(89);
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.snapshot(s).levelTarget).toBe(10000);
    expect(debug.snapshot(s).legalSwap).toBe(false);
    const clean = debug.reset({ ...s, muted: true });
    expect(clean).toEqual({
      ...initialState(),
      muted: true,
      assets: undefined,
    });
  });
  it("clear poses leave unrelated state untouched", () => {
    let s = debug.setSelection(base(), 1, 1);
    s = debug.setOffer(s, 2, 1);
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    s = debug.clearSelection(s);
    expect(s.offer).not.toBeNull();
    s = debug.clearOffer(s);
    s = debug.clearRefusal(s);
    s = debug.clearChain(s);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
    expect(s.refusal).toBeNull();
    expect(s.phase).toBe("idle");
    s = debug.setRefillKinds(s, 0, "RAC");
    expect(s.refillKinds[0]).toBe("RAC");
    expect(debug.clearRefillKinds(s).refillKinds).toEqual(Array(8).fill(""));
  });
  it("rejects arguments outside the specification's domains loudly", () => {
    const s = base();
    for (const f of [
      () => debug.setGem(s, -1, 0, "R0"),
      () => debug.setGem(initialState(), 0, 0, "R0"),
      () => debug.setGem(s, 0, 0, "X0b"),
      () => debug.loadBoard(s, ["R0"]),
      () => debug.loadBoard(s, Array(8).fill("R0")),
      () => debug.loadBoard(s, Array(8).fill("R0 R0 R0 R0 R0 R0 R0 R9")),
      () => debug.setLevel(s, 0),
      () => debug.setMenuIndex(s, -1),
      () => debug.setScore(s, 1.2),
      () => debug.setRefillKinds(s, 0, "RX"),
      () => debug.setSelection(s, 8, 0),
      () => debug.setOffer(s, 0, 8),
      () => debug.requestSwap(s, 0, 0, 8, 0),
      () => debug.requestSwap(initialState(), 0, 0, 1, 0),
      () => debug.pointerDown(s, NaN, 0),
    ])
      expect(f).toThrow();
  });
});

// The engine is exercised over its own clock, native canvas, real committed PNGs,
// and a file-backed fetch adapter. Only the browser's unavailable audio decoder is faked.
class TestAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  async decodeAudioData(data: ArrayBuffer) {
    return { duration: (data.byteLength - 44) / 88200 };
  }
  async resume() {}
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect() {},
      start() {},
      stop() {},
      disconnect() {},
    };
  }
}
const engines: Engine<FacetState, FacetDebugApi>[] = [];
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        await readFile(new URL(`../public/${url}`, import.meta.url)),
      ),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("AudioContext", TestAudioContext);
});
afterAll(() => {
  for (const engine of engines) engine.destroy();
  vi.unstubAllGlobals();
});
async function harness(step = 1000 / 60) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H),
    events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: "#0b141b",
    game,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = async (code: string) => {
    events.dispatchEvent(
      Object.assign(new Event("keydown"), { code, repeat: false }),
    );
    await engine.advance(1);
    events.dispatchEvent(Object.assign(new Event("keyup"), { code }));
    await engine.advance(1);
  };
  return { engine, events, key, canvas };
}
describe("full engine integration", () => {
  it("loads every sprite and FX before exposing debug, registers live diagnostics", async () => {
    const { engine } = await harness();
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    expect(Object.keys(engine.state.assets!.images)).toHaveLength(125);
    expect(Object.keys(engine.state.assets!.fx)).toHaveLength(4);
    expect(engine.debug.snapshot(engine.state).screen).toBe("title");
    const before = engine.state;
    engine.diagnostics();
    expect(engine.state).toBe(before);
    expect(engine.diagnostics().find((d) => d.name === "score")?.value).toBe(0);
    engine.apply((s) => debug.setScore(s, 985));
    expect(engine.diagnostics().find((d) => d.name === "score")?.value).toBe(
      985,
    );
  });
  it("drives all screens with physical key bindings and mirrors runtime mute", async () => {
    const { engine, key } = await harness();
    await key("ArrowDown");
    await key("Space");
    expect(engine.state.screen).toBe("howto");
    await key("Escape");
    expect(engine.state.menuIndex).toBe(1);
    await key("ArrowUp");
    await key("Enter");
    expect(engine.state.screen).toBe("playing");
    await engine.advance(30);
    await key("KeyM");
    expect(engine.state.muted).toBe(true);
    await key("Escape");
    expect(engine.state.screen).toBe("paused");
    const timer = engine.state.swapTimer;
    await engine.advance(10);
    expect(engine.state.swapTimer).toBe(timer);
    await key("KeyP");
    expect(engine.state.screen).toBe("playing");
    await key("KeyP");
    await key("ArrowDown");
    await key("Enter");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.board.cells).toEqual([]);
  });
  it("processes ordered primary pointer samples, ignoring another finger", async () => {
    const { engine, events } = await harness();
    engine.apply(() => lineBoard());
    const p = (type: string, x: number, y: number, primary = true, id = 1) =>
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: id,
          pointerType: "touch",
          isPrimary: primary,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    p("pointerdown", cellX(6), cellY(6));
    p("pointerdown", cellX(1), cellY(1), false, 2);
    p("pointermove", cellX(7), cellY(6));
    p("pointerup", cellX(7), cellY(6));
    await engine.advance(1);
    expect(engine.state.phase).toBe("swapping");
    expect(engine.state.pointer.device).toBe("touch");
    expect(engine.state.selection).toBeNull();
  });
  it("plays each event once per frame and never plays cues from debug poses", async () => {
    const { engine } = await harness();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply(() => deterministic(lineBoard()));
    engine.apply((s) => debug.requestSwap(s, 6, 6, 7, 6));
    expect(cues).toEqual([]);
    await engine.advance(12);
    expect(cues.filter((c) => c === C.CUES.clear)).toHaveLength(1);
    expect(engine.state.lastPoints).toBeGreaterThan(0);
    expect(engine.state.simTime).toBeCloseTo(0.2);
    await engine.advance(60);
    expect(engine.state.bestMove).toBeGreaterThan(0);
  });
  it("renders every screen, every damage/cut and live particles through the recorder", async () => {
    const { engine } = await harness();
    engine.startRecording();
    await engine.advance(1);
    for (const screen of [
      "howto",
      "paused",
      "levelclear",
      "gameover",
    ] as Screen[]) {
      engine.apply((s) =>
        debug.setScreen({ ...s, board: dealBoard() }, screen),
      );
      await engine.advance(1);
    }
    let s = lineBoard();
    s = set(s, 1, 3, "R3b");
    s = set(s, 4, 4, "B2s");
    s = set(s, 5, 5, "X0");
    s = set(s, 6, 5, "X1");
    s = set(s, 7, 5, "X3");
    s = debug.setSelection(s, 3, 3);
    s = debug.setOffer(s, 4, 3);
    engine.apply((old) => ({ ...s, assets: old.assets }));
    await engine.advance(1);
    engine.apply((old) => ({
      ...requestSwap(old, { col: 6, row: 6 }, { col: 7, row: 6 }),
      selection: null,
      offer: null,
    }));
    await engine.advance(70);
    const recording = engine.stopRecording();
    expect(recording.frames.length).toBeGreaterThan(70);
    expect(recording.ops.length).toBeGreaterThan(500);
    expect(
      recording.ops.filter(
        (op) => op.op === "call" && op.method === "drawImage",
      ).length,
    ).toBeGreaterThan(20);
  });
  it("supports uneven engine clocks without reading wall time", async () => {
    const { engine } = await harness();
    engine.apply(() =>
      deterministic(
        requestSwap(lineBoard(), { col: 6, row: 6 }, { col: 7, row: 6 }),
      ),
    );
    engine.setClock(new SequenceClock([7, 13, 20]));
    await engine.advance(75);
    expect(engine.state.simTime).toBeCloseTo(1);
    expect(engine.state.phase).toBe("idle");
    expect(engine.state.score).toBeGreaterThan(0);
  });
  it("pausing freezes the chain while simulation time continues", async () => {
    const { engine } = await harness();
    engine.apply(() => ({
      ...requestSwap(lineBoard(), { col: 6, row: 6 }, { col: 7, row: 6 }),
      screen: "paused",
    }));
    await engine.advance(60);
    expect(engine.state.swapTimer).toBe(0);
    expect(engine.state.phase).toBe("swapping");
    expect(engine.state.simTime).toBeCloseTo(1);
  });
});

it("exports the exact fixed geometry and recognizes a genuinely dead board", () => {
  expect(cellX(0)).toBe(388);
  expect(cellY(0)).toBe(144);
  expect(cellX(7)).toBe(892);
  expect(cellY(7)).toBe(648);
  expect(legalSwap(base().board)).toBe(false);
  expect(productive(base().board, { col: 0, row: 0 }, { col: 1, row: 0 })).toBe(
    false,
  );
  expect(pointerEvent(initialState(), "up", 0, 0).screen).toBe("title");
});
