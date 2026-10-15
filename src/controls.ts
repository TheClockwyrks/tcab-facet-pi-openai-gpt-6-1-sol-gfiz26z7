import type { CellRef, FacetState, PointerDevice } from "./game";
import type { Emit, State } from "./simulation";
import {
  adjacent,
  cellX,
  cellY,
  emptyBoard,
  nextLevel,
  openRound,
  requestSwap,
} from "./simulation";
import * as C from "./constants";

export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function menuItems(s: State): readonly string[] {
  switch (s.screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSED_ITEMS;
    case "levelclear":
      return C.LEVELCLEAR_ITEMS;
    case "gameover":
      return C.GAMEOVER_ITEMS;
    default:
      return [];
  }
}
export function targets(s: State): Target[] {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1060, y: 26, w: 144, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 1056, y: 598, w: 160, h: C.TARGET_MIN_H }];
  return menuItems(s).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 152 : 470,
    y: (s.screen === "title" ? 414 : 420) + i * 90,
    w: Math.max(C.TARGET_MIN_W, 340),
    h: C.TARGET_MIN_H,
  }));
}
export function action(s: State, name: string): FacetState {
  const items = menuItems(s);
  if ((name === "up" || name === "down") && items.length)
    return {
      ...s,
      menuIndex:
        (s.menuIndex + (name === "up" ? -1 : 1) + items.length) % items.length,
    };
  const screen = (value: FacetState["screen"], menuIndex = 0): FacetState => ({
    ...s,
    screen: value,
    menuIndex,
    armedTarget: null,
  });
  if (name === "pause") {
    if (s.screen === "playing") return screen("paused");
    if (s.screen === "paused") return screen("playing");
  }
  if (name === "back") {
    if (s.screen === "howto") return screen("title", 1);
    if (s.screen === "gameover") return screen("title");
  }
  if (name !== "confirm") return { ...s };
  if (s.screen === "title")
    return s.menuIndex === 0 ? openRound(s) : screen("howto");
  if (!items.length) return { ...s };
  if (s.menuIndex === 0) {
    if (s.screen === "paused") return screen("playing");
    if (s.screen === "levelclear") return nextLevel(s);
    if (s.screen === "gameover") return openRound(s);
  }
  return {
    ...screen("title"),
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    visual: undefined,
  };
}
export function targetCell(x: number, y: number): CellRef | null {
  let best: CellRef | null = null,
    dist = C.GEM_HIT_R * C.GEM_HIT_R;
  // Reading order plus strict replacement preserves lower row/column on a tie.
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const d = (cellX(col) - x) ** 2 + (cellY(row) - y) ** 2;
      if (d <= dist && (!best || d < dist)) {
        best = { col, row };
        dist = d;
      }
    }
  return best;
}
const same = (a: CellRef | null, b: CellRef | null) =>
  a !== null && b !== null && a.col === b.col && a.row === b.row;
export function pointerEvent(
  state: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
  emit: Emit = () => {},
): FacetState {
  let s: FacetState = {
    ...state,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : state.pointer.down,
      device,
    },
  };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (
    target?.id.startsWith("menu-") &&
    (type === "down" || !state.pointer.down)
  )
    s = { ...s, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") {
    s = { ...s, armedTarget: target?.id ?? null };
    if (target) return s;
    if (s.screen !== "playing") return s;
    const cell = targetCell(x, y);
    if (!cell) return { ...s, selection: null, offer: null };
    if (
      !s.selection ||
      (!same(s.selection, cell) && !adjacent(s.selection, cell))
    ) {
      emit(C.CUES.select);
      return { ...s, selection: cell, offer: null };
    }
    return { ...s, offer: same(s.selection, cell) ? null : cell };
  }
  if (type === "move") {
    if (
      s.screen === "playing" &&
      s.pointer.down &&
      !s.armedTarget &&
      s.selection
    ) {
      const cell = targetCell(x, y);
      if (cell && same(cell, s.selection)) return { ...s, offer: null };
      if (cell && adjacent(cell, s.selection)) return { ...s, offer: cell };
    }
    return s;
  }
  const armed = s.armedTarget;
  s = { ...s, armedTarget: null };
  if (armed) {
    if (target?.id === armed)
      return action(s, armed.startsWith("menu-") ? "confirm" : armed);
    return s;
  }
  if (s.screen === "playing" && s.selection && s.offer)
    return {
      ...requestSwap(s, s.selection, s.offer, emit),
      selection: null,
      offer: null,
    };
  return s;
}
