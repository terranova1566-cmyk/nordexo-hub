import path from "node:path";
import { spawn } from "node:child_process";

type IndexResult = { ok: true } | { ok: false; error: string };

const scriptPath = () =>
  path.join(process.cwd(), "scripts", "index-products-meili.mjs");

export const runMeiliIndexSpus = async (spus: string[]): Promise<IndexResult> => {
  const cleaned = spus.map((spu) => String(spu || "").trim()).filter(Boolean);
  if (cleaned.length === 0) return { ok: true };

  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath()], {
      env: {
        ...process.env,
        MEILI_INDEX_SPUS: cleaned.join(","),
        // Avoid re-sending settings on every publish/edit; the full index job can do that.
        MEILI_SKIP_SETTINGS: "1",
      },
      stdio: ["ignore", "inherit", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({
        ok: false,
        error: stderr.slice(-800) || "Meili indexing failed.",
      });
    });
  });
};

