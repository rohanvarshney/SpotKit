// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import type { RawLibraryDataset, SpotifyAlbumFull } from '../types/spotify'

export const DATASET_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
export const ALBUM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days for immutable album tracklists

const DB_NAME = 'spotkit_topalbums_db'
const DB_VERSION = 1
const DATASET_STORE = 'datasets'
const ALBUM_STORE = 'albums'
const ACTIVE_DATASET_KEY = 'active_library'

interface CachedDatasetRecord {
  key: string
  dataset: RawLibraryDataset
  savedAt: number
  expiresAt: number
}

interface CachedAlbumRecord {
  albumId: string
  album: SpotifyAlbumFull
  savedAt: number
  expiresAt: number
}

// In-memory fallback for environments where IndexedDB is unavailable or blocked
let memoryDatasetRecord: CachedDatasetRecord | null = null
const memoryAlbumStore = new Map<string, CachedAlbumRecord>()

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(DATASET_STORE)) {
          db.createObjectStore(DATASET_STORE, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(ALBUM_STORE)) {
          db.createObjectStore(ALBUM_STORE, { keyPath: 'albumId' })
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}

export async function getCachedLibraryDataset(): Promise<RawLibraryDataset | null> {
  const now = Date.now()
  const db = await openCacheDb()

  if (!db) {
    if (memoryDatasetRecord && now < memoryDatasetRecord.expiresAt) {
      return memoryDatasetRecord.dataset
    }
    return null
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DATASET_STORE, 'readonly')
      const store = tx.objectStore(DATASET_STORE)
      const req = store.get(ACTIVE_DATASET_KEY)

      req.onsuccess = () => {
        const record = req.result as CachedDatasetRecord | undefined
        if (record && now < record.expiresAt && record.dataset) {
          resolve(record.dataset)
        } else {
          resolve(null)
        }
      }

      req.onerror = () => {
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}

export async function setCachedLibraryDataset(
  dataset: RawLibraryDataset,
  ttlMs: number = DATASET_CACHE_TTL_MS,
): Promise<void> {
  if (dataset.isDemo) return

  const now = Date.now()
  const record: CachedDatasetRecord = {
    key: ACTIVE_DATASET_KEY,
    dataset,
    savedAt: now,
    expiresAt: now + ttlMs,
  }
  memoryDatasetRecord = record

  const db = await openCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    try {
      const storeNames = [DATASET_STORE]
      if (db.objectStoreNames.contains(ALBUM_STORE)) {
        storeNames.push(ALBUM_STORE)
      }
      const tx = db.transaction(storeNames, 'readwrite')
      tx.objectStore(DATASET_STORE).put(record)

      if (storeNames.includes(ALBUM_STORE) && dataset.hydratedAlbumsMap) {
        const albumStore = tx.objectStore(ALBUM_STORE)
        for (const album of Object.values(dataset.hydratedAlbumsMap)) {
          if (album?.id) {
            albumStore.put({
              albumId: album.id,
              album,
              savedAt: now,
              expiresAt: now + ALBUM_CACHE_TTL_MS,
            } satisfies CachedAlbumRecord)
          }
        }
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function clearCachedLibraryDataset(): Promise<void> {
  memoryDatasetRecord = null
  const db = await openCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DATASET_STORE, 'readwrite')
      tx.objectStore(DATASET_STORE).delete(ACTIVE_DATASET_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function getCachedHydratedAlbums(
  albumIds: string[],
): Promise<Record<string, SpotifyAlbumFull>> {
  const result: Record<string, SpotifyAlbumFull> = {}
  if (albumIds.length === 0) return result

  const now = Date.now()
  const db = await openCacheDb()

  if (!db) {
    for (const id of albumIds) {
      const rec = memoryAlbumStore.get(id)
      if (rec && now < rec.expiresAt) {
        result[id] = rec.album
      }
    }
    return result
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ALBUM_STORE, 'readonly')
      const store = tx.objectStore(ALBUM_STORE)
      let pending = albumIds.length

      for (const id of albumIds) {
        const req = store.get(id)
        req.onsuccess = () => {
          const rec = req.result as CachedAlbumRecord | undefined
          if (rec && now < rec.expiresAt && rec.album) {
            result[id] = rec.album
          }
          pending -= 1
          if (pending === 0) resolve(result)
        }
        req.onerror = () => {
          pending -= 1
          if (pending === 0) resolve(result)
        }
      }
    } catch {
      resolve(result)
    }
  })
}

export async function setCachedHydratedAlbum(
  album: SpotifyAlbumFull,
): Promise<void> {
  if (!album?.id) return
  const now = Date.now()
  const rec: CachedAlbumRecord = {
    albumId: album.id,
    album,
    savedAt: now,
    expiresAt: now + ALBUM_CACHE_TTL_MS,
  }
  memoryAlbumStore.set(album.id, rec)

  const db = await openCacheDb()
  if (!db) return

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(ALBUM_STORE, 'readwrite')
      tx.objectStore(ALBUM_STORE).put(rec)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
