export type PastedImage = {
  n: number
  /** Absolute path of the cached PNG; null when it can't be found. */
  path: string | null
  /** Original attachment, used by the open action; never overwritten. */
  source?: string
  /** Source metadata revision, included in renderer invalidation. */
  revision?: string
  /** Pixel size; null when unknown, and the tile falls back to a default shape. */
  size: { width: number; height: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'image-view': { images: PastedImage[]; expanded: number | null }
  }
}
