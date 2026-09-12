/**
 * Minimal filesystem abstraction for AppData-backed workspace storage.
 * Desktop uses Tauri plugin-fs; tests use an in-memory backend.
 */
export type FsBackend = {
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
  exists(path: string): Promise<boolean>
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, contents: string): Promise<void>
  writeFile(path: string, contents: Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  readDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>
}

/** In-memory FS for unit tests (no Tauri). Paths use `/` separators. */
export function createMemoryFsBackend(): FsBackend & { _files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  const dirs = new Set<string>([''])

  const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const parentOf = (p: string) => {
    const n = normalize(p)
    const i = n.lastIndexOf('/')
    return i <= 0 ? '' : n.slice(0, i)
  }
  const ensureParent = (p: string) => {
    let cur = parentOf(p)
    const stack: string[] = []
    while (cur && !dirs.has(cur)) {
      stack.push(cur)
      cur = parentOf(cur)
    }
    for (let i = stack.length - 1; i >= 0; i--) dirs.add(stack[i]!)
  }

  return {
    _files: files,
    async mkdir(path, opts) {
      const n = normalize(path)
      if (!n) return
      if (opts?.recursive) {
        const parts = n.split('/')
        let acc = ''
        for (const part of parts) {
          acc = acc ? `${acc}/${part}` : part
          dirs.add(acc)
        }
      } else {
        ensureParent(n)
        dirs.add(n)
      }
    },
    async exists(path) {
      const n = normalize(path)
      return files.has(n) || dirs.has(n)
    },
    async readTextFile(path) {
      const data = files.get(normalize(path))
      if (!data) throw new Error(`ENOENT: ${path}`)
      return new TextDecoder().decode(data)
    },
    async writeTextFile(path, contents) {
      const n = normalize(path)
      ensureParent(n)
      files.set(n, new TextEncoder().encode(contents))
    },
    async writeFile(path, contents) {
      const n = normalize(path)
      ensureParent(n)
      files.set(n, contents)
    },
    async readFile(path) {
      const data = files.get(normalize(path))
      if (!data) throw new Error(`ENOENT: ${path}`)
      return data
    },
    async rename(from, to) {
      const a = normalize(from)
      const b = normalize(to)
      const data = files.get(a)
      if (!data) throw new Error(`ENOENT: ${from}`)
      ensureParent(b)
      files.set(b, data)
      files.delete(a)
    },
    async remove(path) {
      const n = normalize(path)
      files.delete(n)
      dirs.delete(n)
    },
    async readDir(path) {
      const n = normalize(path)
      const prefix = n ? `${n}/` : ''
      const names = new Set<string>()
      const result: { name: string; isDirectory: boolean }[] = []
      for (const dir of dirs) {
        if (!dir.startsWith(prefix) || dir === n) continue
        const rest = dir.slice(prefix.length)
        if (!rest || rest.includes('/')) continue
        if (!names.has(rest)) {
          names.add(rest)
          result.push({ name: rest, isDirectory: true })
        }
      }
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue
        const rest = file.slice(prefix.length)
        if (!rest || rest.includes('/')) continue
        if (!names.has(rest)) {
          names.add(rest)
          result.push({ name: rest, isDirectory: false })
        }
      }
      return result
    },
  }
}

export async function createTauriAppDataFsBackend(): Promise<FsBackend> {
  const {
    BaseDirectory,
    mkdir,
    exists,
    readTextFile,
    writeTextFile,
    writeFile,
    readFile,
    rename,
    remove,
    readDir,
  } = await import('@tauri-apps/plugin-fs')

  const base = { baseDir: BaseDirectory.AppData }

  return {
    mkdir: (path, opts) => mkdir(path, { ...base, recursive: opts?.recursive ?? true }),
    exists: (path) => exists(path, base),
    readTextFile: (path) => readTextFile(path, base),
    writeTextFile: (path, contents) => writeTextFile(path, contents, base),
    writeFile: (path, contents) => writeFile(path, contents, base),
    readFile: (path) => readFile(path, base),
    rename: (from, to) =>
      rename(from, to, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      }),
    remove: (path) => remove(path, base),
    readDir: async (path) => {
      const entries = await readDir(path, base)
      return entries.map((e) => ({
        name: e.name,
        isDirectory: !!e.isDirectory,
      }))
    },
  }
}
