import type { DeepReadonly } from "ts-essentials";
import type { InitApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import type { FacetState } from "./game";
import * as C from "./constants";

export interface AssetBundle {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly fx: Readonly<Record<string, DeepReadonly<ParticleSystem>>>;
}
export async function loadAssets(
  api: InitApi<FacetState>,
): Promise<AssetBundle> {
  const paths: string[] = [];
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
      paths.push(`gems/${kind}-${strain}.png`);
  for (const kind of C.GEM_KINDS)
    for (let frame = 0; frame < 6; frame++)
      paths.push(`gems/break/${kind}/${frame}.png`);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
    for (let frame = 0; frame < 12; frame++)
      paths.push(`gems/prism-turn/${strain}/${frame}.png`);
  paths.push("gems/brilliant.png", "gems/star.png", "gems/board-frame.png");
  const sounds = Object.values(C.CUES).map((cue) =>
    api.audio.load(cue, `audio/${cue === C.CUES.clear ? "shatter" : cue}.wav`),
  );
  for (let i = 1; i <= C.MAX_MULTIPLIER; i++)
    sounds.push(api.audio.load(`ladder-${i}`, `audio/chain-${i}.wav`));
  sounds.push(
    api.audio.load("title-music", "audio/title.wav"),
    api.audio.load("play-music", "audio/play.wav"),
  );
  const [images, fx] = await Promise.all([
    Promise.all(
      paths.map(
        async (path) => [path, await api.assets.loadImage(path)] as const,
      ),
    ),
    Promise.all(
      ["clear", "flawed", "cut", "aura"].map(
        async (name) =>
          [
            name,
            JSON.parse(
              await (await api.assets.load(`fx/${name}/system.json`)).text(),
            ) as ParticleSystem,
          ] as const,
      ),
    ),
    Promise.all(sounds),
  ]);
  return { images: Object.fromEntries(images), fx: Object.fromEntries(fx) };
}
