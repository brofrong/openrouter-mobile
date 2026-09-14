import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const ROOT = path.resolve(import.meta.dir, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const BUMP_KINDS = ["major", "minor", "bugfix"] as const;
export type BumpKind = (typeof BUMP_KINDS)[number];

export const parseSemver = (
  version: string,
): { major: number; minor: number; patch: number } => {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

export const nextVersion = (current: string, kind: BumpKind): string => {
  const { major, minor, patch } = parseSemver(current);
  if (kind === "major") {
    return `${major + 1}.0.0`;
  }
  if (kind === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
};

export const parseReleaseArg = (
  argv: readonly string[],
): string | undefined => {
  const args = argv.filter((arg) => arg !== "--");
  return args[0];
};

export const resolveBumpKind = (input: string): BumpKind => {
  const normalized = input.trim().toLowerCase();
  if (normalized === "1" || normalized === "major") {
    return "major";
  }
  if (normalized === "2" || normalized === "minor") {
    return "minor";
  }
  if (normalized === "3" || normalized === "bugfix" || normalized === "patch") {
    return "bugfix";
  }
  throw new Error(
    `Unknown bump "${input}". Use major, minor, or bugfix (or 1/2/3).`,
  );
};

export const formatBumpMenu = (current: string): string => {
  const lines = BUMP_KINDS.map((kind, index) => {
    const n = index + 1;
    const padded = kind.padEnd(6, " ");
    return `  ${n}) ${padded}  ${current} → ${nextVersion(current, kind)}`;
  });
  return [
    `Current version: ${current}`,
    ...lines,
    "Choose major, minor, or bugfix: ",
  ].join("\n");
};

export const promptBumpKind = (
  current: string,
  ask: (question: string) => string | null,
): BumpKind => {
  const answer = ask(formatBumpMenu(current));
  if (answer === null || answer.trim().length === 0) {
    throw new Error("Release cancelled.");
  }
  return resolveBumpKind(answer);
};

const readRootPackage = (): { version: string } & Record<string, unknown> => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
    version?: string;
  } & Record<string, unknown>;
  if (typeof pkg.version !== "string") {
    throw new Error("Root package.json is missing version");
  }
  return { ...pkg, version: pkg.version };
};

const writeRootPackage = (pkg: Record<string, unknown>) => {
  writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`);
};

const assertCleanTree = async () => {
  const status = (await $`git status --porcelain`.cwd(ROOT).text()).trim();
  if (status.length > 0) {
    throw new Error("Working tree is not clean. Commit or stash first.");
  }
};

const resolveKind = (current: string, arg: string | undefined): BumpKind => {
  if (arg !== undefined) {
    return resolveBumpKind(arg);
  }
  if (!process.stdin.isTTY) {
    throw new Error("Pass a bump kind: bun run release major | minor | bugfix");
  }
  return promptBumpKind(current, (question) => prompt(question));
};

const main = async () => {
  const arg = parseReleaseArg(process.argv.slice(2));
  await assertCleanTree();

  const pkg = readRootPackage();
  const kind = resolveKind(pkg.version, arg);
  const version = nextVersion(pkg.version, kind);
  const tag = `v${version}`;
  const message = `chore: release ${tag}`;

  writeRootPackage({ ...pkg, version });

  await $`git add package.json`.cwd(ROOT);
  await $`git commit -m ${message}`.cwd(ROOT);
  await $`git tag -a ${tag} -m ${message}`.cwd(ROOT);
  await $`git push origin HEAD`.cwd(ROOT);
  await $`git push origin ${tag}`.cwd(ROOT);

  console.info(`Released ${tag} (${kind}) and pushed commit + tag to origin.`);
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
