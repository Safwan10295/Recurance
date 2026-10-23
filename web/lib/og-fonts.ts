import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" };

// Figtree for the share-preview images (SIL Open Font License, assets/fonts/OFL.txt). If the files are missing,
// the images fall back to the default font rather than failing.
export async function ogFonts(): Promise<OgFont[]> {
  const dir = path.join(process.cwd(), "assets", "fonts");
  const load = async (weight: 400 | 700 | 800): Promise<OgFont | null> => {
    try {
      const b = await readFile(path.join(dir, `figtree-latin-${weight}-normal.woff`));
      return { name: "Figtree", data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, weight, style: "normal" };
    } catch {
      return null;
    }
  };
  return (await Promise.all([load(400), load(700), load(800)])).filter((f): f is OgFont => f !== null);
}
