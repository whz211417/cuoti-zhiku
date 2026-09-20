import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJsonVersion = (source, label) => {
  const version = JSON.parse(source).version;
  if (typeof version !== 'string' || !version.trim()) throw new Error(`${label} does not declare a version`);
  return version;
};

const readCargoVersion = (source, label) => {
  const packageBlock = source.match(/(?:^|\n)\[\[?package\]?\]\s*\n([\s\S]*?)(?=\n\[|$)/)?.[1];
  const version = packageBlock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) throw new Error(`${label} does not declare a package version`);
  return version;
};

const readCargoLockVersion = (source) => {
  const blocks = source.split(/(?=\[\[package\]\])/);
  const appBlock = blocks.find((block) => /^name\s*=\s*"cuoti-zhiku"/m.test(block));
  const version = appBlock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!version) throw new Error('Cargo.lock does not contain the cuoti-zhiku package version');
  return version;
};

export function verifyReleaseVersions(manifests, tag) {
  const versions = {
    packageJson: readJsonVersion(manifests.packageJson, 'package.json'),
    cargoToml: readCargoVersion(manifests.cargoToml, 'Cargo.toml'),
    cargoLock: readCargoLockVersion(manifests.cargoLock),
    tauriConfig: readJsonVersion(manifests.tauriConfig, 'tauri.conf.json'),
    tag: tag.replace(/^v/, ''),
  };
  const expected = versions.packageJson;
  const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
  if (mismatches.length > 0) {
    const detail = Object.entries(versions).map(([source, version]) => `${source}=${version}`).join(', ');
    throw new Error(`Release version mismatch: ${detail}`);
  }
  return { version: expected };
}

function run() {
  const tagArgument = process.argv.find((argument) => argument.startsWith('--tag='))?.slice('--tag='.length);
  const tag = tagArgument || process.env.GITHUB_REF_NAME;
  if (!tag || !/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error('A release tag such as v0.5.2 is required');
  }
  const cwd = process.cwd();
  const result = verifyReleaseVersions({
    packageJson: readFileSync(resolve(cwd, 'package.json'), 'utf8'),
    cargoToml: readFileSync(resolve(cwd, 'src-tauri/Cargo.toml'), 'utf8'),
    cargoLock: readFileSync(resolve(cwd, 'src-tauri/Cargo.lock'), 'utf8'),
    tauriConfig: readFileSync(resolve(cwd, 'src-tauri/tauri.conf.json'), 'utf8'),
  }, tag);
  process.stdout.write(`Release version ${result.version} is consistent.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
