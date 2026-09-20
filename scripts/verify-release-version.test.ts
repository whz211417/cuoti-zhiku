import { describe, expect, it } from 'vitest';
import { verifyReleaseVersions } from './verify-release-version.mjs';

const manifests = {
  packageJson: JSON.stringify({ version: '0.5.2' }),
  cargoToml: '[package]\nname = "cuoti-zhiku"\nversion = "0.5.2"\n',
  cargoLock: '[[package]]\nname = "cuoti-zhiku"\nversion = "0.5.2"\n',
  tauriConfig: JSON.stringify({ version: '0.5.2' }),
};

describe('release version verification', () => {
  it('accepts one version shared by every manifest and the release tag', () => {
    expect(verifyReleaseVersions(manifests, 'v0.5.2')).toEqual({ version: '0.5.2' });
  });

  it.each([
    ['packageJson', JSON.stringify({ version: '0.5.1' })],
    ['cargoToml', '[package]\nname = "cuoti-zhiku"\nversion = "0.5.1"\n'],
    ['cargoLock', '[[package]]\nname = "cuoti-zhiku"\nversion = "0.5.1"\n'],
    ['tauriConfig', JSON.stringify({ version: '0.5.1' })],
  ] as const)('rejects a mismatch in %s', (key, value) => {
    expect(() => verifyReleaseVersions({ ...manifests, [key]: value }, 'v0.5.2')).toThrow(/version mismatch/i);
  });

  it('rejects a tag that does not match the manifests', () => {
    expect(() => verifyReleaseVersions(manifests, 'v0.5.3')).toThrow(/version mismatch/i);
  });
});
