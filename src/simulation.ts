import type { DeepReadonly } from "ts-essentials";
import type {
  BoardState,
  CellRef,
  Cut,
  FacetState,
  GemKind,
  GemState,
} from "./game";
import * as C from "./constants";

export type State = DeepReadonly<FacetState>;
export type Emit = (cue: string) => void;
const silent: Emit = () => {};
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const emptyBoard = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export const randomKind = (): GemKind =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export const gem = (
  col: number,
  row: number,
  kind: GemKind = randomKind(),
  fell = 0,
): GemState => ({ col, row, kind, cut: C.CUTS[0], strain: 0, fell });
export function initialState(): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted: false,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  };
}
export interface Run {
  readonly cells: readonly number[];
  readonly horizontal: boolean;
}
/** R4: scan each axis once, emitting only maximal kind-bearing runs. */
export function runs(board: DeepReadonly<BoardState>): Run[] {
  const result: Run[] = [];
  if (!board.cells.length) return result;
  for (const horizontal of [true, false]) {
    const lines = horizontal ? board.rows : board.cols;
    const length = horizontal ? board.cols : board.rows;
    for (let line = 0; line < lines; line++) {
      let start = 0;
      const at = (n: number) =>
        horizontal ? line * board.cols + n : n * board.cols + line;
      while (start < length) {
        const kind = board.cells[at(start)].kind;
        let end = start + 1;
        while (
          end < length &&
          kind !== null &&
          board.cells[at(end)].kind === kind
        )
          end++;
        if (kind !== null && end - start >= C.MATCH_MIN)
          result.push({
            cells: Array.from({ length: end - start }, (_, i) => at(start + i)),
            horizontal,
          });
        start = end;
      }
    }
  }
  return result;
}
export function exchanged(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): BoardState {
  const ai = index(a),
    bi = index(b);
  return {
    ...board,
    cells: board.cells.map((g, i) =>
      i === ai
        ? { ...board.cells[bi], ...a, fell: 0 }
        : i === bi
          ? { ...board.cells[ai], ...b, fell: 0 }
          : g,
    ),
  };
}
export function productive(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): boolean {
  if (!board.cells[index(a)] || !board.cells[index(b)] || !adjacent(a, b))
    return false;
  return (
    board.cells[index(a)].cut === "prism" ||
    board.cells[index(b)].cut === "prism" ||
    runs(exchanged(board, a, b)).length > 0
  );
}
export function legalSwap(board: DeepReadonly<BoardState>): boolean {
  for (const g of board.cells) {
    if (
      g.col + 1 < board.cols &&
      productive(board, g, { col: g.col + 1, row: g.row })
    )
      return true;
    if (
      g.row + 1 < board.rows &&
      productive(board, g, { col: g.col, row: g.row + 1 })
    )
      return true;
  }
  return false;
}
export function dealBoard(): BoardState {
  // Reject only draws that form an opening run. Each attempt still draws uniformly.
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let g: GemState;
        do {
          g = gem(col, row, randomKind(), C.GRID_ROWS);
        } while (
          (col >= C.MATCH_MIN - 1 &&
            cells[cells.length - 1].kind === g.kind &&
            cells[cells.length - 2].kind === g.kind) ||
          (row >= C.MATCH_MIN - 1 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === g.kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === g.kind)
        );
        cells.push(g);
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export function openRound(s: State): FacetState {
  return {
    ...initialState(),
    assets: s.assets,
    muted: s.muted,
    simTime: s.simTime,
    pointer: s.pointer,
    refillKinds: s.refillKinds,
    screen: "playing",
    board: dealBoard(),
    visual: { swap: null, broken: [], before: null, created: [], opening: 0 },
  };
}
export function nextLevel(s: State): FacetState {
  return {
    ...s,
    screen: "playing",
    menuIndex: 0,
    board: dealBoard(),
    level: s.level + 1,
    levelScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    armedTarget: null,
    visual: { swap: null, broken: [], before: null, created: [], opening: 0 },
  };
}
export function requestSwap(
  s: State,
  a: CellRef,
  b: CellRef,
  emit: Emit = silent,
): FacetState {
  if (s.phase !== "idle" || !productive(s.board, a, b)) {
    emit(C.CUES.refuse);
    return { ...s, refusal: { a, b, timer: 0 } };
  }
  emit(C.CUES.swap);
  return {
    ...s,
    board: exchanged(s.board, a, b),
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    visual: { swap: [a, b], broken: [], before: null, created: [], opening: 1 },
  };
}
function neighbors(i: number, diagonal = false): number[] {
  const col = i % C.GRID_COLS,
    row = Math.floor(i / C.GRID_COLS),
    result: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!diagonal && Math.abs(dx) + Math.abs(dy) !== 1))
        continue;
      const x = col + dx,
        y = row + dy;
      if (x >= 0 && x < C.GRID_COLS && y >= 0 && y < C.GRID_ROWS)
        result.push(y * C.GRID_COLS + x);
    }
  return result;
}
export interface ClearSet {
  readonly waves: ReadonlyMap<number, number>;
  readonly runs: readonly Run[];
}
/** R5/R6: a breadth-first closure gives every addition its minimum wave. */
export function clearSet(s: State): ClearSet {
  const rr = runs(s.board);
  const seed = new Set(rr.flatMap((r) => [...r.cells]));
  let prismSeed = false;
  if (s.chainStep === 1 && s.visual?.swap) {
    const [a, b] = s.visual.swap.map((p) => s.board.cells[index(p)]);
    if (a.cut === "prism" || b.cut === "prism") {
      prismSeed = true;
      seed.clear();
      const both = a.cut === "prism" && b.cut === "prism";
      const kind = a.cut === "prism" ? b.kind : a.kind;
      for (const [i, g] of s.board.cells.entries())
        if (
          both ||
          g.kind === kind ||
          (g === a && a.cut === "prism") ||
          (g === b && b.cut === "prism")
        )
          seed.add(i);
    }
  }
  const waves = new Map<number, number>([...seed].map((i) => [i, 0]));
  const queue = [...seed];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = s.board.cells[i];
    const add = new Set(
      neighbors(i).filter((j) => s.board.cells[j].strain === C.MAX_STRAIN),
    );
    if (g.cut === "brilliant") for (const j of neighbors(i, true)) add.add(j);
    if (g.cut === "star")
      for (const [j, h] of s.board.cells.entries())
        if (h.row === g.row || h.col === g.col) add.add(j);
    for (const j of add)
      if (!waves.has(j)) {
        waves.set(j, waves.get(i)! + 1);
        queue.push(j);
      }
  }
  return { waves, runs: prismSeed ? [] : rr };
}
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
const letters = "RACJBSM";
export const kindFromLetter = (letter: string): GemKind =>
  C.GEM_KINDS[letters.indexOf(letter)];
