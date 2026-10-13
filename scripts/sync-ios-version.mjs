#!/usr/bin/env node
// Stamps package.json's version into the iOS project, so store builds match the release tag (vX.Y.Z).
// Same rule as android/app/build.gradle: plain X.Y.Z only, so every version gets a unique build number.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const match = /^(\d+)\.(\d{1,3})\.(\d{1,3})$/.exec(version);
if (!match) {
  console.error(`package.json version must be X.Y.Z with minor and patch below 1000, got: ${version}`);
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);
const build = major * 1_000_000 + minor * 1_000 + patch;

const project = new URL('ios/App/App.xcodeproj/project.pbxproj', root);
const updated = readFileSync(project, 'utf8')
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${major}.${minor}.${patch};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(project, updated);
