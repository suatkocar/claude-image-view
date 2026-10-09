import { expect, test } from 'claude-code/testing'
import { blockCells, drawsPictures } from '../hooks/layout'
import { decodeThumb, inflate } from '../hooks/png'
import { RGBA, PALETTE, GRAY16 } from './fixtures'

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
const pixel = (thumb: { width: number; rgb: Uint8Array }, x: number, y: number) =>
  [...thumb.rgb.subarray((y * thumb.width + x) * 3, (y * thumb.width + x) * 3 + 3)]
// A half-transparent pixel over the backdrop the decoder uses.
const over = (c: number) => Math.round((c * 128 + 0x1e * 127) / 255)

test('PNG decoding gives the picture back through every row filter', () => {
  const thumb = decodeThumb(bytesOf(RGBA))!
  expect([thumb.width, thumb.height]).toEqual([64, 40])
  for (const [x, y] of [[0, 0], [31, 7], [5, 39], [20, 22]] as const) {
    expect(pixel(thumb, x, y)).toEqual([x * 4, y * 6, (x * y) % 256])
  }
  for (const [x, y] of [[32, 0], [63, 39], [40, 13]] as const) {
    expect(pixel(thumb, x, y)).toEqual([over(x * 4), over(y * 6), over((x * y) % 256)])
  }
})

test('PNG decoding handles palettes with transparency and 16-bit gray', () => {
  const palette = decodeThumb(bytesOf(PALETTE))!
  expect(pixel(palette, 0, 0)).toEqual([0x1e, 0x1e, 0x1e]) // palette entry 0 is transparent
  expect(pixel(palette, 3, 2)).toEqual([5 * 16, 255 - 5 * 16, (5 * 37) % 256])
  const gray = decodeThumb(bytesOf(GRAY16))!
  expect(pixel(gray, 5, 2)).toEqual(Array(3).fill(((5 * 8000 + 2 * 1000) % 65536) >> 8))
})

test('a PNG that cannot be decoded gives no thumbnail', () => {
  const png = bytesOf(RGBA)
  expect(decodeThumb(png.subarray(0, 40))).toBeNull() // cut off before its data
  expect(decodeThumb(new Uint8Array(100))).toBeNull() // not a PNG
  const corrupt = png.slice()
  corrupt.fill(0xff, 60, 200)
  expect(decodeThumb(corrupt)).toBeNull()
})

test('the decoder refuses oversized allocations and invalid zlib headers', () => {
  const stream = new Uint8Array([0x78, 0x9c, 3, 0, 0, 0, 0, 1])
  expect(inflate(stream, -1)).toBeNull()
  expect(inflate(stream, 17 * 1024 * 1024)).toBeNull()
  expect(inflate(new Uint8Array([0x78, 0, 3, 0, 0, 0, 0, 1]), 0)).toBeNull()
  expect(inflate(stream, 0)?.length).toBe(0)
})

test('a thumbnail is averaged down into half-block cells', () => {
  // 64x40 drawn in 8x2 cells is 8x4 pixels: each is the average of an 8x10 block of the picture.
  const thumb = decodeThumb(bytesOf(RGBA))!
  const words = new Uint32Array(bytesOf(blockCells(thumb, 8, 2)).buffer)
  expect(words.length).toBe(8 * 2 * 3)
  expect(words[0]).toBe(0x2580) // an upper half block
  const mean = (y0: number, f: (x: number, y: number) => number) => {
    let sum = 0
    for (let y = y0; y < y0 + 10; y++) for (let x = 0; x < 8; x++) sum += f(x, y)
    return Math.round(sum / 80)
  }
  const color = (y0: number) =>
    (mean(y0, x => x * 4) << 16) | (mean(y0, (_, y) => y * 6) << 8) | mean(y0, (x, y) => (x * y) % 256)
  expect(words[1]).toBe(color(0)) // the cell's foreground is the top pixel...
  expect(words[2]).toBe(color(10)) // ...and its background the one below
})

test('only kitty-protocol terminals get real pictures', () => {
  expect(drawsPictures({ TERM: 'xterm-kitty' })).toBe(true)
  expect(drawsPictures({ TERM_PROGRAM: 'ghostty' })).toBe(true)
  expect(drawsPictures({ TERM_PROGRAM: 'WezTerm' })).toBe(true)
  expect(drawsPictures({ KITTY_WINDOW_ID: '4' })).toBe(true)
  expect(drawsPictures({ TERM: 'xterm-256color', TERM_PROGRAM: 'Apple_Terminal' })).toBe(false)
  expect(drawsPictures({ TERM_PROGRAM: 'vscode' })).toBe(false)
  // tmux eats the protocol, even inside kitty.
  expect(drawsPictures({ TERM: 'xterm-kitty', TMUX: '/tmp/tmux-501/default,1,0' })).toBe(false)
  // An override beats guessing from the environment.
  expect(drawsPictures({ TERM_PROGRAM: 'iTerm.app', CLAUDE_IMAGE_VIEW_RENDERER: 'image' })).toBe(true)
  expect(drawsPictures({ TERM: 'xterm-kitty', CLAUDE_IMAGE_VIEW_RENDERER: 'blocks' })).toBe(false)
})
