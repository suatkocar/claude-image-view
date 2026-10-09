import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import type { PastedImage } from '../types'
import { REMOVE_LABEL, blockCells, drawsPictures, fitPreview, fitRow, imageLabel, imageNumbers, pngSize, tileColumns, withoutImage } from './layout'
import { decodeThumb } from './png'
import type { Thumb } from './png'

const POLL_MS = 200
const images = atom({ plugin: 'image-view', key: 'images' } as const, [] as PastedImage[])
const expanded = atom({ plugin: 'image-view', key: 'expanded' } as const, null as number | null)
type SourceFile = { name: string; size: number; mtimeMs: number; kind: string; isLink: boolean }
type Preview = { revision: string; image: PastedImage }
const EXTENSIONS = /\.(png|jpe?g|webp|heic|heif|gif|tiff?|bmp|avif)$/i
const PAD = 'format=rgba,pad=iw+2*trunc(ih/24):ih:trunc(ih/24):0:color=black@0'
let previewCache = new Map<string, Preview>()
let thumbs = new Map<string, Thumb | null>()
let tmpRoot: string | undefined
let found: { sessionId: string; dir: string } | undefined
let pictures = true
let opener = 'open'
let written: string | undefined
let generation = 0
let pending: Promise<void> | undefined
let edits = Promise.resolve()
let stop: Timer | undefined

async function imagesDir($: EngineInterface): Promise<string | undefined> {
  const sessionId = await $.session.id()
  if (found?.sessionId === sessionId) return found.dir
  if (tmpRoot === undefined) {
    const configured = await $.env.get('CLAUDE_CODE_TMPDIR')
    const uid = (await $.process.run(['id', '-u'], { timeoutMs: 5000 })).stdout.trim()
    if (!/^\d+$/.test(uid)) return undefined
    // Claude appends its per-user directory to CLAUDE_CODE_TMPDIR as well.
    tmpRoot = `${(configured || '/tmp').replace(/\/+$/, '')}/claude-${uid}`
  }
  for (const entry of await $.fs.list(tmpRoot).catch(() => [])) {
    if (entry.kind !== 'dir' || entry.isLink) continue
    const dir = `${tmpRoot}/${entry.name}/${sessionId}/images`
    if (await $.fs.exists(dir)) {
      found = { sessionId, dir }
      return dir
    }
  }
  return undefined
}

async function run($: EngineInterface, argv: readonly string[]): Promise<boolean> {
  return $.process.run(argv, { timeoutMs: 10_000 }).then(result => result.exitCode === 0, () => false)
}

async function describe($: EngineInterface, dir: string, entries: readonly SourceFile[], n: number): Promise<PastedImage> {
  const cache = previewCache
  const decoded = thumbs
  const blocks = !pictures
  const candidates = entries.filter(entry => entry.kind === 'file' && !entry.isLink && entry.name.startsWith(`${n}.`) && EXTENSIONS.test(entry.name))
  candidates.sort((a, b) => Number(!/\.png$/i.test(a.name)) - Number(!/\.png$/i.test(b.name)) || a.name.localeCompare(b.name))
  const source = candidates[0]
  if (!source) return { n, path: null, size: null }
  const path = `${dir}/${source.name}`
  const revision = `${source.name}:${source.size}:${source.mtimeMs}:${blocks}`
  const cached = cache.get(path)
  if (cached?.revision === revision) return cached.image
  // Separate output for each source revision; a completed write can recover a failed preview.
  const stamp = `${source.size.toString(36)}-${source.mtimeMs.toString(36)}`
  const base = dir.slice(0, dir.lastIndexOf('/'))
  const prefix = `${base}/image-view-${source.name}-${stamp}`
  const raw = `${prefix}.raw.png`
  const padded = `${prefix}.png`
  let preview: string | undefined
  if (await $.fs.exists(padded)) preview = padded
  else if (await run($, ['sips', '-s', 'format', 'png', '-Z', '800', path, '--out', raw])) {
    preview = await run($, ['ffmpeg', '-v', 'error', '-nostdin', '-y', '-threads', '1', '-filter_threads', '1', '-i', raw, '-vf', PAD, '-frames:v', '1', padded]) ? padded : raw
  } else if (/\.png$/i.test(source.name)) preview = path
  let image: PastedImage = { n, path: null, size: null, source: path, revision }
  let thumb: Thumb | null = null
  if (preview && await $.fs.exists(preview)) {
    const bytes = await $.fs.read(preview, { as: 'bytes' }).then(value => value.base64, () => undefined)
    const size = bytes === undefined ? null : pngSize(bytes)
    // Only the original large PNG may bypass the host's 4 MiB read cap.
    // Failed reads of small or converted files must not create a broken Image node.
    const directLargePNG = pictures && bytes === undefined && preview === path && source.size > 4 * 1024 * 1024
    if (size !== null || directLargePNG) {
      image = { n, path: preview, source: path, revision, size }
      if (blocks && bytes !== undefined) thumb = decodeThumb(Uint8Array.from(atob(bytes), char => char.charCodeAt(0)))
    }
  }
  if (cached?.image.path) decoded.delete(cached.image.path)
  cache.set(path, { revision, image })
  if (image.path) decoded.set(image.path, thumb)
  return image
}

