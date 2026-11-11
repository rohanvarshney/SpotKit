import type { ProcessorProgress } from '../../lib/spotify/types'

type Props = {
  progress: ProcessorProgress | null
  onCancel: () => void
}

export function ProcessingScreen({ progress, onCancel }: Props) {
  const processedFiles =
    progress !== null && progress.stage !== 'done' && typeof progress.processedFiles === 'number'
      ? progress.processedFiles
      : null
  const totalFiles =
    progress !== null && progress.stage !== 'done' && typeof progress.totalFiles === 'number' ? progress.totalFiles : null
  const hasFileProgress = processedFiles !== null && totalFiles !== null

  return (
    <section className="card">
      <h1>Processing…</h1>
      <p className="muted">{progress?.message ?? 'Working…'}</p>
      {hasFileProgress && (
        <div className="progressRow">
          <div className="progressBar">
            <div
              className="progressFill"
              style={{
                width: `${Math.round((processedFiles / Math.max(1, totalFiles)) * 100)}%`,
              }}
            />
          </div>
          <div className="progressMeta">
            {processedFiles}/{totalFiles} files
          </div>
        </div>
      )}
      <div className="row">
        <button className="button secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  )
}

