# Workspace Governance

## Purpose

This workspace is accessed by multiple AI agents and possibly by the user in parallel. The goal of this document is to reduce collisions, accidental edits, and ambiguity about what is authoritative.

## Core Rules

1. Only one active app source tree may exist at a time.
2. Before editing files, record intent in the shared log.
3. After editing files, record exactly what changed in the shared log.
4. Historical directories must not silently become active again.
5. Release artifacts must remain traceable to a source directory and commit.

## Active Source Tree

Unless this document is explicitly updated, the active app source tree is:

- `/Users/puremilk/Documents/mac fancontrol/macfan-control-v2`

## Directory Classification

Use one of these labels when discussing or logging a directory:

- `active`
- `historical`
- `reference`
- `experiment`
- `release`

## Editing Protocol

Before making a non-trivial edit:

1. Check the shared log for recent activity.
2. Identify the exact files or directories you intend to touch.
3. Add a log entry with:
   - timestamp
   - actor
   - intent
   - planned write scope

After the edit:

1. Add a completion log entry.
2. List modified files.
3. Record verification status.
4. Record blockers or follow-up work if any.

## Conflict Avoidance

If another agent is already working in the same write scope:

- prefer waiting, coordinating, or selecting a different scope
- do not overwrite or revert unexplained changes
- if the scope conflict is unavoidable, state that explicitly in the log before proceeding

## Naming Rules

- Product-facing name: `iFanControl`
- Source baseline: record the real directory path
- Release versions: use semantic user-facing versions like `2.8.2`
- Build number: store separately from marketing version

## Logging Standard

All agents should write to:

- `/Users/puremilk/Documents/mac fancontrol/logs/AI_ACTIVITY_LOG.md`

Log entries should be append-only. Do not rewrite or delete older entries unless explicitly requested by the user.

## Status Vocabulary

Use one of:

- `planned`
- `in_progress`
- `completed`
- `blocked`
- `superseded`

## Minimum Verification Record

Each completed change should state one of:

- `not run`
- `checked by inspection`
- `script run`
- `manual validation`

## Ownership Note

This document defines process, not code ownership. The user remains the final authority for what becomes the official structure.
