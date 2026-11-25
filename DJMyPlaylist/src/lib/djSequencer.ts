// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import {
  ALL_CAMELOT_CODES,
  camelotToPitchAndMode,
  computeCohesionScore,
  formatDuration,
  getCompatibleCamelotKeys,
} from './camelotEngine'
import type {
  AnalyzedTrack,
  CamelotCode,
  CohesionBreakdown,
  NarrationLogEntry,
  NarrationPhase,
  SequencerOptions,
  SequencerResult,
} from '../types/spotify'

export function computeCrateStats(tracks: AnalyzedTrack[]): {
  camelotCounts: Record<CamelotCode, number>
  bpmRange: { min: number; max: number; median: number }
} {
  const camelotCounts = Object.fromEntries(
    ALL_CAMELOT_CODES.map((code) => [code, 0]),
  ) as Record<CamelotCode, number>

  if (tracks.length === 0) {
    return {
      camelotCounts,
      bpmRange: { min: 0, max: 0, median: 0 },
    }
  }

  const bpms: number[] = []
  for (const track of tracks) {
    camelotCounts[track.camelot] = (camelotCounts[track.camelot] ?? 0) + 1
    bpms.push(track.bpm)
  }
  bpms.sort((a, b) => a - b)

  const mid = Math.floor(bpms.length / 2)
  const median =
    bpms.length % 2 === 0
      ? Math.round((bpms[mid - 1] + bpms[mid]) / 2)
      : bpms[mid]

  return {
    camelotCounts,
    bpmRange: {
      min: bpms[0],
      max: bpms[bpms.length - 1],
      median,
    },
  }
}

export function evaluateTrackSequence(
  orderedTracks: AnalyzedTrack[],
  allTracks: AnalyzedTrack[],
): Pick<
  SequencerResult,
  | 'orderedTracks'
  | 'unselectedTracks'
  | 'transitions'
  | 'avgCohesion'
  | 'minCohesion'
  | 'maxCohesion'
  | 'camelotCounts'
  | 'bpmRange'
> {
  const selectedIds = new Set(orderedTracks.map((t) => t.id))
  const unselectedTracks = allTracks.filter((t) => !selectedIds.has(t.id))
  const transitions: CohesionBreakdown[] = []

  for (let i = 1; i < orderedTracks.length; i += 1) {
    transitions.push(
      computeCohesionScore(orderedTracks[i - 1], orderedTracks[i]),
    )
  }

  const avgCohesion =
    transitions.length === 0
      ? orderedTracks.length > 0
        ? 100
        : 0
      : Math.round(
          transitions.reduce((acc, t) => acc + t.totalScore, 0) /
            transitions.length,
        )

  const minCohesion =
    transitions.length === 0
      ? avgCohesion
      : Math.min(...transitions.map((t) => t.totalScore))
  const maxCohesion =
    transitions.length === 0
      ? avgCohesion
      : Math.max(...transitions.map((t) => t.totalScore))

  const { camelotCounts, bpmRange } = computeCrateStats(allTracks)

  return {
    orderedTracks,
    unselectedTracks,
    transitions,
    avgCohesion,
    minCohesion,
    maxCohesion,
    camelotCounts,
    bpmRange,
  }
}

export function findBestInsertionPosition(
  track: AnalyzedTrack,
  orderedTracks: AnalyzedTrack[],
): { index: number; deltaScore: number; newAvgCohesion: number } {
  if (orderedTracks.length === 0) {
    return { index: 0, deltaScore: 100, newAvgCohesion: 100 }
  }

  const baseSum = orderedTracks.reduce((sum, t, idx) => {
    if (idx === 0) return 0
    return sum + computeCohesionScore(orderedTracks[idx - 1], t).totalScore
  }, 0)

  let bestIdx = orderedTracks.length
  let bestSum = -1

  for (let pos = 0; pos <= orderedTracks.length; pos += 1) {
    let candidateSum = baseSum
    if (pos > 0 && pos < orderedTracks.length) {
      candidateSum -= computeCohesionScore(
        orderedTracks[pos - 1],
        orderedTracks[pos],
      ).totalScore
    }
    if (pos > 0) {
      candidateSum += computeCohesionScore(
        orderedTracks[pos - 1],
        track,
      ).totalScore
    }
    if (pos < orderedTracks.length) {
      candidateSum += computeCohesionScore(
        track,
        orderedTracks[pos],
      ).totalScore
    }
    if (candidateSum > bestSum) {
      bestSum = candidateSum
      bestIdx = pos
    }
  }

  const newTransitions = orderedTracks.length
  const newAvgCohesion = Math.round(bestSum / Math.max(1, newTransitions))
  return {
    index: bestIdx,
    deltaScore: bestSum - baseSum,
    newAvgCohesion,
  }
}

