import { type CSSProperties, Fragment, useMemo, useState } from 'react'
import freehandSignatureUrl from '../assets/freehand-signature-3.png'
import brandLogoUrl from '../assets/logo.png'
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
  onRefreshLibrary?: () => void
  onHydrateAlbum?: (albumId: string) => Promise<void>
}

function formatSyncAge(iso?: string): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return ''
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60000))
  if (diffMin < 1) return 'Synced just now • 24h cache'
  if (diffMin < 60) return `Synced ${diffMin}m ago • 24h cache`
  const diffHr = Math.floor(diffMin / 60)
  return `Synced ${diffHr}h ago • 24h cache`
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
  onRefreshLibrary,
  onHydrateAlbum,
}: DashboardViewProps) {
  const [rankingMode, setRankingMode] = useState<RankingMode>('weighted')
  const [customWeights, setCustomWeights] =
    useState<ScoringWeights>(DEFAULT_WEIGHTS)
  const [minTotalTracks, setMinTotalTracks] = useState<number>(5)
  const [minLikedTracks, setMinLikedTracks] = useState<number>(2)
  const [fullAlbumsOnly, setFullAlbumsOnly] = useState<boolean>(true)
  const [deduplicateEditions, setDeduplicateEditions] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [viewLayout, setViewLayout] = useState<'grid' | 'list' | 'tier'>('grid')
  const [gridColumns, setGridColumns] = useState<number>(3)
  const [gradeBasedTiering, setGradeBasedTiering] = useState<boolean>(false)
  const [expandedAlbumKey, setExpandedAlbumKey] = useState<string | null>(null)
  const [trackFilter, setTrackFilter] = useState<'all' | 'liked' | 'missing'>(
    'all',
  )
  const [hydratingAlbumId, setHydratingAlbumId] = useState<string | null>(null)

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
    () => scoredAlbums.filter((a) => isNoSkipAlbum(a)).length,
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

  const toggleExpandAlbum = (album: ScoredAlbum) => {
    if (expandedAlbumKey === album.key) {
      setExpandedAlbumKey(null)
    } else {
      setExpandedAlbumKey(album.key)
      setTrackFilter('all')
      if (!album.isTracklistComplete && onHydrateAlbum) {
        setHydratingAlbumId(album.albumId)
        onHydrateAlbum(album.albumId)
          .catch(() => {})
          .finally(() => {
            setHydratingAlbumId((prev) =>
              prev === album.albumId ? null : prev,
            )
          })
      }
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
              {!dataset.isDemo && dataset.fetchedAt && (
                <span className="muted" style={{ fontSize: 12 }}>
                  • {formatSyncAge(dataset.fetchedAt)}
                </span>
              )}
            </div>
            <h2 className="dashTitle">Your Top Albums by Liked Songs</h2>
            <p className="muted">
              Ranked by proportion of liked tracks, album depth, and your most
              played Spotify Top Tracks. Click any album to inspect liked vs.
              unliked songs.
            </p>
          </div>
          <div className="dashActions">
            {dataset.isDemo ? (
              <button
                type="button"
                className="button spotifyBtn small"
                onClick={onConnectRealSpotify}
              >
                Connect Real Spotify
              </button>
            ) : (
              onRefreshLibrary && (
                <button
                  type="button"
                  className="button small"
                  onClick={onRefreshLibrary}
                  title="Force a fresh sync of your Liked Songs and Top Tracks from Spotify"
                >
                  ↻ Refresh Library
                </button>
              )
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
              “No-Skip” Albums (100% Liked)
              <InfoTooltip
                title="No-Skip Albums (S Tier)"
                body="Albums where you have liked 100% of the entire tracklist—earning the ★ No-Skip badge and an automatic spot in S Tier."
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
                body="Weighted Score combines Bayesian-smoothed % Liked (55%), Liked Song Volume (25%), Top 50 Tracks Boost (15%), and Recency of Likes (5%) so 1-track singles don't beat full albums."
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
            <span className="controlHeading">
              View Layout
              <InfoTooltip
                title="View Layouts"
                body="Switch between Grid Cards, a sortable Ranking Table, or Fibonacci Tiering (where each tier groups two Fibonacci levels: S = 1+2, A = 3+5, B = 8+13, C = 21+34, etc.)."
              />
            </span>
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
              <button
                type="button"
                className={`segBtn ${viewLayout === 'tier' ? 'active' : ''}`}
                onClick={() => setViewLayout('tier')}
              >
                🏆 Tiering
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
                  Bayesian % Liked
                  <InfoTooltip
                    title="Bayesian-Smoothed % Liked"
                    body="Confidence-adjusted % Liked: (liked + 3.2 × 0.28) ÷ (total + 3.2). Pulls tiny 1–2 track singles toward a 28% baseline so a 1/1 single doesn't automatically outrank a 14/15 full album."
                  />
                  : <strong>{customWeights.proportionWeight}</strong>
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

          {viewLayout === 'grid' && (
            <label className="sliderFilter">
              <span>
                Card Size: <strong>{gridColumns} per row</strong>
              </span>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={gridColumns}
                onChange={(e) => setGridColumns(Number(e.target.value))}
              />
            </label>
          )}

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

          {viewLayout === 'tier' && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={gradeBasedTiering}
                onChange={(e) => setGradeBasedTiering(e.target.checked)}
              />
              <span>
                Grade-based Tiering
                <InfoTooltip
                  title="Grade-based Tiering"
                  body="Assigns albums to tiers by score thresholds instead of Fibonacci bucket counts: S (100% / No-Skip), A (≥90%), B (≥80%), C (≥70%), D (≥60%), and F (<60%)."
                />
              </span>
            </label>
          )}

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
        <div
          className={`albumsGridCards cols-${gridColumns}`}
          style={
            {
              '--grid-cols': gridColumns,
            } as CSSProperties
          }
        >
          {scoredAlbums.map((album, idx) => {
            const rank = idx + 1
            const gridInterval = gridColumns * 2
            const showBrandBreak =
              rank % gridInterval === 0 ||
              (rank === scoredAlbums.length && scoredAlbums.length < gridInterval)
            return (
              <Fragment key={album.key}>
                <AlbumGridCard
                  album={album}
                  rank={rank}
                  isExpanded={expandedAlbumKey === album.key}
                  onToggleExpand={() => toggleExpandAlbum(album)}
                  trackFilter={trackFilter}
                  onChangeTrackFilter={setTrackFilter}
                  isHydrating={hydratingAlbumId === album.albumId}
                  onHydrateAlbum={
                    onHydrateAlbum
                      ? () => onHydrateAlbum(album.albumId)
                      : undefined
                  }
                />
                {showBrandBreak && (
                  <BrandSignatureRow variant="grid" index={Math.floor(rank / gridInterval)} />
                )}
              </Fragment>
            )
          })}
        </div>
      ) : viewLayout === 'tier' ? (
        <FibonacciTierView
          albums={scoredAlbums}
          gradeBased={gradeBasedTiering}
          expandedAlbumKey={expandedAlbumKey}
          onToggleExpand={toggleExpandAlbum}
          trackFilter={trackFilter}
          onChangeTrackFilter={setTrackFilter}
          hydratingAlbumId={hydratingAlbumId}
          onHydrateAlbum={onHydrateAlbum}
        />
      ) : (
        <div className="card tableCard">
          <div className="tableWrap">
            <table className="rankingTable">
              <thead>
                <tr>
                  <th className="colRank">Rank</th>
                  <th className="colAlbum">Album</th>
                  <th className="colArtist">Artist</th>
                  <th className="colYear">Year</th>
                  <th className="colLiked">Liked / Total</th>
                  <th className="colPct">% Liked</th>
                  <th className="colTopHits">
                    Top 50 Hits
                    <InfoTooltip
                      title="Top 50 Hits on Album"
                      body="Number of songs on this album that appear in your Spotify Top 50 most-played tracks (4-week, 6-month, or all-time)."
                    />
                  </th>
                  <th className="colScore">Score</th>
                  <th className="colTracklist" style={{ textAlign: 'right' }}>
                    Tracklist
                  </th>
                </tr>
              </thead>
              <tbody>
                {scoredAlbums.map((album, idx) => {
                  const isExpanded = expandedAlbumKey === album.key
                  const pct = Math.round(album.proportionLiked * 100)
                  const unlikedCount = Math.max(
                    0,
                    album.totalTracks - album.likedCount,
                  )
                  const rank = idx + 1
                  const tableInterval = 5
                  const showTableBrandBreak =
                    rank % tableInterval === 0 ||
                    (rank === scoredAlbums.length &&
                      scoredAlbums.length < tableInterval)
                  return (
                    <Fragment key={album.key}>
                      <tr
                        className={`rankingRow ${isExpanded ? 'expandedRow' : ''}`}
                        onClick={() => toggleExpandAlbum(album)}
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
                              <div className="tableInlineBadges">
                                {unlikedCount === 0 && (
                                  <span className="metaBadge noSkip">
                                    ★ No-Skip
                                  </span>
                                )}
                                {album.mergedEditionNames.length > 1 && (
                                  <span
                                    className="metaBadge merged"
                                    title={`Merged editions: ${album.mergedEditionNames.join(' + ')}`}
                                  >
                                    ✨ {album.mergedEditionNames.length}{' '}
                                    editions merged
                                  </span>
                                )}
                              </div>
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
                              🔥 {album.topTracksCount} Top{' '}
                              {album.topTracksCount === 1 ? 'Track' : 'Tracks'}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
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
                              toggleExpandAlbum(album)
                            }}
                          >
                            {isExpanded ? '▴ Hide' : '▾ Tracks'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="tableDrawerRow">
                          <td colSpan={9} style={{ padding: 0 }}>
                            <TracklistDrawerContent
                              album={album}
                              trackFilter={trackFilter}
                              onChangeTrackFilter={setTrackFilter}
                              isHydrating={hydratingAlbumId === album.albumId}
                              onHydrateAlbum={
                                onHydrateAlbum
                                  ? () => {
                                      setHydratingAlbumId(album.albumId)
                                      onHydrateAlbum(album.albumId)
                                        .catch(() => {})
                                        .finally(() =>
                                          setHydratingAlbumId((prev) =>
                                            prev === album.albumId
                                              ? null
                                              : prev,
                                          ),
                                        )
                                    }
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      )}
                      {showTableBrandBreak && (
                        <tr className="tableBrandDividerRow" aria-hidden="true">
                          <td colSpan={9}>
                            <BrandSignatureRow
                              variant="table"
                              index={Math.floor(rank / tableInterval)}
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

interface BrandSignatureRowProps {
  variant: 'grid' | 'table'
  index: number
}

function BrandSignatureRow({ variant, index }: BrandSignatureRowProps) {
  const reverseOrder = index % 2 === 0
  return (
    <div
      className={`brandSignatureBreak ${variant === 'grid' ? 'gridBreak' : 'tableBreak'}`}
      aria-hidden="true"
    >
      <span className="brandBreakLine" />
      <div className={`brandBreakLogos ${reverseOrder ? 'reversed' : ''}`}>
        <img
          src={brandLogoUrl}
          alt="RovA Logo"
          className="brandLogoImg"
          loading="lazy"
        />
        <span className="brandBreakDot">•</span>
        <img
          src={freehandSignatureUrl}
          alt="RovA Hand Signature"
          className="brandSignatureImg"
          loading="lazy"
        />
      </div>
      <span className="brandBreakLine" />
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
  isHydrating?: boolean
  onHydrateAlbum?: () => void
}

function AlbumGridCard({
  album,
  rank,
  isExpanded,
  onToggleExpand,
  trackFilter,
  onChangeTrackFilter,
  isHydrating,
  onHydrateAlbum,
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
          isHydrating={isHydrating}
          onHydrateAlbum={onHydrateAlbum}
        />
      )}
    </div>
  )
}

const TIER_LETTERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const
const NON_S_TIER_LETTERS = ['A', 'B', 'C', 'D', 'F'] as const
// 10 Fibonacci levels across A, B, C, D, F (2 per tier; S tier is reserved exclusively for 100% / No-Skip albums)
const NON_S_FIBONACCI_LEVELS = [
  3, 5, 8, 13, 21, 34, 55, 89, 144, 233,
] as const

export function isNoSkipAlbum(album: ScoredAlbum): boolean {
  const unlikedCount = Math.max(0, album.totalTracks - album.likedCount)
  const pct = Math.round(album.proportionLiked * 100)
  return (
    (album.totalTracks > 0 && unlikedCount === 0) ||
    pct >= 100 ||
    Math.round(album.finalScore) >= 100
  )
}

export interface FibonacciLevel {
  levelIndex: number
  baseFibonacci: number
  capacity: number
  items: { album: ScoredAlbum; rank: number }[]
}

export interface FibonacciTierGroup {
  tierLetter: (typeof TIER_LETTERS)[number]
  tierIndex: number
  levels: FibonacciLevel[]
  totalCapacity: number
  totalItems: number
}

/**
 * Distributes `albums` across S, A, B, C, D, and F tiers (always ending at F tier):
 * - S tier ALWAYS contains all (and only) "No-Skip" / 100% albums (`isNoSkipAlbum`),
 *   regardless of which Ranking Formula or filter setting is active.
 * - Remaining (<100%) albums are distributed across A, B, C, D, and F tiers using
 *   2 Fibonacci levels per tier (A: 3+5, B: 8+13, C: 21+34, D: 55+89, F: 144+rest),
 *   scaling proportionally for smaller libraries and always ending at F tier.
 */
export function buildFibonacciTierGroups(
  albums: ScoredAlbum[],
): FibonacciTierGroup[] {
  if (albums.length === 0) return []

  const noSkipAlbums = albums.filter((a) => isNoSkipAlbum(a))
  const remainingAlbums = albums.filter((a) => !isNoSkipAlbum(a))

  const groups: FibonacciTierGroup[] = []
  let rankCursor = 1

  // Build S Tier from all No-Skip / 100% albums
  if (noSkipAlbums.length > 0) {
    const sCount = noSkipAlbums.length
    const sLevels: FibonacciLevel[] = []
    if (sCount === 1) {
      sLevels.push({
        levelIndex: 0,
        baseFibonacci: 1,
        capacity: 1,
        items: [{ album: noSkipAlbums[0], rank: rankCursor++ }],
      })
    } else {
      // Split across S tier's 2 sub-levels in a ~1:2 Fibonacci pyramid ratio
      const firstRowCount = Math.max(1, Math.floor(sCount / 3))
      const firstSlice = noSkipAlbums
        .slice(0, firstRowCount)
        .map((album) => ({ album, rank: rankCursor++ }))
      const secondSlice = noSkipAlbums
        .slice(firstRowCount)
        .map((album) => ({ album, rank: rankCursor++ }))
      sLevels.push(
        {
          levelIndex: 0,
          baseFibonacci: 1,
          capacity: firstSlice.length,
          items: firstSlice,
        },
        {
          levelIndex: 1,
          baseFibonacci: 2,
          capacity: secondSlice.length,
          items: secondSlice,
        },
      )
    }
    groups.push({
      tierLetter: 'S',
      tierIndex: 0,
      levels: sLevels,
      totalCapacity: sCount,
      totalItems: sCount,
    })
  } else {
    groups.push({
      tierLetter: 'S',
      tierIndex: 0,
      levels: [],
      totalCapacity: 0,
      totalItems: 0,
    })
  }

  // Distribute remaining (<100%) albums across A, B, C, D, F (10 Fibonacci levels)
  const m = remainingAlbums.length
  if (m === 0) {
    return groups
  }

  const totalNonSLevels = NON_S_FIBONACCI_LEVELS.length // 10 (2 per tier across A, B, C, D, F)
  const fullNonSFibSum = NON_S_FIBONACCI_LEVELS.reduce((s, v) => s + v, 0) // 605

  let capacities: number[]

  if (m >= fullNonSFibSum) {
    capacities = [...NON_S_FIBONACCI_LEVELS]
    const first9Sum = capacities.slice(0, 9).reduce((s, v) => s + v, 0)
    capacities[9] = m - first9Sum
  } else if (m < NON_S_TIER_LETTERS.length) {
    // Fewer than 5 remaining albums: 1 per active tier, always ending at F tier
    capacities = new Array(totalNonSLevels).fill(0)
    for (let i = 0; i < m; i += 1) {
      const tierIdx =
        i === m - 1 ? NON_S_TIER_LETTERS.length - 1 : i
      capacities[tierIdx * 2] += 1
    }
  } else {
    capacities = new Array(totalNonSLevels).fill(0)
    if (m >= totalNonSLevels) {
      for (let i = 0; i < totalNonSLevels; i += 1) {
        capacities[i] = 1
      }
      const extra = m - totalNonSLevels
      if (extra > 0) {
        const rawWeights = NON_S_FIBONACCI_LEVELS.map((fib) =>
          Math.max(0, Math.pow(fib, 0.65) - 0.85),
        )
        const weightSum = rawWeights.reduce((s, w) => s + w, 0)
        const exactExtras = rawWeights.map((w) => (w / weightSum) * extra)
        const floored = exactExtras.map((v) => Math.floor(v))
        const leftover = extra - floored.reduce((s, v) => s + v, 0)

        const remainders = exactExtras
          .map((v, idx) => ({ idx, rem: v - floored[idx] }))
          .sort((a, b) => b.rem - a.rem || b.idx - a.idx)

        for (let k = 0; k < leftover; k += 1) {
          floored[remainders[k].idx] += 1
        }
        for (let i = 0; i < totalNonSLevels; i += 1) {
          capacities[i] += floored[i]
        }
      }
    } else {
      // 5 <= m < 10: 1 album in each of A, B, C, D, F, then fill second sub-levels from F upward
      for (let t = 0; t < NON_S_TIER_LETTERS.length; t += 1) {
        capacities[t * 2] = 1
      }
      let extra = m - NON_S_TIER_LETTERS.length
      for (
        let t = NON_S_TIER_LETTERS.length - 1;
        t >= 0 && extra > 0;
        t -= 1
      ) {
        capacities[t * 2 + 1] = 1
        extra -= 1
      }
    }
  }

  const nonSLevels: FibonacciLevel[] = []
  let remCursor = 0
  for (let i = 0; i < totalNonSLevels; i += 1) {
    const cap = capacities[i]
    const slice = remainingAlbums
      .slice(remCursor, remCursor + cap)
      .map((album) => ({
        album,
        rank: rankCursor++,
      }))
    nonSLevels.push({
      levelIndex: i + 2,
      baseFibonacci: NON_S_FIBONACCI_LEVELS[i],
      capacity: cap,
      items: slice,
    })
    remCursor += cap
  }

  for (let t = 0; t < NON_S_TIER_LETTERS.length; t += 1) {
    const pair = nonSLevels
      .slice(t * 2, t * 2 + 2)
      .filter((l) => l.items.length > 0)
    if (pair.length === 0) continue
    const tierLetter = NON_S_TIER_LETTERS[t]
    groups.push({
      tierLetter,
      tierIndex: t + 1,
      levels: pair,
      totalCapacity: pair.reduce((sum, l) => sum + l.capacity, 0),
      totalItems: pair.reduce((sum, l) => sum + l.items.length, 0),
    })
  }

  return groups
}

const GRADE_THRESHOLDS: {
  tierLetter: (typeof TIER_LETTERS)[number]
  minScore: number
  label: string
}[] = [
  { tierLetter: 'S', minScore: 100, label: '100%' },
  { tierLetter: 'A', minScore: 90, label: '≥ 90%' },
  { tierLetter: 'B', minScore: 80, label: '≥ 80%' },
  { tierLetter: 'C', minScore: 70, label: '≥ 70%' },
  { tierLetter: 'D', minScore: 60, label: '≥ 60%' },
  { tierLetter: 'F', minScore: -Infinity, label: '< 60%' },
]

export function buildGradeTierGroups(
  albums: ScoredAlbum[],
): FibonacciTierGroup[] {
  const rawBuckets = new Map<
    (typeof TIER_LETTERS)[number],
    ScoredAlbum[]
  >()
  for (const t of TIER_LETTERS) {
    rawBuckets.set(t, [])
  }

  const nonSThresholds = GRADE_THRESHOLDS.slice(1)
  for (const album of albums) {
    if (isNoSkipAlbum(album)) {
      rawBuckets.get('S')?.push(album)
    } else {
      const score = album.finalScore
      const matched =
        nonSThresholds.find((g) => score >= g.minScore) ??
        nonSThresholds[nonSThresholds.length - 1]
      rawBuckets.get(matched.tierLetter)?.push(album)
    }
  }

  let rankCursor = 1
  return GRADE_THRESHOLDS.map((g, tierIndex) => {
    const bucketAlbums = rawBuckets.get(g.tierLetter) || []
    const items = bucketAlbums.map((album) => ({
      album,
      rank: rankCursor++,
    }))
    return {
      tierLetter: g.tierLetter,
      tierIndex,
      levels: [
        {
          levelIndex: tierIndex,
          baseFibonacci: items.length,
          capacity: items.length,
          items,
        },
      ],
      totalCapacity: items.length,
      totalItems: items.length,
    }
  })
}

interface FibonacciTierViewProps {
  albums: ScoredAlbum[]
  gradeBased: boolean
  expandedAlbumKey: string | null
  onToggleExpand: (album: ScoredAlbum) => void
  trackFilter: 'all' | 'liked' | 'missing'
  onChangeTrackFilter: (f: 'all' | 'liked' | 'missing') => void
  hydratingAlbumId: string | null
  onHydrateAlbum?: (albumId: string) => Promise<void>
}

function FibonacciTierView({
  albums,
  gradeBased,
  expandedAlbumKey,
  onToggleExpand,
  trackFilter,
  onChangeTrackFilter,
  hydratingAlbumId,
  onHydrateAlbum,
}: FibonacciTierViewProps) {
  const tierGroups = useMemo(
    () =>
      gradeBased
        ? buildGradeTierGroups(albums)
        : buildFibonacciTierGroups(albums),
    [albums, gradeBased],
  )

  return (
    <div className="tierBoard">
      {tierGroups.map((group, groupIdx) => {
        const showTierBrandBreak =
          (groupIdx + 1) % 2 === 0 || groupIdx === tierGroups.length - 1
        const gradeLabel =
          group.tierLetter === 'S'
            ? '100%'
            : gradeBased
              ? GRADE_THRESHOLDS[group.tierIndex]?.label
              : null
        return (
          <Fragment key={group.tierLetter}>
            <section
              className={`card tierRowCard tier-${group.tierLetter.toLowerCase()}`}
            >
              <div className="tierBadgeCol">
                <div className="tierLetterBadge">{group.tierLetter}</div>
                {gradeLabel && (
                  <div className="tierMetaLabel">{gradeLabel}</div>
                )}
                <div className="tierMetaSub">
                  {group.totalItems}{' '}
                  {group.totalItems === 1 ? 'album' : 'albums'}
                </div>
              </div>

              <div className="tierLevelsCol">
                {group.totalItems === 0 ? (
                  <div
                    className="tierFibonacciLevel muted"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: 13,
                      minHeight: 84,
                    }}
                  >
                    No albums in this score range
                  </div>
                ) : (
                  group.levels.map((level) => {
                    const expandedItem = level.items.find(
                      (item) => item.album.key === expandedAlbumKey,
                    )
                    return (
                      <div
                        key={level.levelIndex}
                        className="tierFibonacciLevel"
                      >
                        <div className="tierTilesGrid">
                          {level.items.map(({ album, rank }) => {
                            const isExpanded = expandedAlbumKey === album.key
                            const pct = Math.round(album.proportionLiked * 100)
                            return (
                              <button
                                type="button"
                                key={album.key}
                                className={`tierAlbumTile ${isExpanded ? 'active' : ''}`}
                                onClick={() => onToggleExpand(album)}
                                title={`#${rank} ${album.name} — ${album.primaryArtist} (${pct}% liked, ${album.finalScore.toFixed(1)} pts)`}
                              >
                                <div className="tierTileCoverWrap">
                                  {album.coverUrl ? (
                                    <img
                                      src={album.coverUrl}
                                      alt={album.name}
                                      className="tierTileCover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="tierTileFallback">💿</div>
                                  )}
                                  <span
                                    className={`tierTileRank ${rank <= 3 ? `top${rank}` : ''}`}
                                  >
                                    #{rank}
                                  </span>
                                  <span className="tierTilePct">
                                    {group.tierLetter === 'S'
                                      ? '100%'
                                      : gradeBased
                                        ? `${album.finalScore.toFixed(0)} pts`
                                        : `${pct}%`}
                                  </span>
                                </div>
                                <div className="tierTileTitle">
                                  {album.name}
                                </div>
                                <div className="tierTileArtist">
                                  {album.primaryArtist}
                                </div>
                              </button>
                            )
                          })}
                        </div>

                        {expandedItem && (
                          <div className="tierExpandedDrawerWrap">
                            <TracklistDrawerContent
                              album={expandedItem.album}
                              trackFilter={trackFilter}
                              onChangeTrackFilter={onChangeTrackFilter}
                              isHydrating={
                                hydratingAlbumId ===
                                expandedItem.album.albumId
                              }
                              onHydrateAlbum={
                                onHydrateAlbum
                                  ? () =>
                                      onHydrateAlbum(
                                        expandedItem.album.albumId,
                                      )
                                  : undefined
                              }
                            />
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
            {showTierBrandBreak && (
              <BrandSignatureRow
                variant="grid"
                index={Math.floor((groupIdx + 1) / 2)}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

interface TracklistDrawerContentProps {
  album: ScoredAlbum
  trackFilter: 'all' | 'liked' | 'missing'
  onChangeTrackFilter: (f: 'all' | 'liked' | 'missing') => void
  isHydrating?: boolean
  onHydrateAlbum?: () => void
}

function TracklistDrawerContent({
  album,
  trackFilter,
  onChangeTrackFilter,
  isHydrating,
  onHydrateAlbum,
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
          <span className="breakdownLabel">
            Bayesian %
            <InfoTooltip
              title="Bayesian-Smoothed % Liked"
              body="Confidence-adjusted % Liked: (liked + 3.2 × 0.28) ÷ (total + 3.2). Pulls tiny 1–2 track singles toward a 28% baseline while rewarding high completion on deep, full-length albums."
            />
          </span>
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
            {isHydrating ? (
              'Loading full album tracklist from Spotify…'
            ) : onHydrateAlbum ? (
              <button
                type="button"
                className="textLinkBtn"
                onClick={onHydrateAlbum}
              >
                Load unliked tracks from Spotify
              </button>
            ) : (
              'Showing liked tracks from library'
            )}
          </span>
        )}
      </div>

      {filteredTracks.length === 0 ? (
        <div
          className="muted"
          style={{ padding: '14px 10px', fontSize: 13 }}
        >
          {isHydrating
            ? 'Fetching remaining album tracks from Spotify…'
            : !album.isTracklistComplete && trackFilter === 'missing'
              ? 'Full album tracklist has not been loaded yet.'
              : 'No tracks in this view.'}
        </div>
      ) : (
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
                {t.topTrackInfo &&
                  t.topTrackInfo.ranges.map((r) => {
                    const rangeRank =
                      t.topTrackInfo?.rankByRange?.[r] ??
                      t.topTrackInfo?.bestRank
                    return (
                      <span key={r} className="topTrackPill">
                        🔥 #{rangeRank} Top Track ({RANGE_LABELS[r] || r})
                      </span>
                    )
                  })}
              </div>
              <span className="trackDate">
                {t.isLiked && t.addedAt
                  ? `Liked ${formatDateShort(t.addedAt)}`
                  : 'Not in Liked Songs'}
              </span>
              <span className="trackDuration">
                {formatDuration(t.durationMs)}
              </span>
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
      )}
    </div>
  )
}
