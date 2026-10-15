import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { BACKGROUND, game } from "../src/game";
import * as C from "../src/constants";
import { cellX, cellY } from "../src/simulation";

/** Development-only capture driver. The production page publishes no engine handle. */
export async function capture(mode: "title" | "board" | "replay") {
  const canvas = document.querySelector<HTMLCanvasElement>("#capture");
  if (!canvas) throw new Error("Missing capture surface");
  const engine = createEngine({
    canvas,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  const d = engine.debug;
  if (mode === "title") {
    await engine.advance(1);
    engine.destroy();
    return null;
  }
  // A posed but real position. Every swap, wave, fall and score runs the game itself.
  const rows = [
    "R0 A0 C0 J0 B0 S0 M0 R0",
    "C0 J1 B0 S0 M0 R0 A0 C0",
    "B0 S0 M2 R0s A0 C0 J0 B0",
    "M0 A0 R0 A0 R0b B1 S0 M0",
    "A0 C0 J3 B3 S3 M2 R3 A0",
    "J0 B0 S2 M3 R3 A0 C0 J0",
    "S0 M0 R0 A0 X0 J0 B0 S0",
    "R0 A0 C0 J0 B0 S0 M0 R0",
  ];
  engine.apply((s) => d.loadBoard(s, rows));
  engine.apply((s) => d.setScreen(s, "playing"));
  engine.apply((s) => d.setScore(s, 840));
  engine.apply((s) => d.setLevelScore(s, 840));
  await engine.advance(1);
  if (mode === "board") {
    engine.destroy();
    return null;
  }
  engine.startRecording();
  await engine.advance(30);
  engine.apply((s) => d.pointerDown(s, cellX(3), cellY(2)));
  engine.apply((s) => d.pointerMove(s, cellX(3), cellY(3)));
  await engine.advance(8);
  const originalRandom = Math.random;
  let seed = 153;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  engine.apply((s) => d.pointerUp(s));
  await engine.advance(202);
  Math.random = originalRandom;
  const recording = engine.stopRecording();
  const result = { recording, snapshot: d.snapshot(engine.state) };
  engine.destroy();
  return result;
}
