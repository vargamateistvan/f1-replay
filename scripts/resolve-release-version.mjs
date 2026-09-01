import { execFileSync } from "node:child_process";

const DEFAULT_VERSION = "1.0.0";
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;

function runGit(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) return "";
    throw error;
  }
}

function listSemverTags(args) {
  const output = runGit(args, { allowFailure: true });
  if (!output) return [];
  return output.split("\n").filter((tag) => SEMVER_PATTERN.test(tag));
}

function resolveBumpType(commitSubjects, commitBodies) {
  const subjectLines = commitSubjects ? commitSubjects.split("\n") : [];
  const combinedText = [commitSubjects, commitBodies].filter(Boolean).join("\n");

  if (
    /BREAKING[ -]CHANGE:/i.test(combinedText) ||
    subjectLines.some((subject) => /^[a-z]+(\([^)]+\))?!:/.test(subject))
  ) {
    return "major";
  }

  if (subjectLines.some((subject) => /^feat(\([^)]+\))?:/.test(subject))) {
    return "minor";
  }

  return "patch";
}

function bumpSemver(version, bumpType) {
  let [major, minor, patch] = version.split(".").map(Number);

  switch (bumpType) {
    case "major":
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case "minor":
      minor += 1;
      patch = 0;
      break;
    default:
      patch += 1;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

function resolveReleaseVersion() {
  const headTag = listSemverTags([
    "tag",
    "--points-at",
    "HEAD",
    "--sort=-v:refname",
  ])[0];

  if (headTag) return headTag;

  const latestTag = listSemverTags(["tag", "--sort=-v:refname"])[0];

  if (!latestTag) return DEFAULT_VERSION;

  const range = `${latestTag}..HEAD`;
  const commitSubjects = runGit(["log", "--pretty=%s", range], {
    allowFailure: true,
  });
  const commitBodies = runGit(["log", "--pretty=%b", range], {
    allowFailure: true,
  });

  return bumpSemver(latestTag, resolveBumpType(commitSubjects, commitBodies));
}

console.log(resolveReleaseVersion());
