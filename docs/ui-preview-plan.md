# Image View presentation and terminal preview

## User requirements and evidence

- Remove the detached lines below image numbers and beside the remove control.
- Center the remove control and an exact `[Image #N]` label under each thumbnail.
- Provide a larger preview inside the terminal, with system Preview still
  available as a separate action.
- The installed Claude Code 2.1.295 SDK documents `Fragment` as a column Box.
  The footer's fragment therefore stacks its three border/label pieces instead
  of placing them inline. The screenshot is consistent with that layout.
- The SDK's `ImageProps` explicitly has no `onPress`; `Button` accepts only
  strings and Text children. A `Client` region supports pointer events. Place
  a transparent region behind the whole frame, then send a validated message
  to the hooks module to expand the selected image above the prompt.
- The user explicitly requested a click on the picture/frame, and wants the
  image-label action to remain available. No extra expansion button is needed.

## Implementation sequence

- [x] Replace manual border glyphs and `footer()` in `hooks/register.tsx` with a
  real rounded Box border. Keep the remove control and exact image label in
  separate centered rows; no decorative rules in either row.
- [x] Update `hooks/layout.ts` to budget the frame, control and label rows and
  the full label width, including narrow terminals and multi-digit image IDs.
  Retain image aspect ratios and `+N` overflow behavior.
- [x] Implement a selected-image state and an enlarged above-prompt view.
  Opening a preview must not change the draft. Show a fitted image, its label,
  an explicit system-viewer button and a Close button. Do not intercept composer
  keys. Keep the original label action; ignore drags and modified/right clicks.
- [x] Test panel opening, image selection, closing, removal and unchanged draft
  content through the official plugin test harness. Update existing layout
  expectations and run the complete test suite, strict validation and TypeScript.
- [x] Update README and validation notes.
- [ ] Fast-forward the local checkout and personal fork.
- [ ] Have the user reload and verify the visible layout and physical clicks.

The keyboard helper is a separate, completed project and is outside this change.
No subagents or alternate UI automation of Ghostty will be used.
