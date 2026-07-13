import { spawnSync } from "node:child_process";
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("lib/supabase/database.types.ts");
const temporary = `${output}.tmp`;
const command = spawnSync(
  "npx",
  [
    "supabase",
    "gen",
    "types",
    "typescript",
    "--project-id",
    "numgsivlrglflsnqehac",
    "--schema",
    "public",
  ],
  { encoding: "utf8", env: process.env }
);

if (command.status !== 0 || !command.stdout.trim()) {
  rmSync(temporary, { force: true });
  if (command.stderr) process.stderr.write(command.stderr);
  throw new Error("Supabase type generation failed; the existing types file was preserved.");
}

try {
  writeFileSync(temporary, command.stdout);
  renameSync(temporary, output);
} finally {
  rmSync(temporary, { force: true });
}

console.log(`Generated ${output}`);
