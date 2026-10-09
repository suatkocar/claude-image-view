import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { fitRow } from '../hooks/layout'
import { RGBA } from './fixtures'

const TEMP_BASE = '/tmp/image-view-tests'
const ROOT = `${TEMP_BASE}/claude-501`
const SESSION = `${ROOT}/-work/session`
const DIR = `${SESSION}/images`
const BAND = {
  plugin: 'image-view', component: 'AbovePrompt', requestId: 'above-prompt', surface: 'terminal',
  viewport: { columns: 120, rows: 40, isFullscreen: true },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const RESULT = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
type Source = { bytes: string; size: number; mtimeMs: number }

function setup(on: Parameters<TestBody>[1], names = ['1.png'], text = '[Image #1]') {
  const state = { text, writes: 0, reads: 0, refuseFill: false, failConversion: false, failPadding: false, failRead: false, omitOutput: false, replaceDuringConversion: '', renderer: 'image', session: 'session' }
  const files = new Map<string, Source>(names.map(name => [name, { bytes: RGBA, size: 2500, mtimeMs: 1 }]))
  const outputs = new Map<string, string>()
  const commands: string[][] = []
  const clock = mock.clock(on)
  on('session.start', () => ({ cwd: '/work' }))
  on('session.id', () => ({ value: state.session }))
  on('env.get', (_, e) => ({ value: ({ CLAUDE_CODE_TMPDIR: `${TEMP_BASE}/`, TERM_PROGRAM: 'ghostty', CLAUDE_IMAGE_VIEW_RENDERER: state.renderer } as Record<string, string>)[e.name] }))
  on('prompt.read', () => ({ value: { text: state.text, cursor: state.text.length } }))
  on('prompt.fill', (_, e) => {
    if (state.refuseFill) return { isFilled: false }
    state.text = e.text
    return { isFilled: true }
  })
  on('fs.list', (_, e) => ({ value: e.path === DIR
    ? [...files].map(([name, file]) => ({ name, kind: 'file' as const, ...file, isLink: false }))
    : e.path === ROOT ? [{ name: '-work', kind: 'dir' as const, size: 0, mtimeMs: 1, isLink: false }] : [] }))
  on('fs.exists', (_, e) => ({ value: e.path === DIR || outputs.has(e.path) || (e.path.startsWith(`${DIR}/`) && files.has(e.path.slice(DIR.length + 1))) }))
  on('fs.read', (_, e) => {
    state.reads++
    if (state.failRead) throw new Error('File could not be read')
    const bytes = outputs.get(e.path) ?? files.get(e.path.slice(DIR.length + 1))?.bytes
    if (bytes === undefined) throw new Error(`Unexpected read: ${e.path}`)
    return { value: { base64: bytes } }
  })
  on('process.run', (_, e) => {
    commands.push([...e.argv])
    if (e.argv[0] === 'sips' || e.argv[0] === 'ffmpeg') {
      if (state.failConversion || (e.argv[0] === 'ffmpeg' && state.failPadding)) return { value: { ...RESULT, exitCode: 1 } }
      if (!state.omitOutput) outputs.set(e.argv.at(-1)!, RGBA)
      if (e.argv[0] === 'sips' && state.replaceDuringConversion) state.text = state.replaceDuringConversion
    }
    return { value: { ...RESULT, stdout: e.argv[0] === 'id' ? '501\n' : '' } }
  })
  on('state.set', (_, e, next) => { state.writes++; return next(e) })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))
  return { state, files, outputs, commands, clock }
}

for (const extension of ['jpg', 'jpeg', 'webp', 'heic', 'tiff', 'gif']) {
  test(`${extension} attachments get a separate PNG preview, reused without repeated conversion`, async ($, on) => {
    const { commands, clock } = setup(on, [`1.${extension}`, '12.png'])
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.advance(200)
    await clock.advance(200)
    const ui = await $.ui.mount(BAND)
    const source = (await ui.find({ type: 'Image' }))?.props.source as { file: string; format: string } | undefined
    expect(source?.format).toBe('png')
    expect(source?.file.startsWith(`${DIR}/`)).toBe(false)
    expect(commands.filter(args => args[0] === 'sips')).toHaveLength(1)
    expect(commands.filter(args => args[0] === 'sips')[0]).toContain(`${DIR}/1.${extension}`)
    await ui.unmount()
  })
}

test('unchanged missing and invalid images do not trigger repeated reads, conversions or redraws', async ($, on) => {
  const { state, files, commands, clock } = setup(on, ['1.jpg'], '[Image #1] [Image #2]')
  state.failConversion = true
  files.get('1.jpg')!.bytes = btoa('invalid image payload with more than twenty-four bytes')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const reads = state.reads
  const runs = commands.length
  const writes = state.writes
  await clock.advance(1000)
  expect(state.reads).toBe(reads)
  expect(commands.length).toBe(runs)
  expect(state.writes).toBe(writes)
})

