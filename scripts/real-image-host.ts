// A development-only host adapter: real files and child processes, with a local UI tree.
// The official plugin test harness intentionally supplies neither fs nor process implementations.
import { strict as assert } from 'node:assert'
import { access, readdir, lstat, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

Object.assign(globalThis, {
  h: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
  Fragment: 'Fragment',
})
const registerPath = `${process.cwd()}/hooks/register.tsx`
const { register } = await import(registerPath)
const { pngSize } = await import('./hooks/layout.ts')
const { decodeThumb } = await import('./hooks/png.ts')
const root = process.argv[2]
const formats = JSON.parse(process.argv[3]) as string[]
const hooks = new Map()
register((event, ...args) => hooks.set(event, args.at(-1)))
let text = ''
let tick: () => Promise<void>
let conversions = 0
const $ = {
  session: { id: async () => 'session' },
  env: { get: async name => ({ CLAUDE_CODE_TMPDIR: root, CLAUDE_IMAGE_VIEW_RENDERER: 'image' })[name] },
  prompt: { read: async () => ({ text, cursor: text.length }), fill: async input => { text = input.text; return { isFilled: true } } },
  clock: { every: (_, callback) => { tick = callback; return { cancel() {} } } },
  fs: {
    list: async path => Promise.all((await readdir(path)).map(async name => {
      const stat = await lstat(`${path}/${name}`)
      return { name, kind: stat.isDirectory() ? 'dir' : 'file', size: stat.size, mtimeMs: stat.mtimeMs, isLink: stat.isSymbolicLink() }
    })),
    exists: async path => access(path).then(() => true, () => false),
    read: async path => ({ base64: (await readFile(path)).toString('base64') }),
  },
  process: { run: async (argv, init = {}) => {
    if (argv[0] === 'sips' || argv[0] === 'ffmpeg') conversions++
    const stdout = execFileSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: init.timeoutMs ?? 10000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
  } },
  ui: { resolve: () => Object.fromEntries(['Box', 'Button', 'Image', 'Raster', 'Text'].map(name => [name, name])) },
}
function nodes(tree): any[] {
  return typeof tree !== 'object' || tree === null ? [] : [tree, ...(tree.children ?? []).flatMap(nodes)]
}
const render = () => hooks.get('ui.render')($, {
  surface: 'terminal', viewport: { isFullscreen: true }, props: { maxRows: 20, bodyColumns: 120 },
}, async () => null)
await hooks.get('session.start')($, {}, async () => ({}))
for (const [index, extension] of formats.entries()) {
  const n = index + 1
  text = `check [Image #${n}] trailing text`
  await tick!()
  const tree = nodes(await render())
  const image = tree.find(node => node.type === 'Image')
  assert.ok(image, `${extension}: missing image tile`)
  assert.equal(image.props.source.format, 'png')
  assert.ok(!image.props.source.file.includes('/images/'), `${extension}: original used instead of converted preview`)
  const bytes = await readFile(image.props.source.file)
  const size = pngSize(bytes.toString('base64'))!
  assert.ok(size.width > 0 && size.width <= 868 && size.height > 0 && size.height <= 800)
  assert.ok(decodeThumb(bytes), `${extension}: preview also decodes for the half-block renderer`)
  const count = conversions
  await tick!()
  assert.equal(conversions, count, `${extension}: unchanged preview converted twice`)
  await tree.find(node => node.props.key === `remove-${n}`).props.onPress()
  assert.equal(text, 'check trailing text')
  assert.ok(!nodes(await render()).some(node => node.type === 'Image'))
  console.log(`PASS ${extension}: actual conversion, ${size.width}x${size.height} PNG, decoder, cache reuse, removal`)
}
