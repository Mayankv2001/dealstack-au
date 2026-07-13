#!/usr/bin/env node

const minimum = Number(process.argv[2] || 20);
const current = Number(process.versions.node.split(".")[0]);

if (!Number.isInteger(minimum) || minimum < 1) {
  console.error("Node preflight configuration is invalid.");
  process.exit(2);
}

if (current < minimum) {
  console.error(
    `Node ${minimum} or newer is required for this command (current: ${process.versions.node}). Run \`nvm use ${minimum}\` and try again.`
  );
  process.exit(1);
}
