// SPDX-FileCopyrightText: 2026 Rohan Varshney
// SPDX-License-Identifier: LicenseRef-Proprietary

import { useId, useState } from 'react'

type Props = {
  title: React.ReactNode
  subtitle: React.ReactNode
  onFile: (file: File) => void
  onLoadDemo?: () => void
  extra?: React.ReactNode
}

export function UploadDropzone({
  title,
  subtitle,
  onFile,
  onLoadDemo,
  extra,
}: Props) {
  const reactId = useId()
  const fileInputId = `zip-input-${reactId}`
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div className="heroContainer">
      <section className="card heroCard">
        <div className="heroBadge">SPOTKIT • SESH</div>
        <h1 className="heroTitle">{title}</h1>
        <p className="heroLead">{subtitle}</p>

        <div className="featurePills">
          <span className="pill">📦 Local ZIP Archive Parser</span>
          <span className="pill">⚡ Web Worker Multi-Threading</span>
          <span className="pill">📅 Rolling &amp; Calendar Year Scopes</span>
          <span className="pill">🔒 100% Private In-Browser</span>
        </div>

        <div
          className={isDragging ? 'dropzone dragging' : 'dropzone'}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f) onFile(f)
          }}
        >
          <div className="dropzoneInner">
            <div className="dropIcon">📊</div>
            <div className="dropTitle">
              Drag &amp; drop your <code>my_spotify_data.zip</code> archive here
            </div>
            <div className="dropHint">
              Supports Spotify Extended Streaming History exports (JSON audio
              files inside ZIP)
            </div>
            <div className="dropActions">
              <label className="button spotifyBtn" htmlFor={fileInputId}>
                Choose ZIP Archive
              </label>
              {onLoadDemo && (
                <button
                  type="button"
                  className="button demoBtn"
                  onClick={onLoadDemo}
                >
                  ▶ Try Interactive Demo
                </button>
              )}
            </div>
            <input
              id={fileInputId}
              type="file"
              accept=".zip,application/zip"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
              }}
            />
          </div>
        </div>

        {extra}
      </section>
    </div>
  )
}
