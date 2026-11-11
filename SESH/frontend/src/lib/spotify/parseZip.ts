import JSZip from 'jszip'
import type { SpotifyExtendedStreamingRow } from './types'

function isStreamingHistoryAudioFile(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  const base = normalized.split('/').pop() ?? normalized
  return /^Streaming_History_Audio_.*\.json$/i.test(base)
}

export type ZipAudioJsonFile = {
  path: string
  file: JSZip.JSZipObject
}

export async function listAudioJsonFilesFromZip(zipFile: File): Promise<ZipAudioJsonFile[]> {
  const zip = await JSZip.loadAsync(zipFile)
  const matches: ZipAudioJsonFile[] = []

  for (const [path, obj] of Object.entries(zip.files)) {
    if (obj.dir) continue
    if (!isStreamingHistoryAudioFile(path)) continue
    matches.push({ path, file: obj })
  }

  matches.sort((a, b) => a.path.localeCompare(b.path))
  return matches
}

export async function readJsonArrayFromZipFile<T>(
  zipObj: JSZip.JSZipObject,
): Promise<T[]> {
  const text = await zipObj.async('text')
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed)) {
    throw new Error('Expected top-level JSON array')
  }
  return parsed as T[]
}

export async function readSpotifyAudioRowsFromZipFile(
  zipObj: JSZip.JSZipObject,
): Promise<SpotifyExtendedStreamingRow[]> {
  return readJsonArrayFromZipFile<SpotifyExtendedStreamingRow>(zipObj)
}

