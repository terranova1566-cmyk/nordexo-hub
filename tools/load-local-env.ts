import fs from "node:fs";
import path from "node:path";

const ENV_FILES = [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
  "/srv/nordexo-hub/.env.local",
  "/srv/nordexo-hub/.env",
];

export function loadLocalEnv() {
  for (const filePath of ENV_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/g);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}
