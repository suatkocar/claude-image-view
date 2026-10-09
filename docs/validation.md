# Validation

Date: 2026-10-09. Environment: macOS arm64, Claude Code 2.1.295, TypeScript 5.9.3, Bun 1.3.14.

## Observed results

| Check | Result |
| --- | --- |
| Unmodified upstream baseline | 5 tests passed; strict validation passed |
| `claude plugin test .` | 32 tests passed, 0 failed |
| `claude plugin validate . --strict` | Passed; declared hooks, calls, environment reads and state usage inspected |
| `npm exec --yes --package typescript@5.9.3 -- tsc -p . --noEmit` | Exit 0 |
| `python3 scripts/verify-real-images.py` | PNG, JPEG, WebP, HEIC, TIFF and GIF passed |
| `git diff --check` | Exit 0 |

The real-file check generates synthetic 1600x1000 images. The unmodified hooks invoke the actual installed `sips` and `ffmpeg` through a development host adapter and produce 840x500 PNG previews, including transparent side padding. Each preview also decodes through the half-block decoder. The check verifies conversion reuse, removal of the draft reference, and unchanged SHA-256 hashes for all six original attachments.

The official test harness verifies UI trees and button callbacks, preservation of unrelated draft text and image references, rejected prompt fills, stale conversion results, session restarts, missing/invalid/unreadable files, source metadata changes, custom temporary bases, renderer selection and narrow-band overflow. Filesystem/process calls in those 32 tests are mocked. The separate real-file check uses actual files/processes, but its UI and prompt host are adapters.

## Limits and remaining manual check

The computer-use tool rejected access to Ghostty with: `Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.` No alternate UI-control mechanism was used to bypass that restriction.

Live Ghostty rendering and physical mouse clicks have therefore **not** been verified. No model prompt was submitted for these checks. Windows-specific behavior and Linux desktop interaction have not been verified. BMP, AVIF and HEIF discovery are implemented but were not included in the six-format real-file run; successful conversion depends on the installed macOS codecs.

To finish the live UI check in a session loading this checkout:

1. Run `/reload-plugins`, or start a fresh session with `claude --plugin-dir /path/to/claude-image-view`.
2. Attach two synthetic images and add ordinary draft text, without sending the prompt.
3. Check both previews, open one using its image number, and remove one with `[×]` in fullscreen mode. The other reference and text should remain.
4. Check that reducing the terminal width produces a `+N` count where tiles no longer fit.

Clipboard contents, Paste configuration, CopyCat and global keyboard shortcuts are outside this change. Conditional Cmd+V routing is the subsequent task.
