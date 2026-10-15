import "./stage.css";
import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { AssetBundle } from "./assets";
import { loadAssets } from "./assets";
import { debug, type DebugApi } from "./debug";
import { initialState, advance, lastFall, legalSwap } from "./simulation";
import { action, pointerEvent } from "./controls";
import { render } from "./presentation";
import * as C from "./constants";

export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly assets?: AssetBundle;
  readonly visual?: VisualState;

  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
}

export interface BrokenGem {
  readonly gem: GemState;
  readonly wave: number;
}
export interface VisualState {
  readonly swap: readonly [CellRef, CellRef] | null;
  readonly broken: readonly BrokenGem[];
  readonly before: BoardState | null;
  readonly created: readonly GemState[];
  readonly opening: number;
}
export type FacetDebugApi = DebugApi;
export const BACKGROUND = "#0b141b";

export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const assets = await loadAssets(api);
    const sources: Record<
      string,
      (s: DeepReadonly<FacetState>) => string | number | boolean
    > = {
      screen: (s) => s.screen,
      phase: (s) => s.phase,
      board: (s) => `${s.board.cols} × ${s.board.rows}`,
      score: (s) => s.score,
      level: (s) => s.level,
      levelScore: (s) => `${s.levelScore} / ${s.level * C.LEVEL_TARGET_STEP}`,
      chainStep: (s) => s.chainStep,
      multiplier: (s) => Math.min(s.chainStep, C.MAX_MULTIPLIER),
      lastCleared: (s) => s.lastCleared,
      lastPoints: (s) => s.lastPoints,
      lastWaves: (s) => s.lastWaves,
      lastFall,
      selection: (s) =>
        s.selection ? `${s.selection.col},${s.selection.row}` : "—",
      offer: (s) => (s.offer ? `${s.offer.col},${s.offer.row}` : "—"),
      bestMove: (s) => s.bestMove,
      bestChain: (s) => s.bestChain,
      legalSwap: (s) => legalSwap(s.board),
      pointer: (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    };
    for (const [name, source] of Object.entries(sources))
      api.diagnostics.register(name, source);
    return [{ ...initialState(), assets }, debug];
  },
  update(state, api, dt) {
    let s: FacetState = { ...state, simTime: state.simTime + dt };
    const cues = new Set<string>();
    const emit = (cue: string) => {
      cues.add(cue);
    };
    const pressed = Object.fromEntries(
      C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
    );
    if (pressed.mute) api.audio.setMuted(!api.audio.muted());
    // Actions are resolved against the screen at frame entry: Escape is not taken twice.
    if (pressed.pause && (s.screen === "playing" || s.screen === "paused"))
      s = action(s, "pause");
    else if (pressed.back) s = action(s, "back");
    if (pressed.up) s = action(s, "up");
    if (pressed.down) s = action(s, "down");
    if (pressed.confirm) s = action(s, "confirm");
    for (const p of api.input.pointerSamples()) {
      if (!p.primary || (p.button && p.button !== "primary")) continue;
      s = pointerEvent(s, p.type, p.x, p.y, p.device, emit);
    }
    const p = api.input.pointer();
    s = {
      ...s,
      pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
      muted: api.audio.muted(),
    };
    s = advance(s, dt, emit);
    for (const cue of cues) api.audio.play(cue);
    const music =
      s.screen === "title" || s.screen === "howto"
        ? "title-music"
        : "play-music";
    const other = music === "title-music" ? "play-music" : "title-music";
    if (api.audio.looping(other)) api.audio.stop(other);
    if (!api.audio.looping(music)) api.audio.loop(music);
    return s;
  },
  render,
};
