#!/usr/bin/env node
// Stamps package.json's version into the iOS project, so store builds match the release tag (vX.Y.Z).
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const [major, minor, patch] = version.split(/[.-]/).map(Number);
const build = major * 10000 + minor * 100 + patch;

const project = new URL('ios/App/App.xcodeproj/project.pbxproj', root);
const updated = readFileSync(project, 'utf8')
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${major}.${minor}.${patch};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(project, updated);