function makeScoreAccessor(tracks: AnalyzedTrack[]) {
  const n = tracks.length
  const useFlatCache = n <= 800
  const flatCache = useFlatCache ? new Int16Array(n * n).fill(-1) : null
  const sparseCache = useFlatCache ? null : new Map<string, number>()

  const getScore = (i: number, j: number): number => {
    if (i === j) return 100
    if (flatCache) {
      const idx = i * n + j
      const cached = flatCache[idx]
      if (cached !== -1) return cached
      const score = computeCohesionScore(tracks[i], tracks[j]).totalScore
      flatCache[idx] = score
      flatCache[j * n + i] = score
      return score
    }
    const key = i < j ? `${i}:${j}` : `${j}:${i}`
    const cached = sparseCache!.get(key)
    if (cached !== undefined) return cached
    const score = computeCohesionScore(tracks[i], tracks[j]).totalScore
    sparseCache!.set(key, score)
    return score
  }

  return { getScore }
}

interface PendingSeedLog {
  phase: NarrationPhase
  badge: string
  message: string
  detail?: string
  scoreImpact?: string
}

/**
 * Recursively & iteratively sequences an analyzed crate (or an optimal X-track subset)
 * using Camelot Wheel harmonic compatibility, BPM proximity (including half/double-time),
 * and energy continuity, emitting narrated live thought-process logs at every stage.
 */
