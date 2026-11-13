// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from '../lib/spotify/types'
import { listAudioJsonFilesFromZip, readSpotifyAudioRowsFromZipFile } from '../lib/spotify/parseZip'
import { normalizeMusicStream, summarizeStreams } from '../lib/spotify/aggregate'

function post(msg: WorkerResponse) {
  self.postMessage(msg)
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const req = e.data
    if (req.type !== 'processZip') return

    post({
      type: 'progress',
      progress: { stage: 'unzip', message: 'Reading ZIP…' },
    })

    const files = await listAudioJsonFilesFromZip(req.zipFile)
    if (files.length === 0) {
      throw new Error('No Streaming_History_Audio_*.json files found in ZIP.')
    }

    const streams = []

    post({
      type: 'progress',
      progress: {
        stage: 'parse',
        message: `Parsing ${files.length} JSON file(s)…`,
        processedFiles: 0,
        totalFiles: files.length,
      },
    })

    for (let i = 0; i < files.length; i++) {
      const { file, path } = files[i]
      const rows = await readSpotifyAudioRowsFromZipFile(file)
      for (const row of rows) {
        const s = normalizeMusicStream(row)
        if (s) streams.push(s)
      }

      post({
        type: 'progress',
        progress: {
          stage: 'parse',
          message: `Parsed ${i + 1}/${files.length}: ${path}`,
          processedFiles: i + 1,
          totalFiles: files.length,
        },
      })
    }

    post({
      type: 'progress',
      progress: { stage: 'aggregate', message: 'Aggregating…' },
    })

    const summary = summarizeStreams(streams, req.topN)

    post({ type: 'result', summary })
    post({ type: 'progress', progress: { stage: 'done', message: 'Done.' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    post({ type: 'error', error: msg })
  }
}

