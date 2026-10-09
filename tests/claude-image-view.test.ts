import { expect, mock, test } from 'claude-code/testing'

import { fitCells, fitPreview, fitRow, imageNumbers, pngSize, tileColumns } from '../hooks/layout'

function pngHead(width: number, height: number): string {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return btoa(String.fromCharCode(...bytes))
}

test('image numbers come from the draft, deduplicated, in order', () => {
  expect(imageNumbers('look [Image #2] and [Image #1] again [Image #2]')).toEqual([2, 1])
  expect(imageNumbers('[Image 1] [image #3] #4')).toEqual([])
})

test('PNG size is read from the IHDR header', () => {
  expect(pngSize(pngHead(1630, 632))).toEqual({ width: 1630, height: 632 })
  expect(pngSize(btoa('\xff\xd8\xff\xe0 this is a jpeg, not a png...'))).toBeNull()
})

test('thumbnails keep aspect ratio within the tile', () => {
  // Square: 6 rows tall, twice as many columns because cells are tall.
  expect(fitCells({ width: 500, height: 500 })).toEqual({ columns: 12, rows: 6 })
  // Very wide: capped at 32 columns, rows shrink to match.
  expect(fitCells({ width: 3000, height: 500 })).toEqual({ columns: 32, rows: 3 })
  // Very tall: never narrower than 4 columns.
  expect(fitCells({ width: 100, height: 2000 })).toEqual({ columns: 4, rows: 6 })
})

test('a row of tiles shrinks to fit the band so it never scrolls', () => {
  const square = { width: 500, height: 500 }
  // Plenty of room: full 6-row tiles.
  expect(fitRow([square], 20, 120)).toEqual([{ columns: 12, rows: 6 }])
  // A full frame and two centered control rows leave three picture rows.
  expect(fitRow([square], 7, 120)).toEqual([{ columns: 6, rows: 3 }])
  // A narrow band: three 6-row squares need 3 * 14 + 2 = 44 columns; 40 forces 5 rows.
  expect(fitRow([square, square, square], 20, 40)).toEqual([
    { columns: 10, rows: 5 },
    { columns: 10, rows: 5 },
    { columns: 10, rows: 5 },
  ])
})

test('full multi-digit attachment labels participate in narrow-band overflow', () => {
  const numbers = [23, 1024, 99999]
  const sizes = numbers.map(() => ({ width: 1, height: 100 }))
  for (let width = 10; width <= 50; width++) {
    const row = fitRow(sizes, 20, width, numbers)
    if (!row.length) continue
    const hidden = sizes.length - row.length
    const used = row.reduce((sum, cells, i) => sum + tileColumns(cells, numbers[i]!), row.length - 1)
    expect(used + (hidden ? 1 + `+${hidden}`.length : 0) <= width).toBe(true)
  }
})

test('enlarged previews fit wide, tall and tiny viewports with a bounded raster payload', () => {
  for (const size of [null, { width: 500, height: 500 }, { width: 4000, height: 1 }, { width: 1, height: 4000 }]) {
    for (const columns of [9, 10, 24, 120, 800]) {
      for (const rows of [4, 5, 20, 100, 500]) {
        const cells = fitPreview(size, rows, columns)
        if (columns < 10 || rows < 5) {
          expect(cells).toBeNull()
          continue
        }
        expect(cells !== null).toBe(true)
        expect(cells!.columns + 2 <= columns).toBe(true)
        expect(cells!.rows + 4 <= rows).toBe(true)
        expect(cells!.columns <= 255 && cells!.rows <= 255).toBe(true)
        expect(cells!.columns * cells!.rows <= 6000).toBe(true)
      }
    }
  }
  expect(fitPreview({ width: 500, height: 500 }, 20, 120)).toEqual({ columns: 32, rows: 16 })
})

const BAND = {
  plugin: 'image-view',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('a pasted image shows without another keystroke and clears when the draft does', async ($, on) => {
  const clock = mock.clock(on)
  const dir = '/tmp/claude-501/-work/sess-1/images'
  let draft = 'see [Image #1] [Image #2]'
  on('session.start', () => ({ cwd: '/work' }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('env.get', (_, e) => ({ value: e.name === 'CLAUDE_IMAGE_VIEW_RENDERER' ? 'image' : undefined }))
  on('session.id', () => ({ value: 'sess-1' }))
  // Another project's folder and a stray file sit beside the one holding this session.
  const entry = { size: 0, mtimeMs: 0, isLink: false }
  on('fs.list', (_, e) => ({
    value: e.path === dir ? [{ name: '1.png', kind: 'file', ...entry }] : [
      { name: '-other', kind: 'dir', ...entry },
      { name: 'notes.txt', kind: 'file', ...entry },
      { name: '-work', kind: 'dir', ...entry },
    ],
  }))
  on('fs.exists', ($, e) => ({ value: e.path === dir || e.path === `${dir}/1.png` }))
  on('fs.read', () => ({ value: { base64: pngHead(800, 400) } }))
  // Missing conversion tools retain the valid original PNG.
  on('process.run', (_, e) => ({ value: { exitCode: e.argv[0] === 'id' ? 0 : 1, stdout: e.argv[0] === 'id' ? '501\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(200)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const image = await ui.find({ type: 'Image' })
  expect(image?.props).toMatchObject({ source: { file: `${dir}/1.png`, format: 'png' }, columns: 24, rows: 6 })
  // #2 has no cached file, so it gets a placeholder tile instead of a broken Image.
  expect(await ui.find({ type: 'Text', text: 'no preview' })).toBeDefined()
  await ui.unmount()

  // Sending the prompt empties the box.
  draft = ''
  await clock.advance(200)
  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await after.find({ type: 'Image' })).toBeUndefined()
  expect(await after.find({ type: 'Text', text: 'engine band' })).toBeDefined()
})