async function refresh($: EngineInterface, epoch: number) {
  const draft = await $.prompt.read()
  const numbers = imageNumbers(draft.text)
  const dir = numbers.length ? await imagesDir($) : undefined
  const entries = dir ? await $.fs.list(dir).catch(() => []) : []
  const list: PastedImage[] = []
  for (const n of numbers) {
    if (generation !== epoch) return
    list.push(dir ? await describe($, dir, entries, n) : { n, path: null, size: null })
  }
  // Conversion may take longer than typing. Never restore tiles from an old draft.
  if (generation !== epoch || imageNumbers((await $.prompt.read()).text).join(',') !== numbers.join(',')) return
  const json = JSON.stringify(list)
  if (json === written) return
  await update($, images, () => list)
  const selected = await read($, expanded)
  if (selected !== null && !list.some(image => image.n === selected && image.path)) {
    await update($, expanded, () => null)
  }
  written = json
}

async function check($: EngineInterface) {
  if (pending) return pending
  const running = refresh($, generation)
  pending = running
  try { await running } finally { if (pending === running) pending = undefined }
}

function remove($: EngineInterface, n: number): Promise<void> {
  edits = edits.catch(() => undefined).then(async () => {
    const current = (await $.prompt.read()).text
    const text = withoutImage(current, n)
    if (text === current) return
    const result = await $.prompt.fill({ text, mode: 'replace' })
    if (!result.isFilled) return
    generation++
    await pending
    await check($)
  })
  return edits
}

