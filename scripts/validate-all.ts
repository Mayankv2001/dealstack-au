import { spawnSync } from "node:child_process";

interface Step {
  name: string;
  command: string;
}

interface Result {
  name: string;
  status: "passed" | "failed" | "not run";
  seconds: number | null;
}

function run(command: string): number {
  return spawnSync(command, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
  }).status ?? 1;
}

function printSummary(results: Result[]): void {
  console.log("\nValidation summary");
  console.table(
    results.map((result) => ({
      step: result.name,
      status: result.status,
      duration: result.seconds == null ? "—" : `${result.seconds.toFixed(1)}s`,
    }))
  );
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(
    `Node 20 or newer is required (current: ${process.versions.node}). Run \`nvm use 20\` and try again.`
  );
  process.exit(1);
}

const withE2e = process.argv.includes("--with-e2e");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--with-e2e");
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(", ")}`);
  process.exit(2);
}

const steps: Step[] = [
  { name: "Lint", command: "npm run lint" },
  { name: "TypeScript", command: "npx tsc --noEmit" },
  { name: "Vitest", command: "npx vitest run" },
  { name: "Production build", command: "npm run build" },
  ...(withE2e
    ? [{ name: "Playwright", command: "npm run test:e2e" }]
    : []),
  { name: "Git diff", command: "git diff --check" },
];

const results: Result[] = steps.map((step) => ({
  name: step.name,
  status: "not run",
  seconds: null,
}));

for (const [index, step] of steps.entries()) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.name}: ${step.command}`);
  const started = Date.now();
  const code = run(step.command);
  results[index] = {
    name: step.name,
    status: code === 0 ? "passed" : "failed",
    seconds: (Date.now() - started) / 1000,
  };
  if (code !== 0) {
    printSummary(results);
    process.exit(code);
  }
}

printSummary(results);
