/**
 * dependency-cruiser configuration for auto-cron.
 *
 * Enforces the Hexagonal 3-layer dependency direction:
 *   core   ← adapters ← main
 *
 * - core/    must not import from adapters/ or main/
 * - adapters/ must not import from main/
 * - main/    may import from anything
 */
module.exports = {
  forbidden: [
    {
      name: "core-cannot-depend-on-adapters",
      severity: "error",
      from: { path: "^src/core" },
      to: { path: "^src/adapters" },
    },
    {
      name: "core-cannot-depend-on-main",
      severity: "error",
      from: { path: "^src/core" },
      to: { path: "^src/main" },
    },
    {
      name: "adapters-cannot-depend-on-main",
      severity: "error",
      from: { path: "^src/adapters" },
      to: { path: "^src/main" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies make code hard to reason about and test. Refactor to remove the cycle.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Orphan modules (not imported anywhere) are usually leftovers from refactors. Either delete or wire up.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)src/main/",
          "(^|/)src/core/port/",
          "(^|/)src/core/entity/",
          "\\.test\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
