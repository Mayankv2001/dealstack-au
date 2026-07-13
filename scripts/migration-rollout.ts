import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  approvalPhrase,
  buildEvidence,
  hashOfferRows,
  normaliseMigrationFilename,
  type MigrationRolloutPhase,
  type MigrationRolloutState,
} from "../lib/tooling/migrationRollout";

interface Options {
  migration: string;
  phase: MigrationRolloutPhase;
  allowDirty: boolean;
}

function parseOptions(argv: string[]): Options {
  const value = (name: string): string | null => {
    const direct = argv.find((arg) => arg.startsWith(`${name}=`));
    if (direct) return direct.slice(name.length + 1);
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  const migration = normaliseMigrationFilename(value("--migration") ?? "");
  const phase = (value("--phase") ?? "dry-run") as MigrationRolloutPhase;
  if (!["dry-run", "before", "approve-apply", "after"].includes(phase)) {
    throw new Error("Phase must be dry-run, before, approve-apply, or after.");
  }
  return { migration, phase, allowDirty: argv.includes("--allow-dirty") };
}

function command(commandLine: string): string {
  const result = spawnSync(commandLine, { shell: true, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${commandLine} failed:\n${result.stderr || result.stdout || "unknown error"}`
    );
  }
  return result.stdout.trim();
}

function assertLocalPreflight(options: Options): string {
  const migrationPath = resolve("supabase/migrations", options.migration);
  if (basename(migrationPath) !== options.migration || !existsSync(migrationPath)) {
    throw new Error(`Migration not found: ${options.migration}`);
  }
  if (!readFileSync(migrationPath, "utf8").trim()) {
    throw new Error("Migration file is empty.");
  }
  const manifest = readFileSync(resolve("scripts/schema-manifest.ts"), "utf8");
  if (!manifest.includes(options.migration)) {
    throw new Error("Migration is not registered in scripts/schema-manifest.ts.");
  }
  if (!options.allowDirty && command("git status --porcelain")) {
    throw new Error("Working tree must be clean before migration rollout.");
  }
  return migrationPath;
}

function requireNode22(): void {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("Node 22 or newer is required for production schema probes.");
  }
}

async function offerHash(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("gift_card_offers")
    .select("id,updated_at")
    .order("id");
  if (error) throw new Error(`Offer hash query failed: ${error.message}`);
  return hashOfferRows(data ?? []);
}

function statePath(migration: string): string {
  return resolve(".migration-rollout-state", `${migration}.json`);
}

function printDryRun(migrationPath: string): void {
  console.log(`Migration rollout dry run: ${migrationPath}`);
  console.log("1. Review the exact SQL and confirm manifest ownership.");
  console.log("2. Run --phase before under Node 22 to capture the read-only baseline.");
  console.log("3. Obtain explicit approval for this exact migration.");
  console.log("4. Run --phase approve-apply and type the displayed phrase.");
  console.log("5. Apply only the reviewed SQL using the approved Supabase workflow.");
  console.log("6. Run --phase after to probe schema, regenerate types and compare hashes.");
  console.log("Dry-run made no network request and changed no files.");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const migrationPath = assertLocalPreflight(options);
  if (options.phase === "dry-run") {
    printDryRun(migrationPath);
    return;
  }
  if (options.phase === "before") {
    requireNode22();
    const state: MigrationRolloutState = {
      migration: options.migration,
      beforeHash: await offerHash(),
      capturedAt: new Date().toISOString(),
    };
    mkdirSync(resolve(".migration-rollout-state"), { recursive: true });
    writeFileSync(statePath(options.migration), `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(JSON.stringify(state, null, 2));
    console.log("STOP: obtain explicit approval before any migration apply.");
    return;
  }
  if (options.phase === "approve-apply") {
    if (!stdin.isTTY || !stdout.isTTY) {
      throw new Error("Approval acknowledgement requires an interactive terminal.");
    }
    const phrase = approvalPhrase(options.migration);
    const terminal = createInterface({ input: stdin, output: stdout });
    const answer = await terminal.question(`Type exactly: ${phrase}\n> `);
    terminal.close();
    if (answer !== phrase) throw new Error("Approval phrase did not match; stopping.");
    console.log("Approval acknowledged for this invocation.");
    console.log(
      "This tool intentionally does not run bulk db push because the remote migration ledger is partial. Apply only the reviewed SQL through the separately approved Supabase workflow, then run --phase after."
    );
    return;
  }

  requireNode22();
  const path = statePath(options.migration);
  if (!existsSync(path)) throw new Error("No before-state found; run --phase before first.");
  const state = JSON.parse(readFileSync(path, "utf8")) as MigrationRolloutState;
  if (state.migration !== options.migration) {
    throw new Error("Before-state migration mismatch.");
  }
  command("npm run verify:schema");
  command("npm run types:gen");
  command("npx tsc --noEmit");
  command("npm run test:admin");
  const evidence = buildEvidence(state, await offerHash(), new Date().toISOString());
  console.log("\nMigration rollout evidence\n");
  console.log("```json");
  console.log(JSON.stringify(evidence, null, 2));
  console.log("```");
  if (!evidence.publicOfferDataUnchanged) {
    throw new Error("Public gift-card offer hash changed; investigate before committing.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
