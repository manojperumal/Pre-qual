import { workerApi } from './api'

/**
 * FR-6: progress is queued locally and flushed when connectivity returns, so a
 * dropped connection never loses a worker's place.
 */
const KEY = 'orient_progress_queue'

interface Item {
  enrollment_id: string
  module_version_id: string
  segment_index: number
  language: string
}

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

export function queueProgress(item: Item) {
  const same = (i: Item) => i.enrollment_id === item.enrollment_id && i.module_version_id === item.module_version_id
  const items = read()
  const prev = items.find(same)
  const next = prev && prev.segment_index > item.segment_index ? { ...prev, language: item.language } : item
  write([...items.filter((i) => !same(i)), next])
  void flushProgress()
}

let flushing: Promise<void> | null = null

export function flushProgress(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    const items = read()
    const byEnrollment = new Map<string, Item[]>()
    for (const i of items) byEnrollment.set(i.enrollment_id, [...(byEnrollment.get(i.enrollment_id) ?? []), i])
    for (const [eid, list] of byEnrollment) {
      try {
        await workerApi.post(`/enrollments/${eid}/progress`, {
          items: list.map(({ module_version_id, segment_index, language }) => ({ module_version_id, segment_index, language })),
        })
        // Drop what was sent, but keep anything that advanced further while we were sending.
        write(read().filter((i) => !list.some((l) => l.enrollment_id === i.enrollment_id && l.module_version_id === i.module_version_id && l.segment_index >= i.segment_index)))
      } catch {
        /* still offline — keep queued */
      }
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

export const pendingProgress = () => read().length

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushProgress())
}
