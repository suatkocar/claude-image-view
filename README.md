# Claude Image View — personal fork

A Claude Code mod that previews attached images above the prompt. This fork integrates selected upstream pull requests and additional regression fixes for personal use.

Based on [Jarrod Watts's Claude Image View](https://github.com/jarrodwatts/claude-image-view). See [the PR review and contributor credits](docs/upstream-review.md) for the exact changes adopted from each author.

## Features

- PNG, JPEG, WebP, HEIC, TIFF, GIF, BMP and AVIF discovery. macOS converts supported files into bounded PNG previews without changing the original attachment.
- Sharp pictures in Kitty-compatible terminals; colored half-block thumbnails elsewhere.
- Compact, aligned tiles with a fullscreen **[×]** removal button. Removing an image preserves other image references and draft text.
- Click the image number in fullscreen mode to open the original attachment in the system viewer.
- Hover feedback and optional transparent padding around pictures.
- A **+N** count when more images exist than fit in the available band.
- Missing or invalid files do not redraw continuously. A file that finishes writing is retried when its metadata changes.

## Install this fork

Inside Claude Code:

```
/plugin marketplace add suatkocar/claude-image-view
/plugin install image-view@suatkocar-image-view
/reload-plugins
```

Use one copy of the mod at a time. If the upstream plugin is already installed, disable that copy before enabling this fork.

For a session using a local checkout:

```sh
claude --plugin-dir /path/to/claude-image-view
```

Existing sessions need `/reload-plugins` to load changes.

## Requirements and limits

- Claude Code 2.1.287 or later; this integration is verified against 2.1.295.
- macOS for non-PNG conversion through the built-in `sips` tool.
- Optional `ffmpeg` for transparent side padding. The picture still works without it.
- Ghostty or another Kitty-compatible terminal for sharp images.
- Fullscreen mode for mouse controls. Inline mode shows previews without clickable actions.

Linux retains PNG previews and the half-block fallback, but has not received an end-to-end desktop check. The Windows-specific launcher from upstream PR #8 is not included.

The fallback decoder accepts non-interlaced PNGs, reads at most the host's 4 MiB file limit, and refuses scanline allocations over 16 MiB. Normal converted previews are at most 800 pixels on their longest side before padding. Animated formats provide a still preview.

Removing an image edits its `[Image #N]` reference in the draft; it does not delete the original file. The host places the cursor at the end after this edit.

## How it works

Every 200ms the mod reads the draft's image references and locates the current session's image cache under `<CLAUDE_CODE_TMPDIR>/claude-<uid>`, or `/tmp/claude-<uid>` when unset. It searches the actual numbered image files rather than assuming they all end in `.png`.

Preview PNGs are written alongside the session's `images` directory, with names beginning `image-view-`. Successful and failed results are cached by source path, size and modification time. Existing attachments are never overwritten. Preview files remain with that temporary session directory; the mod does not delete user files.

Conversion runs without a shell and has a ten-second timeout per process. Optional padding uses a single encoding/filter thread. If the draft changes during conversion, stale tiles are discarded.

## Renderer selection

Automatic detection uses the terminal environment. Override it when necessary:

```sh
CLAUDE_IMAGE_VIEW_RENDERER=image claude --plugin-dir .
CLAUDE_IMAGE_VIEW_RENDERER=blocks claude --plugin-dir .
```

The `image` mode does not enable Kitty support in the host. In background or agent-view sessions where Claude Code disables terminal images, the host may also need `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`; the mod does not change that setting.

## Privacy and host access

The mod makes no network requests. It reads the draft, terminal environment and current session's cached images. It runs `id`/`uname` for host discovery, `sips` and optional `ffmpeg` for preview generation, and `open` or `xdg-open` only when the image-number button is pressed.

It writes derived preview files in the temporary session directory. It does not read Paste's database, manage the clipboard or change keyboard shortcuts.

Run `claude plugin validate . --strict` to inspect all declared hooks and host calls.

## Development

```sh
git clone https://github.com/suatkocar/claude-image-view
cd claude-image-view
git remote add upstream https://github.com/jarrodwatts/claude-image-view
claude --plugin-dir .
claude plugin test .
claude plugin validate . --strict
```

Claude Code generates `.claude-plugin/types/` and `tsconfig.json` when it loads the mod. Type-check with:

```sh
npm exec --yes --package typescript@5.9.3 -- tsc -p . --noEmit
```

The optional real-file check uses Python 3, `bun`, `sips`, `ffmpeg` and `cwebp`. It creates synthetic images in a temporary directory and loads the unmodified hooks through a development host adapter with real filesystem and process calls. It checks actual conversions, decoding, cache reuse, removal of draft references, and unchanged source hashes. The adapter's UI tree does not replace a live terminal/mouse check:

```sh
python3 scripts/verify-real-images.py
```

See [upstream review](docs/upstream-review.md) for updating the fork and deliberate exclusions.
See [validation results](docs/validation.md) for the checks performed and the outstanding live UI check.

## License

MIT. The original [LICENSE](LICENSE) is retained.
