import type { LoadingProgress, LoadingStageId } from '../types/spotify'

interface LoadingViewProps {
  progress: LoadingProgress
  onCancel?: () => void
}

const STAGES: { id: LoadingStageId; label: string; icon: string }[] = [
  { id: 'profile', label: 'Spotify Profile', icon: '👤' },
  { id: 'liked_songs', label: 'Liked Songs Library', icon: '💚' },
  { id: 'top_tracks', label: 'Top Tracks Rotation', icon: '🔥' },
  { id: 'album_hydration', label: 'Album Tracklists', icon: '💿' },
  { id: 'scoring', label: 'Ranking & Bayesian Score', icon: '🏆' },
]

export function LoadingView({ progress, onCancel }: LoadingViewProps) {
  const activeIdx = STAGES.findIndex((s) => s.id === progress.stage)

  return (
    <div className="loadingContainer">
      <div className="card loadingCard">
        <div className="loadingHeader">
          <div className="vinylSpinner" aria-hidden="true">
            <div className="vinylGroove" />
            <div className="vinylCenter" />
          </div>
          <div>
            <div className="heroBadge">ANALYZING YOUR SPOTIFY LIBRARY</div>
            <h2 className="loadingTitle">{progress.stageLabel}</h2>
            <p className="muted">{progress.detail}</p>
          </div>
        </div>

        <div className="progressRow" style={{ marginTop: 22 }}>
          <div className="progressBar large">
            <div
              className="progressFill animated"
              style={{ width: `${Math.max(4, progress.percent)}%` }}
            />
          </div>
          <div className="progressStatsRow">
            <span>{progress.percent}% complete</span>
            <span>
              {progress.likedTotal > 0
                ? `${progress.likedFetched.toLocaleString()} / ${progress.likedTotal.toLocaleString()} liked songs`
                : 'Initializing…'}
            </span>
          </div>
        </div>

        <div className="stageSteps">
          {STAGES.map((stage, idx) => {
            const state =
              idx < activeIdx
                ? 'done'
                : idx === activeIdx
                  ? 'active'
                  : 'pending'
            return (
              <div key={stage.id} className={`stageStep ${state}`}>
                <span className="stageIcon">
                  {state === 'done' ? '✓' : stage.icon}
                </span>
                <span className="stageName">{stage.label}</span>
              </div>
            )
          })}
        </div>

        <div className="loadingCounters">
          <div className="counterBox">
            <div className="counterValue">
              {progress.likedFetched.toLocaleString()}
            </div>
            <div className="counterLabel">Liked Songs Scanned</div>
          </div>
          <div className="counterBox">
            <div className="counterValue">
              {progress.albumsHydrated.toLocaleString()}
              {progress.albumsTotal > 0
                ? ` / ${progress.albumsTotal.toLocaleString()}`
                : ''}
            </div>
            <div className="counterLabel">Full Album Tracklists Hydrated</div>
          </div>
        </div>

        {progress.recentItems.length > 0 && (
          <div className="liveTicker">
            <div className="tickerTitle">LIVE STREAMING LOG</div>
            <ul className="tickerList">
              {progress.recentItems.map((item, i) => (
                <li key={`${i}-${item}`} className={i === 0 ? 'latest' : ''}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {onCancel && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="button secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
