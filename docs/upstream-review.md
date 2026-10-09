# Upstream pull request review

Reviewed on 2026-10-09 against upstream `b3c412b`. This integration adapts the contributions below rather than merging their conflicting implementations wholesale. Original authors retain credit; the upstream MIT license is preserved.

| PR | Author and reviewed head | Decision |
| --- | --- | --- |
| [#1: half-block thumbnails](https://github.com/jarrodwatts/claude-image-view/pull/1) | dazacode — `84b49f27a7da3ade28c728b4bbda7a8736779f4a` | Adopt PNG decoding, Raster thumbnails, renderer selection and test fixtures. Lower the allocation bound to 16 MiB, verify zlib checksums and stored-block lengths, and fix TypeScript compatibility. |
| [#3: JPEG pastes](https://github.com/jarrodwatts/claude-image-view/pull/3) | giuseppebisemi — `2de3527d4ac7eedad3910c57646847f30d22e375` | Cover through the broader #5/#6 implementation. Preserve its central requirement: preview copies must never overwrite Claude Code's attachments. Do not retain its repeated failed conversion attempts or outdated process-result test shape. |
| [#5: other image formats](https://github.com/jarrodwatts/claude-image-view/pull/5) | anl331 — `92cd2d41d2f5c3fe12d7156b3066e71577c8823a` | Adopt bounded PNG conversion for non-PNG files. Replace permanent negative caching with source size/mtime tracking, so an incomplete file can recover. |
| [#6: removal and spacing](https://github.com/jarrodwatts/claude-image-view/pull/6) | anl331 — `efc545f999e779ab5ba6d3430e82c4ef1bb29139` | Adopt compact footers, fullscreen removal, bottom alignment and optional transparent padding. Read the current draft on click, honor refused fills, serialize removals, and reject stale conversion results. |
| [#8: Windows support](https://github.com/jarrodwatts/claude-image-view/pull/8) | cleaneramade — `94398e7e4a7172344c205883bf9aa6ddce2cb4b9` | Adopt hover feedback and opening the original image; adapt opening to macOS/Linux. Use #1's portable fallback instead of a second renderer. Exclude the Windows Sixel/ConPTY wrapper, PowerShell install/uninstall scripts, PATH/keybinding changes, and Windows-specific temporary directory resolution from this macOS-focused fork. Windows has not been validated. |
| [#9: caching and overflow](https://github.com/jarrodwatts/claude-image-view/pull/9) | ppf — `cedbff8302e796dedfde2b578694221bb5e1e9d5` | Adopt unchanged-state suppression and `+N` overflow. Reconcile its three-row tile assumptions with #6's two-row footer. Cache both success and failure by source metadata rather than permanently rejecting a path. |

## Integration details

- Claude's mod compiler requires every helper receiving `$` to be a top-level function in the hooks module. Host API calls therefore remain in `register.tsx`; pure layout and image decoding live in separate modules.
- Preview filenames include source metadata. Original attachment bytes remain intact; derived PNG files live alongside the session's `images` directory.
- Resolve `CLAUDE_CODE_TMPDIR` as a base directory, followed by Claude's `claude-<uid>` directory. This matches the installed 2.1.295 implementation and avoids the custom-cache failure discussed in upstream issue #12.
- `sips` is used on macOS. Optional `ffmpeg` adds transparent side padding with one encoding/filter thread. A missing padding tool keeps the unpadded PNG. A missing converter retains a valid original PNG; other formats display a placeholder.
- PNG fallback decoding supports non-interlaced images within the documented read and allocation bounds. It is not a general-purpose image codec.
- Fullscreen removal changes the prompt draft and places its cursor at the end, as required by the host's `prompt.fill` API. Inline mode has no mouse controls.
- Clipboard routing and CopyCat are outside this change.

## Future upstream review

```sh
git fetch upstream
git log --oneline main..upstream/main
git diff main...upstream/main
gh pr list --repo jarrodwatts/claude-image-view --state open
gh issue list --repo jarrodwatts/claude-image-view --state open
```

Review changes in a branch and run the checks below before merging. These commands do not automatically merge or install upstream work. `origin` is the personal fork; `upstream` is Jarrod Watts's repository.

```sh
claude plugin test .
claude plugin validate . --strict
npm exec --yes --package typescript@5.9.3 -- tsc -p . --noEmit
python3 scripts/verify-real-images.py
```