test('a failed conversion is retried after the source file changes', async ($, on) => {
  const { state, files, commands, clock } = setup(on, ['1.jpg'])
  state.failConversion = true
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  state.failConversion = false
  files.get('1.jpg')!.mtimeMs++
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  expect(commands.filter(args => args[0] === 'sips')).toHaveLength(2)
  await ui.unmount()
})

test('a late file becomes visible, and unchanged ready tiles do not redraw', async ($, on) => {
  const { files, state, clock } = setup(on, [])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  files.set('1.png', { bytes: RGBA, size: 2500, mtimeMs: 2 })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  const writes = state.writes
  await clock.advance(400)
  expect(state.writes).toBe(writes)
  await ui.unmount()
})

test('remove uses the current draft and preserves other image tags and text', async ($, on) => {
  const { state, clock } = setup(on, ['1.png', '2.png'], 'compare [Image #1] [Image #2]')
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  state.text += ' freshly typed'
  await ui.press({ key: 'remove-1' })
  expect(state.text).toBe('compare [Image #2] freshly typed')
  await ui.unmount()
  const after = await $.ui.mount(BAND)
  expect(await after.find({ key: 'remove-1' })).toBeUndefined()
  expect(await after.find({ key: 'remove-2' })).toBeDefined()
  await after.unmount()
})

test('refused removal leaves the tile visible and inline mode has no mouse controls', async ($, on) => {
  const { state, clock } = setup(on)
  state.refuseFill = true
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'remove-1' })
  expect(state.text).toBe('[Image #1]')
  await ui.unmount()
  const after = await $.ui.mount(BAND)
  expect(await after.find({ key: 'remove-1' })).toBeDefined()
  await after.unmount()
  const inline = await $.ui.mount({ ...BAND, viewport: { ...BAND.viewport, isFullscreen: false } })
  expect(await inline.find({ type: 'Button' })).toBeUndefined()
  await inline.unmount()
})

test('overflow is counted and a band too short for a tile preserves the engine content', async ($, on) => {
  const names = Array.from({ length: 10 }, (_, i) => `${i + 1}.png`)
  const { clock } = setup(on, names, names.map((_, i) => `[Image #${i + 1}]`).join(' '))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 36 } })
  expect(await narrow.find({ type: 'Text', text: '+6' })).toBeDefined()
  expect(await narrow.find({ key: 'tile-5' })).toBeUndefined()
  await narrow.unmount()
  const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, maxRows: 2 } })
  expect(await short.find({ type: 'Image' })).toBeUndefined()
  expect(await short.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  await short.unmount()
})

test('half-block rendering uses the image in a terminal without Kitty graphics', async ($, on) => {
  const { state, clock } = setup(on)
  state.renderer = 'blocks'
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('open uses the original attachment rather than the resized preview', async ($, on) => {
  const { commands, clock } = setup(on, ['1.jpg'])
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'open-1' })
  expect(commands.at(-1)).toEqual(['open', `${DIR}/1.jpg`])
  await ui.unmount()
})

test('completed conversion cannot restore an image removed while it was running', async ($, on) => {
  const { state, clock } = setup(on, ['1.jpg'])
  state.replaceDuringConversion = 'new draft'
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(state.text).toBe('new draft')
  await ui.unmount()
})

test('restarting a session resets caches and cancels its previous timer', async ($, on) => {
  const { clock, state } = setup(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  state.text = ''
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('padding failure still draws the successfully converted PNG', async ($, on) => {
  const { state, clock } = setup(on, ['1.jpg'])
  state.failPadding = true
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  const ui = await $.ui.mount(BAND)
  const source = (await ui.find({ type: 'Image' }))?.props.source as { file: string }
  expect(source.file.endsWith('.raw.png')).toBe(true)
  await ui.unmount()
})

test('desktop and survey views preserve the engine band', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)
  for (const extra of [{ surface: 'desktop' as const }, { props: { ...BAND.props, hasSurvey: true } }]) {
    const ui = await $.ui.mount({ ...BAND, ...extra })
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    await ui.unmount()
  }
})

test('empty and very small bands never return cells that exceed their available width', () => {
  expect(fitRow([], 20, 120)).toEqual([])
  expect(fitRow([{ width: 100, height: 100 }], 2, 120)).toEqual([])
  expect(fitRow([{ width: 100, height: 100 }], 20, 5)).toEqual([])
})

for (const failure of ['omitOutput', 'failRead'] as const) {
  test(`a successful converter cannot publish an unreadable preview: ${failure}`, async ($, on) => {
    const { state, clock } = setup(on, ['1.jpg'])
    state[failure] = true
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await clock.advance(200)
    const ui = await $.ui.mount(BAND)
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'no preview' })).toBeDefined()
    await ui.unmount()
  })
}