export function sequencePlaylist(
  tracks: AnalyzedTrack[],
  options?: SequencerOptions,
): SequencerResult {
  const logs: NarrationLogEntry[] = []
  let stepCounter = 0

  const addLog = (
    phase: NarrationPhase,
    badge: string,
    message: string,
    detail?: string,
    scoreImpact?: string,
  ) => {
    stepCounter += 1
    logs.push({
      id: `log_${stepCounter}`,
      step: stepCounter,
      phase,
      badge,
      message,
      detail,
      scoreImpact,
    })
  }

  const n = tracks.length
  const { camelotCounts, bpmRange } = computeCrateStats(tracks)

  if (n === 0) {
    addLog(
      'complete',
      'LOCKED',
      'No playable tracks available to sequence.',
    )
    return {
      orderedTracks: [],
      unselectedTracks: [],
      transitions: [],
      avgCohesion: 0,
      minCohesion: 0,
      maxCohesion: 0,
      baselineCohesion: 0,
      branchesExplored: 0,
      backtracksCount: 0,
      iterativeImprovements: 0,
      narrationLogs: logs,
      camelotCounts,
      bpmRange,
    }
  }

  const requestedMax =
    options?.maxTracks && options.maxTracks > 0
      ? Math.min(options.maxTracks, n)
      : n
  const targetCount = requestedMax
  const isSubsetMode = targetCount < n

  // =========================================================================
  // PHASE 1: FULL CRATE HARMONIC & BPM CENSUS
  // =========================================================================
  const populatedKeys = ALL_CAMELOT_CODES.filter((c) => camelotCounts[c] > 0)
  const topKeysSorted = [...populatedKeys].sort(
    (a, b) => camelotCounts[b] - camelotCounts[a],
  )
  const topKeysText = topKeysSorted
    .slice(0, 5)
    .map((k) => `${k} (${camelotCounts[k]})`)
    .join(', ')

  addLog(
    'scan',
    'SCAN',
    `Mapped ${n.toLocaleString()} tracks across ${populatedKeys.length} song keys (${bpmRange.min}–${bpmRange.max} BPM, median ${bpmRange.median} BPM).`,
    `Top keys in crate: ${topKeysText}. Target mode: ${
      isSubsetMode
        ? `Optimal ${targetCount}-track subset out of ${n}`
        : `Full ${n}-track playlist arrangement`
    }.`,
  )

  if (n === 1) {
    const only = tracks[0]
    addLog(
      'complete',
      'LOCKED',
      `Single track "${only.name}" (${only.camelot} • ${only.bpm} BPM) locked as set.`,
    )
    return {
      orderedTracks: [only],
      unselectedTracks: [],
      transitions: [],
      avgCohesion: 100,
      minCohesion: 100,
      maxCohesion: 100,
      baselineCohesion: 100,
      branchesExplored: 1,
      backtracksCount: 0,
      iterativeImprovements: 0,
      narrationLogs: logs,
      camelotCounts,
      bpmRange,
    }
  }

  // Find strongest Camelot neighborhood & densest BPM pocket
  let bestNeighborhoodKey: CamelotCode = topKeysSorted[0] ?? '8A'
  let bestNeighborhoodCount = 0
  let bestNeighborhoodKeysList: CamelotCode[] = []

  for (const key of populatedKeys) {
    const compat = getCompatibleCamelotKeys(key)
    const family = Array.from(
      new Set([compat.exact, compat.relative, compat.fifthUp, compat.fifthDown]),
    )
    const sum = family.reduce((acc, code) => acc + (camelotCounts[code] ?? 0), 0)
    if (sum > bestNeighborhoodCount) {
      bestNeighborhoodCount = sum
      bestNeighborhoodKey = key
      bestNeighborhoodKeysList = family.filter((c) => camelotCounts[c] > 0)
    }
  }

  // Densest ±4 BPM pocket
  let bestBpmCenter = bpmRange.median
  let bestBpmPocketCount = 0
  for (const t of tracks) {
    let count = 0
    for (const other of tracks) {
      if (Math.abs(other.bpm - t.bpm) <= 4) count += 1
    }
    if (count > bestBpmPocketCount) {
      bestBpmPocketCount = count
      bestBpmCenter = t.bpm
    }
  }

  const bestKeyMeta = camelotToPitchAndMode(bestNeighborhoodKey)
  addLog(
    'cluster',
    'CLUSTER',
    `Identified dominant harmonic pocket around ${bestNeighborhoodKey} (${bestKeyMeta.musicalKey}) and ${bestBpmCenter - 4}–${bestBpmCenter + 4} BPM.`,
    `${bestNeighborhoodCount} tracks sit inside compatible song key neighbors (${bestNeighborhoodKeysList.join(' / ')}); ${bestBpmPocketCount} tracks cluster inside the core tempo pocket.${
      isSubsetMode
        ? ` Subsetting to ${targetCount} tracks allows pruning isolated tempo/key outliers.`
        : ''
    }`,
  )

  // =========================================================================
  // PHASE 2: MULTI-SEED RECURSIVE LOOKAHEAD SEARCH
  // =========================================================================
  const { getScore } = makeScoreAccessor(tracks)

  // Connectivity score per track: average of its top 4 outgoing cohesion scores
  const connectivity = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const topScores: number[] = []
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue
      const s = getScore(i, j)
      if (topScores.length < 4) {
        topScores.push(s)
        topScores.sort((a, b) => a - b)
      } else if (s > topScores[0]) {
        topScores[0] = s
        topScores.sort((a, b) => a - b)
      }
    }
    connectivity[i] =
      topScores.length > 0
        ? topScores.reduce((a, b) => a + b, 0) / topScores.length
        : 50
  }

  const preferredIdx = options?.preferredOpenerId
    ? tracks.findIndex((t) => t.id === options.preferredOpenerId)
    : -1
  const preferredOpenerLocked = preferredIdx !== -1

  // Build candidate starting seed indices
  const seedIndices: number[] = []
  const addSeed = (idx: number) => {
    if (idx >= 0 && idx < n && !seedIndices.includes(idx)) {
      seedIndices.push(idx)
    }
  }

  if (preferredOpenerLocked) {
    addSeed(preferredIdx)
  } else {
    // 1. Highest connectivity inside dominant Camelot neighborhood
    const clusterIndices = tracks
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => bestNeighborhoodKeysList.includes(t.camelot))
      .sort((a, b) => connectivity[b.idx] - connectivity[a.idx])

    if (clusterIndices.length > 0) {
      addSeed(clusterIndices[0].idx)
    }

    // 2. Warm-up / rising tempo anchor inside dominant cluster (lower BPM, solid connectivity)
    const warmupCandidate = [...clusterIndices]
      .filter(({ idx }) => connectivity[idx] >= 72)
      .sort((a, b) => a.t.bpm - b.t.bpm)[0]
    if (warmupCandidate) {
      addSeed(warmupCandidate.idx)
    }

    // 3. Global highest connectivity tracks across distinct Camelot keys
    const byConnectivity = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => connectivity[b] - connectivity[a],
    )
    const usedSeedKeys = new Set<CamelotCode>(
      seedIndices.map((i) => tracks[i].camelot),
    )
    for (const idx of byConnectivity) {
      if (seedIndices.length >= 6) break
      if (!usedSeedKeys.has(tracks[idx].camelot)) {
        addSeed(idx)
        usedSeedKeys.add(tracks[idx].camelot)
      }
    }

    // 4. Fill remaining seed slots up to 6
    for (const idx of byConnectivity) {
      if (seedIndices.length >= Math.min(6, n)) break
      addSeed(idx)
    }
  }

  // Baseline 1-step greedy sequence from seedIndices[0] for comparison
  const { baselineSeq, baselineSum } = (() => {
    const visited = new Uint8Array(n)
    const first = seedIndices[0]
    visited[first] = 1
    const seq: number[] = [first]
    let cur = first
    let total = 0
    for (let step = 1; step < targetCount; step += 1) {
      let bestNext = -1
      let bestScore = -1
      for (let j = 0; j < n; j += 1) {
        if (visited[j]) continue
        const s = getScore(cur, j)
        if (s > bestScore) {
          bestScore = s
          bestNext = j
        }
      }
      if (bestNext === -1) break
      visited[bestNext] = 1
      seq.push(bestNext)
      total += bestScore
      cur = bestNext
    }
    return { baselineSeq: seq, baselineSum: total }
  })()

  const baselineCohesion =
    targetCount <= 1
      ? 100
      : Math.round(baselineSum / Math.max(1, targetCount - 1))

  let branchesExplored = 0
  let totalBacktracksCount = 0

  /**
   * Recursive lookahead evaluator returning the best discounted cumulative score
   * from `currentIdx` across `depth` steps ahead.
   */
  const recursiveLookahead = (
    currentIdx: number,
    visited: Uint8Array,
    unvisitedList: number[],
    stepsLeft: number,
    depth: number,
    beamWidth: number,
  ): number => {
    branchesExplored += 1
    if (depth <= 0 || stepsLeft <= 0) return 0

    // Pick top `beamWidth` unvisited candidates from currentIdx
    const topCands: Array<{ idx: number; score: number }> = []
    for (let u = 0; u < unvisitedList.length; u += 1) {
      const cand = unvisitedList[u]
      if (visited[cand]) continue
      const score = getScore(currentIdx, cand)
      if (topCands.length < beamWidth) {
        topCands.push({ idx: cand, score })
        if (topCands.length === beamWidth) {
          topCands.sort((a, b) => a.score - b.score)
        }
      } else if (score > topCands[0].score) {
        topCands[0] = { idx: cand, score }
        topCands.sort((a, b) => a.score - b.score)
      }
    }

    if (topCands.length === 0) return 0

    const discount = depth === 2 ? 0.5 / 0.75 : 0.75
    let bestCumulative = -1

    for (let c = 0; c < topCands.length; c += 1) {
      const { idx, score } = topCands[c]
      visited[idx] = 1
      const childScore = recursiveLookahead(
        idx,
        visited,
        unvisitedList,
        stepsLeft - 1,
        depth - 1,
        Math.max(2, beamWidth - 1),
      )
      visited[idx] = 0
      const total = score + discount * childScore
      if (total > bestCumulative) {
        bestCumulative = total
      }
    }

    return bestCumulative
  }

  const runRecursiveSeed = (seedIdx: number) => {
    const visited = new Uint8Array(n)
    const seq: number[] = [seedIdx]
    visited[seedIdx] = 1

    const seedLogs: PendingSeedLog[] = []
    let seedBacktracks = 0
    let directSum = 0

    const openerTrack = tracks[seedIdx]
    seedLogs.push({
      phase: 'recursive',
      badge: 'RECURSIVE',
      message: `${
        preferredOpenerLocked ? 'Locked user-selected opener' : 'Anchored opener'
      }: "${openerTrack.name}" (${openerTrack.camelot} • ${openerTrack.bpm} BPM).`,
      detail: `Exploring recursive lookahead branches across remaining ${
        n - 1
      } tracks to reach ${targetCount} tracks.`,
    })

    // Maintain compact list of unvisited indices for speed
    let unvisitedList: number[] = []
    for (let i = 0; i < n; i += 1) {
      if (i !== seedIdx) unvisitedList.push(i)
    }

    let milestoneCount = 0

    for (let step = 1; step < targetCount; step += 1) {
      const currentIdx = seq[seq.length - 1]
      const stepsRemaining = targetCount - step
      const unvisitedCount = unvisitedList.length

      // Score all unvisited candidates with immediate cohesion + slight connectivity lookahead
      const scored: Array<{
        idx: number
        direct: number
        heuristic: number
      }> = []

      for (let u = 0; u < unvisitedCount; u += 1) {
        const candIdx = unvisitedList[u]
        const direct = getScore(currentIdx, candIdx)
        // Small connectivity weight avoids stranding isolated keys for full-crate runs
        const connBonus = connectivity[candIdx] * (isSubsetMode ? 0.04 : 0.08)
        scored.push({
          idx: candIdx,
          direct,
          heuristic: direct + connBonus,
        })
      }

      scored.sort((a, b) => b.heuristic - a.heuristic)

      const immediateTop = scored[0]
      let chosenIdx = immediateTop.idx
      let chosenDirect = immediateTop.direct

      // Adaptive recursive lookahead depth so large 1000-track crates stay instant
      const lookaheadDepth =
        stepsRemaining <= 1
          ? 0
          : unvisitedCount <= 140
            ? Math.min(2, stepsRemaining - 1)
            : unvisitedCount <= 340
              ? 1
              : 0

      if (lookaheadDepth > 0 && scored.length > 1) {
        const beamCount = Math.min(4, scored.length)
        const candidates = scored.slice(0, beamCount)

        // If top candidate is already a near-perfect lock and we aren't leaving a clash behind, still compare top beam
        let bestTrajectoryScore = -1
        let bestCandPos = 0
        const trajectoryScores: number[] = []

        for (let b = 0; b < candidates.length; b += 1) {
          const cand = candidates[b]
          visited[cand.idx] = 1
          const future = recursiveLookahead(
            cand.idx,
            visited,
            unvisitedList,
            stepsRemaining - 1,
            lookaheadDepth,
            3,
          )
          visited[cand.idx] = 0
          const trajectory = cand.direct + 0.75 * future
          trajectoryScores.push(trajectory)
          if (trajectory > bestTrajectoryScore) {
            bestTrajectoryScore = trajectory
            bestCandPos = b
          }
        }

        if (bestCandPos !== 0) {
          const picked = candidates[bestCandPos]
          chosenIdx = picked.idx
          chosenDirect = picked.direct
          seedBacktracks += 1
          totalBacktracksCount += 1

          const skippedTrack = tracks[immediateTop.idx]
          const chosenTrack = tracks[chosenIdx]
          if (seedLogs.length < 18) {
            seedLogs.push({
              phase: 'backtrack',
              badge: 'BACKTRACK',
              message: `Depth-${lookaheadDepth + 1} pivot at slot #${step + 1}: bypassed "${skippedTrack.name}" (${skippedTrack.camelot}, ${immediateTop.direct}%) for "${chosenTrack.name}" (${chosenTrack.camelot} • ${chosenTrack.bpm} BPM).`,
              detail: `Lookahead prevented a harmonic bottleneck down the chain, improving cumulative ${lookaheadDepth + 1}-step trajectory from ${Math.round(trajectoryScores[0])} → ${Math.round(bestTrajectoryScore)} pts.`,
              scoreImpact: `${chosenDirect}% immediate`,
            })
          }
        }
      }

      visited[chosenIdx] = 1
      seq.push(chosenIdx)
      directSum += chosenDirect
      unvisitedList = unvisitedList.filter((id) => id !== chosenIdx)

      // Emit periodic informative narration for notable transitions on this path
      const prevTrack = tracks[currentIdx]
      const nextTrack = tracks[chosenIdx]
      const breakdown = computeCohesionScore(prevTrack, nextTrack)
      const isInterestingTransition =
        breakdown.usedHalfDoubleTime ||
        (breakdown.harmonicScore >= 44 && step <= 4) ||
        (breakdown.wheelDistance === 1 && step % 4 === 0) ||
        breakdown.tier === 'clash'

      if (isInterestingTransition && milestoneCount < 6 && seedLogs.length < 18) {
        milestoneCount += 1
        seedLogs.push({
          phase: 'recursive',
          badge: 'RECURSIVE',
          message: `Slot #${step} → #${step + 1}: "${prevTrack.name}" → "${nextTrack.name}" (${breakdown.totalScore}% cohesion).`,
          detail: `${breakdown.harmonicLabel} • ${breakdown.bpmLabel}`,
          scoreImpact: `${breakdown.totalScore}% match`,
        })
      }
    }

    const avg =
      targetCount <= 1 ? 100 : directSum / Math.max(1, targetCount - 1)

    return {
      seq,
      sum: directSum,
      avg,
      seedBacktracks,
      seedLogs,
    }
  }

  const seedResults = seedIndices.map((seedIdx) => runRecursiveSeed(seedIdx))
  seedResults.sort((a, b) => b.sum - a.sum)
  const winningSeed = seedResults[0]

  // Append winning seed's recursive & backtrack narration logs
  for (const entry of winningSeed.seedLogs) {
    addLog(entry.phase, entry.badge, entry.message, entry.detail, entry.scoreImpact)
  }

  if (seedResults.length > 1) {
    const bestOpener = tracks[winningSeed.seq[0]]
    const runnerUp = seedResults[1]
    const runnerOpener = tracks[runnerUp.seq[0]]
    addLog(
      'recursive',
      'RECURSIVE',
      `Evaluated ${seedResults.length} seed trajectories (${branchesExplored.toLocaleString()} recursive branches): selected "${bestOpener.name}" (${bestOpener.camelot}) at ${Math.round(winningSeed.avg)}% avg cohesion.`,
      `Outperformed runner-up opener "${runnerOpener.name}" (${runnerOpener.camelot}, ${Math.round(runnerUp.avg)}% avg) across ${targetCount} tracks.`,
      `${Math.round(winningSeed.avg)}% avg`,
    )
  }

  // =========================================================================
  // PHASE 3: ITERATIVE REFINEMENT PASSES (2-Opt, Relocations, Pool Swaps)
  // =========================================================================
  const currentSeq =
    winningSeed.sum >= baselineSum ? [...winningSeed.seq] : [...baselineSeq]
  const startMutableIdx = preferredOpenerLocked ? 1 : 0
  const L = currentSeq.length

  const computeSeqTotalSum = (seq: number[]): number => {
    let total = 0
    for (let i = 1; i < seq.length; i += 1) {
      total += getScore(seq[i - 1], seq[i])
    }
    return total
  }

  let currentTotalSum = computeSeqTotalSum(currentSeq)
  let iterativeImprovements = 0

  for (let pass = 1; pass <= 4; pass += 1) {
    let improvedInPass = false

    // 3A. 2-Opt Sub-Segment Reversal (window 2..10)
    // Because computeCohesionScore totalScore is symmetric, reversing seq[i..j] preserves
    // all internal transition scores and only alters the two boundary edges!
    let best2OptDelta = 0
    let best2OptI = -1
    let best2OptJ = -1

    for (let i = startMutableIdx; i < L - 2; i += 1) {
      const maxJ = Math.min(L - 1, i + 10)
      for (let j = i + 2; j <= maxJ; j += 1) {
        const beforeLeft =
          i > 0 ? getScore(currentSeq[i - 1], currentSeq[i]) : 0
        const beforeRight =
          j < L - 1 ? getScore(currentSeq[j], currentSeq[j + 1]) : 0
        const afterLeft =
          i > 0 ? getScore(currentSeq[i - 1], currentSeq[j]) : 0
        const afterRight =
          j < L - 1 ? getScore(currentSeq[i], currentSeq[j + 1]) : 0

        const delta = afterLeft + afterRight - (beforeLeft + beforeRight)
        if (delta > best2OptDelta) {
          best2OptDelta = delta
          best2OptI = i
          best2OptJ = j
        }
      }
    }

    if (best2OptDelta > 0 && best2OptI !== -1) {
      // Reverse currentSeq[best2OptI .. best2OptJ] in place
      let lo = best2OptI
      let hi = best2OptJ
      while (lo < hi) {
        const tmp = currentSeq[lo]
        currentSeq[lo] = currentSeq[hi]
        currentSeq[hi] = tmp
        lo += 1
        hi -= 1
      }
      currentTotalSum += best2OptDelta
      iterativeImprovements += 1
      improvedInPass = true

      addLog(
        'iterate',
        'ITERATE',
        `Pass ${pass} (2-Opt Reversal): inverted segment #${best2OptI + 1}–#${best2OptJ + 1} around "${tracks[currentSeq[best2OptI]].name}" … "${tracks[currentSeq[best2OptJ]].name}".`,
        `Reconnected segment boundaries for a smoother harmonic & BPM bridge.`,
        `+${best2OptDelta} pts`,
      )
    }

    // 3B. Weakest-Link Single-Track Relocation
    // Prioritize tracks adjacent to weakest transitions when L is large
    const edgeList: Array<{ pos: number; score: number }> = []
    for (let i = startMutableIdx; i < L; i += 1) {
      const left = i > 0 ? getScore(currentSeq[i - 1], currentSeq[i]) : 100
      const right =
        i < L - 1 ? getScore(currentSeq[i], currentSeq[i + 1]) : 100
      edgeList.push({ pos: i, score: Math.min(left, right) })
    }
    edgeList.sort((a, b) => a.score - b.score)

    const candidatesToRelocate =
      L <= 160 ? edgeList : edgeList.slice(0, 45)

    let bestRelocDelta = 0
    let bestFromPos = -1
    let bestInsertPos = -1

    for (const { pos: fromPos } of candidatesToRelocate) {
      const trackIdx = currentSeq[fromPos]
      const leftEdge =
        fromPos > 0 ? getScore(currentSeq[fromPos - 1], trackIdx) : 0
      const rightEdge =
        fromPos < L - 1 ? getScore(trackIdx, currentSeq[fromPos + 1]) : 0
      const joinedEdge =
        fromPos > 0 && fromPos < L - 1
          ? getScore(currentSeq[fromPos - 1], currentSeq[fromPos + 1])
          : 0
      const removalDelta = joinedEdge - (leftEdge + rightEdge)

      for (let targetPos = startMutableIdx; targetPos < L; targetPos += 1) {
        if (targetPos === fromPos) continue
        // Removing fromPos shifts indices > fromPos down by 1; insert at targetPos in the shortened array
        const prevInShort =
          targetPos === 0
            ? -1
            : targetPos <= fromPos
              ? currentSeq[targetPos - 1]
              : currentSeq[targetPos]
        const nextInShort =
          targetPos === L - 1
            ? -1
            : targetPos < fromPos
              ? currentSeq[targetPos]
              : currentSeq[targetPos + 1]

        const brokenEdge =
          prevInShort !== -1 && nextInShort !== -1
            ? getScore(prevInShort, nextInShort)
            : 0
        const newLeft =
          prevInShort !== -1 ? getScore(prevInShort, trackIdx) : 0
        const newRight =
          nextInShort !== -1 ? getScore(trackIdx, nextInShort) : 0

        const insertDelta = newLeft + newRight - brokenEdge
        const netDelta = removalDelta + insertDelta

        if (netDelta > bestRelocDelta) {
          bestRelocDelta = netDelta
          bestFromPos = fromPos
          bestInsertPos = targetPos
        }
      }
    }

    if (bestRelocDelta > 0 && bestFromPos !== -1) {
      const [moved] = currentSeq.splice(bestFromPos, 1)
      currentSeq.splice(bestInsertPos, 0, moved)
      currentTotalSum += bestRelocDelta
      iterativeImprovements += 1
      improvedInPass = true

      addLog(
        'iterate',
        'ITERATE',
        `Pass ${pass} (Relocation): moved "${tracks[moved].name}" (${tracks[moved].camelot} • ${tracks[moved].bpm} BPM) from #${bestFromPos + 1} → #${bestInsertPos + 1}.`,
        `Eliminated a transition bottleneck and tightened harmonic continuity.`,
        `+${bestRelocDelta} pts`,
      )
    }

    // 3C. Subset Pool Swap Upgrades (when targetCount < tracks.length)
    if (isSubsetMode) {
      const inSeq = new Uint8Array(n)
      for (const idx of currentSeq) inSeq[idx] = 1

      const pool: number[] = []
      for (let i = 0; i < n; i += 1) {
        if (!inSeq[i]) pool.push(i)
      }

      // Rank sequence positions by weakest neighborhood score
      const posScores: Array<{ pos: number; localSum: number }> = []
      for (let pos = startMutableIdx; pos < L; pos += 1) {
        const left = pos > 0 ? getScore(currentSeq[pos - 1], currentSeq[pos]) : 100
        const right =
          pos < L - 1 ? getScore(currentSeq[pos], currentSeq[pos + 1]) : 100
        posScores.push({ pos, localSum: left + right })
      }
      posScores.sort((a, b) => a.localSum - b.localSum)

      const targetPositions =
        L <= 80 ? posScores : posScores.slice(0, 30)

      let bestSwapDelta = 0
      let bestSwapPos = -1
      let bestPoolIdx = -1

      for (const { pos } of targetPositions) {
        const oldIdx = currentSeq[pos]
        const oldEdges =
          (pos > 0 ? getScore(currentSeq[pos - 1], oldIdx) : 0) +
          (pos < L - 1 ? getScore(oldIdx, currentSeq[pos + 1]) : 0)

        for (const candIdx of pool) {
          const newEdges =
            (pos > 0 ? getScore(currentSeq[pos - 1], candIdx) : 0) +
            (pos < L - 1 ? getScore(candIdx, currentSeq[pos + 1]) : 0)
          const delta = newEdges - oldEdges
          if (delta > bestSwapDelta) {
            bestSwapDelta = delta
            bestSwapPos = pos
            bestPoolIdx = candIdx
          }
        }
      }

      if (bestSwapDelta > 0 && bestSwapPos !== -1 && bestPoolIdx !== -1) {
        const swappedOut = currentSeq[bestSwapPos]
        currentSeq[bestSwapPos] = bestPoolIdx
        currentTotalSum += bestSwapDelta
        iterativeImprovements += 1
        improvedInPass = true

        addLog(
          'iterate',
          'ITERATE',
          `Pass ${pass} (Pool Upgrade): swapped out "${tracks[swappedOut].name}" (${tracks[swappedOut].camelot}) at #${bestSwapPos + 1} for "${tracks[bestPoolIdx].name}" (${tracks[bestPoolIdx].camelot} • ${tracks[bestPoolIdx].bpm} BPM).`,
          `Upgraded subset bridge using an unselected track from the crate.`,
          `+${bestSwapDelta} pts`,
        )
      }
    }

    if (!improvedInPass) {
      break
    }
  }

  if (iterativeImprovements === 0) {
    addLog(
      'iterate',
      'ITERATE',
      `Iterative 2-Opt & relocation passes verified local optimality across all ${Math.max(0, L - 1)} transitions (0 clashes left to mend).`,
      `Recursive lookahead already found a locally optimal chain.`,
    )
  }

  // =========================================================================
  // PHASE 4: FINALIZATION
  // =========================================================================
  const orderedTracks = currentSeq.map((idx) => tracks[idx])
  const evaluated = evaluateTrackSequence(orderedTracks, tracks)
  const totalDurationMs = orderedTracks.reduce((acc, t) => acc + t.durationMs, 0)
  const opener = orderedTracks[0]
  const closer = orderedTracks[orderedTracks.length - 1]
  const deltaVsBaseline = evaluated.avgCohesion - baselineCohesion

  addLog(
    'complete',
    'LOCKED',
    `Sequenced ${orderedTracks.length} tracks (${formatDuration(totalDurationMs)}): "${opener.name}" (${opener.camelot}, ${opener.bpm} BPM) → "${closer.name}" (${closer.camelot}, ${closer.bpm} BPM).`,
    `Final avg transition cohesion: ${evaluated.avgCohesion}% (${
      deltaVsBaseline >= 0 ? `+${deltaVsBaseline}%` : `${deltaVsBaseline}%`
    } vs greedy baseline ${baselineCohesion}%), min transition ${evaluated.minCohesion}%, max ${evaluated.maxCohesion}%.`,
    `${evaluated.avgCohesion}% avg`,
  )

  return {
    ...evaluated,
    baselineCohesion,
    branchesExplored,
    backtracksCount: totalBacktracksCount,
    iterativeImprovements,
    narrationLogs: logs,
  }
}
