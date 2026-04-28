# Version Reorganization Plan

## Current Baseline

- Current product name: `iFanControl`
- Current source of truth: `/Users/puremilk/Documents/mac fancontrol/macfan-control-v2`
- Latest verified release found in `~/Downloads`: `iFanControl 2.8.2`
- Release source commit recorded in packaged artifacts: `2aa1952dd5c1600c89905b03aa03dbf0138fbcd9`

## Problem Statement

The workspace currently mixes:

- multiple app source trees
- multiple naming schemes (`MacFanControl`, `iFanControl`)
- historical experiments and packaging variants
- release artifacts stored beside source code

This makes it easy for a person or another AI agent to modify the wrong directory or publish from the wrong baseline.

## Reorganization Goals

1. Define one active source tree.
2. Mark all other app directories as historical or experimental.
3. Separate source code, release artifacts, references, and archives.
4. Make every release traceable to a source directory and commit.
5. Add a shared activity log for multi-AI collaboration.

## Source Tree Roles

### Active

- `macfan-control-v2/`
  - Treat as the only active app source tree unless explicitly changed.
  - Future feature work and bug fixes should happen here first.

### Historical App Variants

- `macfan-control/`
- `macfan-control-fixed/`
- `mac-fan-control/`
- `fan-control-launch/`

These should not be treated as current release baselines.

### References / Dependencies / Experiments

- `kentsmc-main/`
- `SecureXPC/`
- `HelperToolApp/`
- `stats-2.12.4/`

These should remain available for reference, dependency tracking, or experimentation, but not as the primary app release tree.

## Target Workspace Shape

Recommended end state:

```text
mac fancontrol/
├── current/
│   └── iFanControl/
├── release/
│   ├── 2.8.1/
│   ├── 2.8.2/
│   └── manifests/
├── archive/
│   ├── macfan-control/
│   ├── macfan-control-fixed/
│   ├── mac-fan-control/
│   ├── fan-control-launch/
│   └── old-packages/
├── reference/
│   ├── kentsmc-main/
│   ├── SecureXPC/
│   ├── HelperToolApp/
│   └── stats-2.12.4/
├── docs/
└── logs/
```

This is a target state, not an immediate rename/move requirement.

## Execution Phases

### Phase 1: Governance First

- Create shared documentation for workspace rules.
- Create a shared append-only AI activity log.
- Freeze the definition of the active source tree.

### Phase 2: Mark Before Moving

- Add short marker notes to historical directories if needed.
- Document whether each directory is `active`, `historical`, `reference`, or `release-only`.
- Do not move directories until the classification is accepted.

### Phase 3: Release Cleanup

- Keep only traceable release artifacts.
- For each kept release, store:
  - package file
  - `update-manifest.json`
  - `artifact-fingerprints.txt`
  - `source-baseline.txt`
  - release notes

### Phase 4: Physical Reorganization

- Move or rename directories only after the workspace map is stable.
- Update all scripts and documentation after each move.
- Avoid changing active source paths and packaging paths in the same step unless necessary.

## Release Hygiene Rules

For every new release:

1. Release only from the active source tree.
2. Set app version and build number before packaging.
3. Record source directory and commit.
4. Generate or update artifact fingerprints.
5. Add a log entry describing what changed.

## Important Note

`~/Downloads/iFanControl-2.8/` contains nested release candidates and a top-level app bundle with inconsistent version metadata. Treat `2.8.1` and `2.8.2` as the authoritative packaged outputs, not the outer container bundle.