export function resolveStep(
  s: State,
  clear: ClearSet,
  emit: Emit = silent,
): FacetState {
  const { waves } = clear,
    made = new Map<number, Cut>();
  const priority: Record<Cut, number> = {
    plain: 0,
    brilliant: 1,
    star: 2,
    prism: 3,
  };
  const create = (i: number, cut: Cut) => {
    if (priority[cut] > priority[made.get(i) ?? "plain"]) made.set(i, cut);
  };
  for (const run of clear.runs) {
    if (run.cells.length >= C.MATCH_MIN + 1) {
      const swapped =
        s.visual?.swap
          ?.map(index)
          .filter((i) => run.cells.includes(i))
          .sort((a, b) => a - b) ?? [];
      const place =
        swapped[0] ?? run.cells[Math.floor((run.cells.length - 1) / 2)];
      create(
        place,
        run.cells.length >= C.MATCH_MIN + 2 ? "prism" : "brilliant",
      );
    }
  }
  for (const h of clear.runs.filter((r) => r.horizontal))
    for (const v of clear.runs.filter((r) => !r.horizontal))
      for (const i of h.cells) if (v.cells.includes(i)) create(i, "star");
  const multiplier = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  const points = [...waves.keys()].reduce(
    (n, i) =>
      n +
      (s.board.cells[i].strain === C.MAX_STRAIN
        ? C.FLAWED_SCORE
        : C.BASE_SCORE) *
        multiplier,
    0,
  );
  let flaw = false;
  const created: GemState[] = [];
  const survivors = s.board.cells.map((g, i): GemState | null => {
    if (waves.has(i)) {
      const cut = made.get(i);
      if (!cut) return null;
      const next = {
        ...g,
        cut,
        kind: cut === "prism" ? null : g.kind,
        strain: 0,
        fell: 0,
      };
      created.push(next);
      return next;
    }
    const strain = neighbors(i).some((j) => waves.has(j))
      ? Math.min(C.MAX_STRAIN, g.strain + 1)
      : g.strain;
    if (strain === C.MAX_STRAIN && strain !== g.strain) flaw = true;
    return { ...g, strain, fell: 0 };
  });
  const cells: GemState[] = Array<GemState>(C.GRID_COLS * C.GRID_ROWS);
  for (let col = 0; col < C.GRID_COLS; col++) {
    const column = survivors.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const vacancies = C.GRID_ROWS - column.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      if (row < vacancies)
        cells[row * C.GRID_COLS + col] = gem(
          col,
          row,
          s.refillKinds[col][row]
            ? kindFromLetter(s.refillKinds[col][row])
            : randomKind(),
          vacancies,
        );
      else {
        const g = column[row - vacancies];
        cells[row * C.GRID_COLS + col] = { ...g, row, fell: row - g.row };
      }
    }
  }
  emit(C.CUES.clear);
  emit(`ladder-${multiplier}`);
  if (flaw) emit(C.CUES.flaw);
  if (made.size) emit(C.CUES.cut);
  return {
    ...s,
    board: { ...s.board, cells },
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    lastCleared: waves.size,
    lastPoints: points,
    lastWaves: Math.max(0, ...waves.values()),
    bestChain: Math.max(s.bestChain, s.chainStep),
    stepTimer: 0,
    visual: {
      swap: s.visual?.swap ?? null,
      before: s.board,
      broken: [...waves].map(([i, wave]) => ({ gem: s.board.cells[i], wave })),
      created,
      opening: 1,
    },
  };
}
/** Consume every crossed boundary, preserving leftover delta (including uneven clocks). */
export function advance(
  state: State,
  dt: number,
  emit: Emit = silent,
): FacetState {
  if (state.screen !== "playing") return { ...state };
  let s: FacetState = { ...state };
  if (s.refusal)
    s = {
      ...s,
      refusal:
        s.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...s.refusal, timer: s.refusal.timer + dt },
    };
  if (s.visual && s.visual.opening < 1)
    s = {
      ...s,
      visual: {
        ...s.visual,
        opening: Math.min(
          1,
          s.visual.opening + dt / (C.GRID_ROWS * C.FALL_SECONDS_PER_ROW),
        ),
      },
    };
  let remaining = dt;
  while (remaining > 0 && s.phase !== "idle") {
    if (s.phase === "swapping") {
      const take = Math.min(remaining, C.SWAP_SECONDS - s.swapTimer);
      remaining -= take;
      s = { ...s, swapTimer: s.swapTimer + take };
      if (s.swapTimer + 1e-10 < C.SWAP_SECONDS) break;
      s = {
        ...s,
        phase: "resolving",
        swapTimer: 0,
        chainStep: 1,
        stepTimer: 0,
      };
      s = resolveStep(s, clearSet(s), emit);
    } else {
      const hold = stepHold(s),
        land =
          s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
      const take = Math.min(remaining, Math.max(0, hold - s.stepTimer));
      remaining -= take;
      const next = s.stepTimer + take;
      if (
        s.stepTimer < land &&
        next + 1e-10 >= land &&
        lastFall(s) > C.LAND_MIN_ROWS
      )
        emit(C.CUES.land);
      s = { ...s, stepTimer: next };
      if (s.stepTimer + 1e-10 < hold) break;
      s = { ...s, stepTimer: 0, chainStep: s.chainStep + 1 };
      const set = clearSet(s);
      if (set.waves.size) s = resolveStep(s, set, emit);
      else {
        s = {
          ...s,
          phase: "idle",
          chainStep: 0,
          bestMove: Math.max(s.bestMove, s.moveScore),
          visual: s.visual
            ? { ...s.visual, before: null, broken: [], created: [] }
            : undefined,
        };
        if (s.levelScore >= s.level * C.LEVEL_TARGET_STEP) {
          s = { ...s, screen: "levelclear", menuIndex: 0, armedTarget: null };
          emit(C.CUES.levelUp);
        } else if (!legalSwap(s.board)) {
          s = { ...s, screen: "gameover", menuIndex: 0, armedTarget: null };
          emit(C.CUES.gameOver);
        }
        break;
      }
    }
  }
  return s;
}
