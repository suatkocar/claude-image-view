# Personal fork integration plan

Approved scope: maintain a personal fork of `jarrodwatts/claude-image-view`, review every open pull request, combine useful overlapping changes, and activate the verified result in the existing local checkout. Clipboard shortcut routing is a separate subsequent task.

## Design

- Resolve the current session's actual image files, including PNG, JPEG, WebP and HEIC. Create bounded PNG previews beside the session image cache; never modify the source attachment.
- Cache results by source metadata. Retry when a file changes, avoid repeated failed conversions and unchanged state writes, and discard stale work when the session or draft changes.
- Keep thumbnail aspect ratios and bottom alignment. Use a compact footer with an image number and a removal button where mouse input is available. Preserve unrelated draft text and images, and honor refused prompt changes.
- Fit tiles to the available band, showing a `+N` overflow indicator. Draw a colored half-block fallback when terminal pictures are unavailable, with bounded decoding.
- Preserve the upstream source and author credits. Track every reviewed PR and deliberate exclusion. Keep the Windows-specific Sixel launcher and installer out of this macOS-focused integration.

## Tasks and verification

- [x] Create the GitHub fork, retain `upstream`, and isolate development in a worktree.
- [x] Run the unmodified tests and strict plugin validation: 5 tests passed; validation passed.
- [x] Review all six open PRs and record their commit IDs and dispositions.
- [x] Add failing tests for conversion, removal, narrow bands, fallback drawing, cache retry and state updates.
- [x] Implement the combined behavior and fix integration defects.
- [x] Run plugin tests, strict validation, type checking, and real image conversion checks.
- [ ] Inspect a real isolated Claude Code terminal session without sending a model prompt. Blocked: the computer-use tool denies access to Ghostty. See `validation.md` for the remaining manual check.
- [x] Review the final diff, commit to the personal fork, and fast-forward the existing local checkout.
- [x] Verify the local checkout and fork point to the same tested result.

## Acceptance criteria

Both existing PNG attachments and supported non-PNG attachments produce previews. Removal preserves unrelated content. Missing, corrupt and partially written files do not create a redraw or process loop. Small terminal bands do not overflow. The fork is the local default remote and upstream remains available for future review. No clipboard automation or global keyboard settings are changed in this phase.
