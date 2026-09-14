import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

const ROOT = path.resolve(import.meta.dir, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

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

export const nextVersion = (current: string, spec = "patch"): string => {
  if (SEMVER.test(spec)) {
    const currentParts = parseSemver(current);
    const nextParts = parseSemver(spec);
    const currentValue =
      currentParts.major * 1_000_000 +
      currentParts.minor * 1_000 +
      currentParts.patch;
    const nextValue =
      nextParts.major * 1_000_000 + nextParts.minor * 1_000 + nextParts.patch;
    if (nextValue <= currentValue) {
      throw new Error(
        `Version ${spec} must be greater than current ${current}`,
      );
    }
    return spec;
  }
  if (spec !== "patch" && spec !== "minor" && spec !== "major") {
    throw new Error(
      `Unknown bump spec "${spec}". Use patch, minor, major, or X.Y.Z`,
    );
  }
  const { major, minor, patch } = parseSemver(current);
  if (spec === "major") {
    return `${major + 1}.0.0`;
  }
  if (spec === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
};

export const parseArgs = (
  argv: readonly string[],
): { spec: string; push: boolean } => {
  const args = argv.filter((arg) => arg !== "--");
  return {
    spec: args.find((arg) => arg !== "--push") ?? "patch",
    push: args.includes("--push"),
  };
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

const main = async () => {
  const { spec, push } = parseArgs(process.argv.slice(2));
  await assertCleanTree();

  const pkg = readRootPackage();
  const version = nextVersion(pkg.version, spec);
  const tag = `v${version}`;
  const message = `chore: release ${tag}`;

  writeRootPackage({ ...pkg, version });

  await $`git add package.json`.cwd(ROOT);
  await $`git commit -m ${message}`.cwd(ROOT);
  await $`git tag -a ${tag} -m ${message}`.cwd(ROOT);

  if (push) {
    await $`git push origin HEAD`.cwd(ROOT);
    await $`git push origin ${tag}`.cwd(ROOT);
    console.info(`Released ${tag} and pushed commit + tag.`);
    return;
  }

  console.info(
    `Bumped version to ${version} and created tag ${tag}. Push to start the release workflow:\n  git push origin HEAD --follow-tags`,
  );
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
