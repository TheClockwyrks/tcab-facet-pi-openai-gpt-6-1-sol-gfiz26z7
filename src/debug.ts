import type {
  BoardState,
  FacetState,
  GemState,
  PointerDevice,
  Screen,
} from "./game";
import {
  cellX,
  cellY,
  dealBoard,
  emptyBoard,
  index,
  initialState,
  kindFromLetter,
  lastFall,
  legalSwap,
  requestSwap,
  stepHold,
  type State,
} from "./simulation";
import { pointerEvent, targets } from "./controls";
import * as C from "./constants";

function integer(n: number, min = 0, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new RangeError(`Invalid whole number: ${n}`);
}
function cell(col: number, row: number): void {
  integer(col, 0, C.GRID_COLS - 1);
  integer(row, 0, C.GRID_ROWS - 1);
}
function token(value: string, col: number, row: number): GemState {
  const match = /^([RACJBSMX])([0-3])([bs]?)$/.exec(value);
  if (!match || (match[1] === "X" && match[3]))
    throw new Error(`Invalid gem token: ${value}`);
  return {
    col,
    row,
    kind: match[1] === "X" ? null : kindFromLetter(match[1]),
    cut:
      match[1] === "X"
        ? "prism"
        : match[3] === "b"
          ? "brilliant"
          : match[3] === "s"
            ? "star"
            : "plain",
    strain: Number(match[2]),
    fell: 0,
  };
}
function coordinates(x: number, y: number, device: PointerDevice): void {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new RangeError("Invalid pointer");
}
export function snapshot(s: State) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: s.level * C.LEVEL_TARGET_STEP,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
// Inferred method signatures are exported as the exact public surface below.
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => ({
    ...initialState(),
    muted: s.muted,
    assets: s.assets,
  }),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot,
  setScreen(s: State, screen: Screen): FacetState {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex(s: State, menuIndex: number): FacetState {
    integer(menuIndex);
    return { ...s, menuIndex };
  },
  loadBoard(s: State, rows: readonly string[]): FacetState {
    if (rows.length !== C.GRID_ROWS) throw new Error("Expected eight rows");
    const cells = rows.flatMap((line, row) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== C.GRID_COLS)
        throw new Error("Expected eight columns");
      return parts.map((part, col) => token(part, col, row));
    });
    const board: BoardState = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    return { ...s, board };
  },
  dealBoard: (s: State): FacetState => ({ ...s, board: dealBoard() }),
  clearBoard: (s: State): FacetState => ({ ...s, board: emptyBoard() }),
  setGem(s: State, col: number, row: number, value: string): FacetState {
    cell(col, row);
    if (!s.board.cells[index({ col, row })])
      throw new Error("No board in play");
    const replacement = token(value, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) =>
          i === index(replacement) ? replacement : g,
        ),
      },
    };
  },
  setRefillKinds(s: State, col: number, kinds: string): FacetState {
    integer(col, 0, C.GRID_COLS - 1);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill kinds");
    return {
      ...s,
      refillKinds: s.refillKinds.map((k, i) => (i === col ? kinds : k)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  }),
  setScore(s: State, score: number): FacetState {
    integer(score);
    return { ...s, score };
  },
  setLevel(s: State, level: number): FacetState {
    integer(level, 1);
    return { ...s, level };
  },
  setLevelScore(s: State, levelScore: number): FacetState {
    integer(levelScore);
    return { ...s, levelScore };
  },
  setBestChain(s: State, bestChain: number): FacetState {
    integer(bestChain);
    return { ...s, bestChain };
  },
  setBestMove(s: State, bestMove: number): FacetState {
    integer(bestMove);
    return { ...s, bestMove };
  },
  setMoveScore(s: State, moveScore: number): FacetState {
    integer(moveScore);
    return { ...s, moveScore };
  },
  setSelection(s: State, col: number, row: number): FacetState {
    cell(col, row);
    return { ...s, selection: { col, row } };
  },
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer(s: State, col: number, row: number): FacetState {
    cell(col, row);
    return { ...s, offer: { col, row } };
  },
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap(
    s: State,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState {
    cell(colA, rowA);
    cell(colB, rowB);
    if (!s.board.cells.length) throw new Error("No board in play");
    return requestSwap(s, { col: colA, row: rowA }, { col: colB, row: rowB });
  },
  pointerDown(
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState {
    coordinates(x, y, device);
    return pointerEvent(s, "down", x, y, device);
  },
  pointerMove(
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): FacetState {
    coordinates(x, y, device);
    return pointerEvent(s, "move", x, y, device);
  },
  pointerUp(s: State, device: PointerDevice = "mouse"): FacetState {
    coordinates(s.pointer.x, s.pointer.y, device);
    return pointerEvent(s, "up", s.pointer.x, s.pointer.y, device);
  },
};
export type DebugApi = typeof debug;
export type FacetSnapshot = ReturnType<typeof snapshot>;
