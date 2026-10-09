# Validation

Date: 2026-10-09. Environment: macOS arm64, Claude Code 2.1.295, TypeScript 5.9.3, Bun 1.3.14.

## Observed results

| Check | Result |
| --- | --- |
| Unmodified upstream baseline | 5 tests passed; strict validation passed |
| `claude plugin test .` | 40 tests passed, 0 failed |
| `claude plugin validate . --strict` | Passed; declared hooks, calls, environment reads and state usage inspected |
| `npm exec --yes --package typescript@5.9.3 -- tsc -p . --noEmit` | Exit 0 |
| `python3 scripts/verify-real-images.py` | PNG, JPEG, WebP, HEIC, TIFF and GIF passed |
| `git diff --check` | Exit 0 |

The real-file check generates synthetic 1600x1000 images. The unmodified hooks invoke the actual installed `sips` and `ffmpeg` through a development host adapter and produce 840x500 PNG previews, including transparent side padding. Each preview also decodes through the half-block decoder. The check verifies conversion reuse, expanded-preview state and unchanged draft text, removal of the draft reference, and unchanged SHA-256 hashes for all six original attachments.

The official test harness verifies UI trees, pointer dispatch through the actual `Client` surface module and button callbacks, preservation of unrelated draft text and image references, rejected prompt fills, stale conversion results, session restarts, missing/invalid/unreadable files, source metadata changes, custom temporary bases, renderer selection and narrow-band overflow. New checks cover clicks at the frame corner and inside the picture, drag/modifier/right-click rejection, returning from the enlarged view, removed attachments, bounded preview dimensions, multi-digit labels, block-mode expansion and narrow-band closing. Filesystem/process calls in those 40 tests are mocked. The separate real-file check uses actual files/processes, but its UI and prompt host are adapters.

## Presentation fix

The old footer split manual box-drawing characters and the number button through a JSX fragment. In this SDK, `Fragment` creates a column Box, so those pieces were stacked inside the row. The new tree uses a complete Box border, followed by two centered rows for `[×]` and `[Image #N]`. No separate decorative rules are drawn below the label.

`Image` and `Raster` have no `onPress`. A transparent `Client` region behind the full thumbnail frame receives the click and posts a validated message to the hook. The enlarged image occupies the existing above-prompt band and uses an explicit `[Close]` control. The label still opens the original file in the system viewer. No composer keybinding was added.

## Limits and remaining manual check

The computer-use tool rejected access to Ghostty with: `Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.` No alternate UI-control mechanism was used to bypass that restriction.

The user verified thumbnail rendering, `[×]` removal and opening the original in Preview on version 0.2.0. Version 0.3.0's new frame layout and thumbnail click region still require a live Ghostty check; the automated harness does not paint terminal pixels or verify overlapping hit regions. No model prompt was submitted for these checks. Windows-specific behavior and Linux desktop interaction have not been verified. BMP, AVIF and HEIF discovery are implemented but were not included in the six-format real-file run; successful conversion depends on the installed macOS codecs.

To finish the live UI check in a session loading this checkout:

1. Run `/reload-plugins`, or start a fresh session with `claude --plugin-dir /path/to/claude-image-view`.
2. Attach two synthetic images and add ordinary draft text, without sending the prompt.
3. Check that each complete frame has centered `[×]` and `[Image #N]` rows, with no detached lines.
4. Click inside one thumbnail and on its frame. Check that a larger picture appears above the prompt, then click `[Close]` to return. The draft text and attachments should remain unchanged.
5. Check that the label and **Open in Preview** still open the original. Remove one image with `[×]`; the other reference and text should remain.
6. Check that reducing the terminal width produces a `+N` count where tiles no longer fit, and the expanded view remains closable.

Clipboard contents, Paste configuration, CopyCat and global keyboard shortcuts are outside this change. Conditional Cmd+V routing is handled by the separate Terminal Image Paste app, already validated by the user in Ghostty, Orca and Super.
