import { Fragment, useMemo, useState } from 'react'
import { DEFAULT_WEIGHTS, scoreAndFilterAlbums } from '../lib/albumScorer'
import type {
  FilterAndSortOptions,
  RankingMode,
  RawLibraryDataset,
  ScoredAlbum,
  ScoringWeights,
} from '../types/spotify'

interface DashboardViewProps {
  dataset: RawLibraryDataset
  onLogout: () => void
  onConnectRealSpotify: () => void
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDateShort(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const RANGE_LABELS: Record<string, string> = {
  short_term: '4w',
  medium_term: '6m',
  long_term: 'All-time',
}

interface InfoTooltipProps {
  title: string
  body: string
}

function InfoTooltip({ title, body }: InfoTooltipProps) {
  return (
    <span className="infoTooltipWrap" tabIndex={0} aria-label={`${title}: ${body}`}>
      <span className="infoIcon" aria-hidden="true">
        i
      </span>
      <span className="infoPopover" role="tooltip">
        <strong className="infoPopoverTitle">{title}</strong>
        <span className="infoPopoverBody">{body}</span>
      </span>
    </span>
  )
}

export function DashboardView({
  dataset,
  onLogout,
  onConnectRealSpotify,
}: DashboardViewProps) {
  const [rankingMode, setRankingMode] = useState<RankingMode>('weighted')
  const [customWeights, setCustomWeights] =
    useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [minTotalTracks, setMinTotalTracks] = useState<number>(5)
  const [minLikedTracks, setMinLikedTracks] = useState<number>(2)
  const [fullAlbumsOnly, setFullAlbumsOnly] = useState<boolean>(true)
  const [deduplicateEditions, setDeduplicateEditions] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid')
  const [expandedAlbumKey, setExpandedAlbumKey] = useState<string | null>(null)
  const [trackFilter, setTrackFilter] = useState<'all' | 'liked' | 'missing'>(
    'all',
  )

  const options: FilterAndSortOptions = useMemo(
    () => ({
      rankingMode,
      customWeights,
      minTotalTracks,
      minLikedTracks,
      fullAlbumsOnly,
      deduplicateEditions,
      searchQuery,
    }),
    [
      rankingMode,
      customWeights,
      minTotalTracks,
      minLikedTracks,
      fullAlbumsOnly,
      deduplicateEditions,
      searchQuery,
    ],
  )

  const scoredAlbums = useMemo(
    () => scoreAndFilterAlbums(dataset, options),
    [dataset, options],
  )

  const noSkipCount = useMemo(
    () => scoredAlbums.filter((a) => a.proportionLiked >= 0.8).length,
    [scoredAlbums],
  )

  const topBoostedCount = useMemo(
    () => scoredAlbums.filter((a) => a.topTracksCount > 0).length,
    [scoredAlbums],
  )

  const handleWeightChange = (key: keyof ScoringWeights, val: number) => {
    setCustomWeights((prev) => ({
      ...prev,
      [key]: val,
    }))
  }

  const toggleExpandAlbum = (albumKey: string) => {
    if (expandedAlbumKey === albumKey) {
      setExpandedAlbumKey(null)
    } else {
      setExpandedAlbumKey(albumKey)
      setTrackFilter('all')
    }
  }

  return (
    <div className="dashboardWrap">
      {/* Top User & Summary Header */}
      <div className="card dashTopCard">
        <div className="dashHeader">
          <div>
            <div className="userBadgeRow">
              <span className="heroBadge">
                {dataset.isDemo ? 'DEMO MODE' : 'SPOTIFY CONNECTED'}
              </span>
              <span className="userName">
                {dataset.user.display_name || dataset.user.id}
              </span>
            </div>
            <h2 className="dashTitle">Your Top Albums by Liked Songs</h2>
            <p className="muted">
              Ranked by proportion of liked tracks, album depth, and your most
              played Spotify Top Tracks. Click any album to inspect liked vs.
              unliked songs.
            </p>
          </div>
          <div className="dashActions">
            {dataset.isDemo && (
              <button
                type="button"
                className="button spotifyBtn small"
                onClick={onConnectRealSpotify}
              >
                Connect Real Spotify
              </button>
            )}
            <button
              type="button"
              className="button secondary small"
              onClick={onLogout}
            >
              {dataset.isDemo ? 'Back to Login' : 'Disconnect'}
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="kpiGrid">
          <div className="kpiCard">
            <div className="kpiValue">
              {dataset.savedTracks.length.toLocaleString()}
            </div>
            <div className="kpiLabel">Liked Songs Indexed</div>
          </div>
          <div className="kpiCard">
            <div className="kpiValue">{scoredAlbums.length}</div>
            <div className="kpiLabel">
              Qualifying Albums
              <InfoTooltip
                title="Qualifying Albums"
                body="Distinct albums in your Liked Songs that meet your current Minimum Album Length, Minimum Liked Songs, and Full Albums Only filters."
              />
            </div>
          </div>
          <div className="kpiCard">
            <div className="kpiValue accentGreen">{noSkipCount}</div>
            <div className="kpiLabel">
              “No-Skip” Albums (≥80% Liked)
              <InfoTooltip
                title="No-Skip Albums"
                body="Albums where you have liked at least 80% of the entire tracklist—indicating records you love almost cover-to-cover."
              />
            </div>
          </div>
          <div className="kpiCard">
            <div className="kpiValue accentPurple">{topBoostedCount}</div>
            <div className="kpiLabel">
              Albums w/ Your Top 50 Tracks
              <InfoTooltip
                title="Spotify Top 50 Tracks Boost"
                body="We fetch your Top 50 most-streamed songs from Spotify (/v1/me/top/tracks) across 3 windows: Last 4 Weeks, Last 6 Months, and All-Time. Albums containing these heavy-rotation tracks receive a ranking boost based on the song's rank (#1–#50) and how many time ranges it appears in."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Filter Bar */}
      <div className="card controlsCard">
        <div className="controlsTopRow">
          <div className="controlGroup">
            <span className="controlHeading">
              Ranking Formula
              <InfoTooltip
                title="How Ranking Works"
                body="Weighted Score combines Bayesian-smoothed % Liked (52%), Liked Song Volume (22%), Top 50 Tracks Boost (14%), Track Popularity (7%), and Recency of Likes (5%) so 1-track singles don't beat full albums."
              />
            </span>
            <div className="segmented">
              <button
                type="button"
                className={`segBtn ${rankingMode === 'weighted' ? 'active' : ''}`}
                onClick={() => setRankingMode('weighted')}
              >
                Weighted Score
              </button>
              <button
                type="button"
                className={`segBtn ${rankingMode === 'proportion' ? 'active' : ''}`}
                onClick={() => setRankingMode('proportion')}
              >
                Pure % Liked
              </button>
              <button
                type="button"
                className={`segBtn ${rankingMode === 'count' ? 'active' : ''}`}
                onClick={() => setRankingMode('count')}
              >
                # of Liked Songs
              </button>
              <button
                type="button"
                className={`segBtn ${rankingMode === 'custom' ? 'active' : ''}`}
                onClick={() => setRankingMode('custom')}
              >
                Custom Formula ⚙
              </button>
            </div>
          </div>

          <div className="controlGroup">
            <span className="controlHeading">View Layout</span>
            <div className="segmented">
              <button
                type="button"
                className={`segBtn ${viewLayout === 'grid' ? 'active' : ''}`}
                onClick={() => setViewLayout('grid')}
              >
                ⊞ Grid Cards
              </button>
              <button
                type="button"
                className={`segBtn ${viewLayout === 'list' ? 'active' : ''}`}
                onClick={() => setViewLayout('list')}
              >
                ☰ Ranking Table
              </button>
            </div>
          </div>
        </div>

        {rankingMode === 'custom' && (
          <div className="customWeightsDrawer">
            <div className="weightsHeader">
              <strong>Custom Scoring Formula Weights</strong>
              <button
                type="button"
                className="textLinkBtn"
                onClick={() => setCustomWeights(DEFAULT_WEIGHTS)}
              >
                Reset to Recommended Defaults
              </button>
            </div>
            <div className="slidersGrid">
              <label className="sliderLabel">
                <span>
                  Bayesian % Liked:{' '}
                  <strong>{customWeights.proportionWeight}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={customWeights.proportionWeight}
                  onChange={(e) =>
                    handleWeightChange(
                      'proportionWeight',
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <label className="sliderLabel">
                <span>
                  Liked Song Volume:{' '}
                  <strong>{customWeights.volumeWeight}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={customWeights.volumeWeight}
                  onChange={(e) =>
                    handleWeightChange('volumeWeight', Number(e.target.value))
                  }
                />
              </label>
              <label className="sliderLabel">
                <span>
                  Top 50 Tracks Boost:{' '}
                  <strong>{customWeights.topTracksWeight}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={customWeights.topTracksWeight}
                  onChange={(e) =>
                    handleWeightChange(
                      'topTracksWeight',
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <label className="sliderLabel">
                <span>
                  Track Popularity:{' '}
                  <strong>{customWeights.popularityWeight}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={customWeights.popularityWeight}
                  onChange={(e) =>
                    handleWeightChange(
                      'popularityWeight',
                      Number(e.target.value),
                    )
                  }
                />
              </label>
              <label className="sliderLabel">
                <span>
                  Recency of Likes:{' '}
                  <strong>{customWeights.recencyWeight}</strong>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={customWeights.recencyWeight}
                  onChange={(e) =>
                    handleWeightChange('recencyWeight', Number(e.target.value))
                  }
                />
              </label>
            </div>
          </div>
        )}

        <div className="filtersRow">
          <label className="sliderFilter">
            <span>
              Min Album Length: <strong>{minTotalTracks} tracks</strong>
            </span>
            <input
              type="range"
              min={1}
              max={12}
              value={minTotalTracks}
              onChange={(e) => setMinTotalTracks(Number(e.target.value))}
            />
          </label>

          <label className="sliderFilter">
            <span>
              Min Liked on Album: <strong>{minLikedTracks} songs</strong>
            </span>
            <input
              type="range"
              min={1}
              max={10}
              value={minLikedTracks}
              onChange={(e) => setMinLikedTracks(Number(e.target.value))}
            />
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={fullAlbumsOnly}
              onChange={(e) => setFullAlbumsOnly(e.target.checked)}
            />
            <span>Full Albums Only (exclude Singles/EPs)</span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={deduplicateEditions}
              onChange={(e) => setDeduplicateEditions(e.target.checked)}
            />
            <span>Merge Deluxe &amp; Remastered Editions</span>
          </label>

          <input
            type="search"
            className="input searchBox"
            placeholder="Filter by album or artist…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Results Area */}
      {scoredAlbums.length === 0 ? (
        <div className="card emptyState">
          <h3>No albums match your current filters</h3>
          <p className="muted">
            Try lowering the minimum track threshold or clearing your search
            query.
          </p>
        </div>
      ) : viewLayout === 'grid' ? (
        <div className="albumsGridCards">
          {scoredAlbums.map((album, idx) => (
            <AlbumGridCard
              key={album.key}
              album={album}
              rank={idx + 1}
              isExpanded={expandedAlbumKey === album.key}
              onToggleExpand={() => toggleExpandAlbum(album.key)}
              trackFilter={trackFilter}
              onChangeTrackFilter={setTrackFilter}
            />
          ))}
        </div>
      ) : (
        <div className="card tableCard">
          <div className="tableWrap">
            <table className="rankingTable">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Rank</th>
                  <th>Album</th>
                  <th>Artist</th>
                  <th>Year</th>
                  <th>Liked / Total</th>
                  <th style={{ minWidth: 150 }}>% Liked</th>
                  <th>
                    Top 50 Hits
                    <InfoTooltip
                      title="Top 50 Hits on Album"
                      body="Number of songs on this album that appear in your Spotify Top 50 most-played tracks (4-week, 6-month, or all-time)."
                    />
                  </th>
                  <th>Avg Pop.</th>
                  <th>Score</th>
                  <th style={{ textAlign: 'right' }}>Tracklist</th>
                </tr>
              </thead>
              <tbody>
                {scoredAlbums.map((album, idx) => {
                  const isExpanded = expandedAlbumKey === album.key
                  const pct = Math.round(album.proportionLiked * 100)
                  const rank = idx + 1
                  return (
                    <Fragment key={album.key}>
                      <tr
                        className={`rankingRow ${isExpanded ? 'expandedRow' : ''}`}
                        onClick={() => toggleExpandAlbum(album.key)}
                      >
                        <td>
                          <span
                            className={`tableRankBadge ${rank <= 3 ? `top${rank}` : ''}`}
                          >
                            #{rank}
                          </span>
                        </td>
                        <td>
                          <div className="tableAlbumCell">
                            {album.coverUrl ? (
                              <img
                                src={album.coverUrl}
                                alt={album.name}
                                className="tableThumb"
                                loading="lazy"
                              />
                            ) : (
                              <div className="tableThumbFallback">💿</div>
                            )}
                            <div>
                              <div className="tableAlbumTitle">{album.name}</div>
                              {album.mergedEditionNames.length > 1 && (
                                <span className="tableMiniMerged">
                                  ✨ {album.mergedEditionNames.length} editions
                                  merged
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="tableArtistCell">
                          {album.artists.map((a) => a.name).join(', ')}
                        </td>
                        <td className="monoCell">{album.releaseYear}</td>
                        <td className="monoCell">
                          <strong>{album.likedCount}</strong> /{' '}
                          {album.totalTracks}
                        </td>
                        <td>
                          <div className="tablePctCell">
                            <span className="tablePctVal">{pct}%</span>
                            <div className="progressBar tableMiniBar">
                              <div
                                className="progressFill"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          {album.topTracksCount > 0 ? (
                            <span className="metaBadge flame">
                              🔥 {album.topTracksCount}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="monoCell">
                          {Math.round(album.averagePopularity)}
                        </td>
                        <td>
                          <span className="scorePill">
                            {album.finalScore.toFixed(1)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="tableExpandBtn"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpandAlbum(album.key)
                            }}
                          >
                            {isExpanded ? '▴ Hide' : '▾ Tracks'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="tableDrawerRow">
                          <td colSpan={10} style={{ padding: 0 }}>
                            <TracklistDrawerContent
                              album={album}
                              trackFilter={trackFilter}
                              onChangeTrackFilter={setTrackFilter}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

interface AlbumGridCardProps {
  album: ScoredAlbum
  rank: number
  isExpanded: boolean
  onToggleExpand: () => void
  trackFilter: 'all' | 'liked' | 'missing'
  onChangeTrackFilter: (f: 'all' | 'liked' | 'missing') => void
}

function AlbumGridCard({
  album,
  rank,
  isExpanded,
  onToggleExpand,
  trackFilter,
  onChangeTrackFilter,
}: AlbumGridCardProps) {
  const pct = Math.round(album.proportionLiked * 100)
  const unlikedCount = Math.max(0, album.totalTracks - album.likedCount)

  return (
    <div className={`gridAlbumCard ${isExpanded ? 'expanded' : ''}`}>
      <div className="gridCardClickArea" onClick={onToggleExpand}>
        <div className="gridCoverContainer">
          {album.coverUrl ? (
            <img
              src={album.coverUrl}
              alt={album.name}
              className="gridAlbumCover"
              loading="lazy"
            />
          ) : (
            <div className="gridAlbumFallback">💿</div>
          )}
          <span className={`gridRankBadge ${rank <= 3 ? `top${rank}` : ''}`}>
            #{rank}
          </span>
          <span
            className="gridScoreOverlay"
            title="Composite Album Ranking Score"
          >
            {album.finalScore.toFixed(1)} pts
          </span>
        </div>

        <div className="gridCardBody">
          <h3 className="gridAlbumTitle" title={album.name}>
            {album.name}
          </h3>
          <div className="gridAlbumSub">
            <span>{album.artists.map((a) => a.name).join(', ')}</span>
            <span className="dot">•</span>
            <span>{album.releaseYear}</span>
          </div>

          <div className="completionBlock">
            <div className="completionLabels">
              <span className="completionPrimary">
                <strong>{pct}%</strong> ({album.likedCount}/{album.totalTracks}{' '}
                liked)
              </span>
              {unlikedCount === 0 ? (
                <span className="perfectBadge">★ No-Skip</span>
              ) : (
                <span className="missingHint">{unlikedCount} left</span>
              )}
            </div>
            <div className="progressBar">
              <div
                className="progressFill"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>

          <div className="metaBadges">
            {album.topTracksCount > 0 && (
              <span className="metaBadge flame">
                🔥 {album.topTracksCount} Top{' '}
                {album.topTracksCount === 1 ? 'Track' : 'Tracks'}
              </span>
            )}
            {album.mergedEditionNames.length > 1 && (
              <span
                className="metaBadge merged"
                title={`Merged editions: ${album.mergedEditionNames.join(' + ')}`}
              >
                ✨ Deluxe Merged
              </span>
            )}
            <span className="expandToggleLabel">
              {isExpanded ? '▴ Hide' : '▾ Tracklist'}
            </span>
          </div>
        </div>
      </div>

      {isExpanded && (
        <TracklistDrawerContent
          album={album}
          trackFilter={trackFilter}
          onChangeTrackFilter={onChangeTrackFilter}
        />
      )}
    </div>
  )
}

interface TracklistDrawerContentProps {
  album: ScoredAlbum
  trackFilter: 'all' | 'liked' | 'missing'
  onChangeTrackFilter: (f: 'all' | 'liked' | 'missing') => void
}

function TracklistDrawerContent({
  album,
  trackFilter,
  onChangeTrackFilter,
}: TracklistDrawerContentProps) {
  const unlikedCount = Math.max(0, album.totalTracks - album.likedCount)
  const filteredTracks = useMemo(() => {
    if (trackFilter === 'liked') return album.tracks.filter((t) => t.isLiked)
    if (trackFilter === 'missing') return album.tracks.filter((t) => !t.isLiked)
    return album.tracks
  }, [album.tracks, trackFilter])

  return (
    <div className="tracklistDrawer">
      <div className="breakdownStrip">
        <div className="breakdownItem">
          <span className="breakdownLabel">Bayesian %</span>
          <strong>
            {Math.round(album.scoreBreakdown.proportionComponent)}
          </strong>
        </div>
        <div className="breakdownItem">
          <span className="breakdownLabel">Volume</span>
          <strong>{Math.round(album.scoreBreakdown.volumeComponent)}</strong>
        </div>
        <div className="breakdownItem">
          <span className="breakdownLabel">Top 50 Boost</span>
          <strong>{Math.round(album.scoreBreakdown.topTracksComponent)}</strong>
        </div>
        <div className="breakdownItem">
          <span className="breakdownLabel">Avg Popularity</span>
          <strong>
            {Math.round(album.scoreBreakdown.popularityComponent)}
          </strong>
        </div>
        <div className="breakdownItem">
          <span className="breakdownLabel">Recency</span>
          <strong>{Math.round(album.scoreBreakdown.recencyComponent)}</strong>
        </div>
        <a
          href={album.spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className="spotifyExternalLink"
        >
          Open Album in Spotify ↗
        </a>
      </div>

      {album.mergedEditionNames.length > 1 && (
        <div className="mergedNotice">
          Merged editions: {album.mergedEditionNames.join(' • ')}
        </div>
      )}

      <div className="trackFilterBar">
        <div className="segmented small">
          <button
            type="button"
            className={`segBtn ${trackFilter === 'all' ? 'active' : ''}`}
            onClick={() => onChangeTrackFilter('all')}
          >
            All Tracks ({album.tracks.length})
          </button>
          <button
            type="button"
            className={`segBtn ${trackFilter === 'liked' ? 'active' : ''}`}
            onClick={() => onChangeTrackFilter('liked')}
          >
            💚 Liked ({album.likedCount})
          </button>
          <button
            type="button"
            className={`segBtn ${trackFilter === 'missing' ? 'active' : ''}`}
            onClick={() => onChangeTrackFilter('missing')}
          >
            ○ Not Liked Yet ({unlikedCount})
          </button>
        </div>
        {!album.isTracklistComplete && (
          <span className="muted" style={{ fontSize: 12 }}>
            Showing liked tracks from library
          </span>
        )}
      </div>

      <ul className="trackList">
        {filteredTracks.map((t) => (
          <li
            key={`${t.id}-${t.trackNumber}`}
            className={`trackRow ${t.isLiked ? 'liked' : 'unliked'}`}
          >
            <span className="trackNum">{t.trackNumber}</span>
            <span
              className={`trackHeart ${t.isLiked ? 'isLiked' : ''}`}
              title={t.isLiked ? 'In your Liked Songs' : 'Not liked yet'}
            >
              {t.isLiked ? '♥' : '♡'}
            </span>
            <div className="trackMain">
              <span className="trackName">{t.name}</span>
              {t.topTrackInfo && (
                <span className="topTrackPill">
                  🔥 #{t.topTrackInfo.bestRank} Top Track (
                  {t.topTrackInfo.ranges
                    .map((r) => RANGE_LABELS[r] || r)
                    .join(', ')}
                  )
                </span>
              )}
            </div>
            <span className="trackDate">
              {t.isLiked && t.addedAt
                ? `Liked ${formatDateShort(t.addedAt)}`
                : 'Not in Liked Songs'}
            </span>
            <span className="trackDuration">{formatDuration(t.durationMs)}</span>
            {t.spotifyUrl && (
              <a
                href={t.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="trackPlayLink"
                title="Listen on Spotify"
              >
                Play ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