async function openPicture($: EngineInterface, path: string) {
  await $.process.run([opener, path], { timeoutMs: 5000 }).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    stop?.cancel()
    generation++
    previewCache = new Map()
    thumbs = new Map()
    tmpRoot = undefined
    found = undefined
    written = undefined
    pending = undefined
    edits = Promise.resolve()
    const started = await next(e)
    await update($, expanded, () => null)
    pictures = drawsPictures({
      TERM: await $.env.get('TERM'),
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      TMUX: await $.env.get('TMUX'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
      GHOSTTY_RESOURCES_DIR: await $.env.get('GHOSTTY_RESOURCES_DIR'),
      WEZTERM_EXECUTABLE: await $.env.get('WEZTERM_EXECUTABLE'),
      CLAUDE_IMAGE_VIEW_RENDERER: await $.env.get('CLAUDE_IMAGE_VIEW_RENDERER'),
    })
    const system = await $.process.run(['uname', '-s']).catch(() => ({ stdout: '' }))
    opener = system.stdout.trim() === 'Linux' ? 'xdg-open' : 'open'
    stop = $.clock.every(POLL_MS, () => check($))
    return started
  })

  on('ui.message', { component: 'AbovePrompt' }, async ($, e, next) => {
    const match = /^preview-(\d+)$/.exec(e.element)
    if (e.surface !== 'terminal' || e.module !== 'hooks/thumbnail-pointer.tsx' || e.data !== 'open-preview' || !match) return next(e)
    const n = Number(match[1])
    const image = (await read($, images)).find(item => item.n === n)
    if (image?.path && imageNumbers((await $.prompt.read()).text).includes(n)) {
      await update($, expanded, () => n)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const list = await read($, images)
    const { Box, Button, Client, Image, Raster, Text } = $.ui.resolve(e)
    const canClick = e.viewport?.isFullscreen === true
    const selected = await read($, expanded)
    const chosen = canClick ? list.find(image => image.n === selected && image.path) : undefined
    const large = chosen ? fitPreview(chosen.size, e.props.maxRows - 1, e.props.bodyColumns) : null
    const below = await next(e)
    if (chosen && large) {
      const thumb = thumbs.get(chosen.path!)
      return (
        <Box flexDirection="column">
          <Box key="expanded-preview" flexDirection="column" alignItems="center" width={e.props.bodyColumns}>
            <Text bold wrap="truncate">{imageLabel(chosen.n)}</Text>
            <Box borderStyle="round" borderDimColor width={large.columns + 2} height={large.rows + 2} flexShrink={0}>
              {thumb && !pictures ? (
                <Raster key={`expanded-${chosen.n}`} columns={large.columns} rows={large.rows} cells={blockCells(thumb, large.columns, large.rows)} />
              ) : (
                <Image key={`expanded-${chosen.n}`} source={{ file: chosen.path!, format: 'png' }} columns={large.columns} rows={large.rows} alt={imageLabel(chosen.n)} />
              )}
            </Box>
            <Box flexDirection="row" columnGap={2}>
              <Button key="close-preview" plain onPress={() => update($, expanded, () => null)}>[Close]</Button>
              {chosen.source && e.props.bodyColumns >= 24 && (
                <Button key="open-preview-original" plain dimColor hover={{ dimColor: false }} onPress={() => openPicture($, chosen.source!)}>{opener === 'open' ? 'Open in Preview' : 'Open original'}</Button>
              )}
            </Box>
          </Box>
          {below}
        </Box>
      )
    }
    const cells = fitRow(list.map(image => image.size), e.props.maxRows - 1, e.props.bodyColumns, list.map(image => image.n))
    if (!cells.length) return below
    const hidden = list.length - cells.length
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1} alignItems="flex-end">
          {list.slice(0, cells.length).map((image, i) => {
            const { columns, rows } = cells[i]!
            const label = imageLabel(image.n)
            const canOpen = canClick && image.source !== undefined
            const thumb = image.path ? thumbs.get(image.path) ?? null : null
            return (
              <Box key={`tile-${image.n}`} flexDirection="column" alignItems="center" width={tileColumns(cells[i]!, image.n)} flexShrink={0}>
                <Box width={columns + 2} height={rows + 2} flexShrink={0}>
                  {canClick && image.path && (pictures || thumb) && (
                    <Box position="absolute" top={0} left={0}>
                      <Client key={`preview-${image.n}`} module="./thumbnail-pointer.tsx" width={columns + 2} height={rows + 2} />
                    </Box>
                  )}
                  <Box borderStyle="round" borderDimColor hover={{ borderDimColor: false }} width={columns + 2} height={rows + 2} flexShrink={0}>
                    {image.path === null || (!pictures && !thumb) ? (
                      <Box width={columns} height={rows} alignItems="center" justifyContent="center">
                        <Text dimColor wrap="truncate">no preview</Text>
                      </Box>
                    ) : thumb && !pictures ? (
                      <Raster key={`blocks-${image.n}`} columns={columns} rows={rows} cells={blockCells(thumb, columns, rows)} />
                    ) : (
                      <Image key={`image-${image.n}`} source={{ file: image.path!, format: 'png' }} columns={columns} rows={rows} alt={label} />
                    )}
                  </Box>
                </Box>
                {canClick && <Button key={`remove-${image.n}`} plain dimColor hover={{ dimColor: false }} onPress={() => remove($, image.n)}>{REMOVE_LABEL}</Button>}
                {canOpen ? (
                  <Button key={`open-${image.n}`} plain dimColor hover={{ dimColor: false }} onPress={() => openPicture($, image.source!)}>{label}</Button>
                ) : <Text dimColor>{label}</Text>}
              </Box>
            )
          })}
          {hidden > 0 && <Text dimColor>+{hidden}</Text>}
        </Box>
        {below}
      </Box>
    )
  })
}
