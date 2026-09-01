#!/usr/bin/env node
/**
 * Pack every published package into release tarballs, in publish order
 * (platform packages first, then the entries that optionally depend on
 * them), and write `publish-order.txt` next to them. `bun pm pack` produces
 * the exact bytes `bun publish` would upload and runs each package's
 * `prepack` gate, so a missing binary or unbuilt `lib/` refuses here.
 *
 * Usage: `node scripts/pack-release.mjs [dest] [--current-platform-only]`.
 * The flag packs only THIS host's platform package plus the entries — for
 * per-architecture CI legs, where the other architecture's binary does not
 * exist (the exact refusal its prepack gate exists for).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { entryDirs, platformDirs, readJson, root } from './repo.mjs';

const args = process.argv.slice(2);
const currentPlatformOnly = args.includes('--current-platform-only');
const destination = path.resolve(args.find((arg) => !arg.startsWith('--')) || path.join(root, 'dist', 'npm'));

function hostPlatformDirs() {
  const hostPlatform = `${process.platform}-${process.arch}`;
  return platformDirs().filter((dir) => readJson(path.join(root, dir, 'prebuilds.json')).platform === hostPlatform);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function tarballName(manifest) {
  if (manifest.name.startsWith('@')) {
    return `${manifest.name.slice(1).replace('/', '-')}-${manifest.version}.tgz`;
  }
  return `${manifest.name}-${manifest.version}.tgz`;
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

const dirs = [...(currentPlatformOnly ? hostPlatformDirs() : platformDirs()), ...entryDirs()];
const publishOrder = [];
for (const dir of dirs) {
  const manifest = readJson(path.join(root, dir, 'package.json'));
  // Bun preserves executable modes and resolves workspace protocols while
  // packing; each package's prepack gate validates its payload first.
  run('bun', ['pm', 'pack', '--cwd', dir, '--destination', destination]);

  const tarball = tarballName(manifest);
  const tarballPath = path.join(destination, tarball);
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`expected pack output not found: ${tarballPath}`);
  }
  publishOrder.push(tarball);
}

fs.writeFileSync(path.join(destination, 'publish-order.txt'), `${publishOrder.join('\n')}\n`);
console.log(`Packed ${publishOrder.length} packages into ${path.relative(root, destination)}`);
