import { useId } from 'react'

type Props = {
  title: string
  subtitle: React.ReactNode
  onFile: (file: File) => void
  extra?: React.ReactNode
}

export function UploadDropzone({ title, subtitle, onFile, extra }: Props) {
  const reactId = useId()
  const fileInputId = `zip-input-${reactId}`

  return (
    <section className="card">
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>

      {extra}

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) onFile(f)
        }}
      >
        <div className="dropzoneInner">
          <div className="dropTitle">Drag & drop ZIP here</div>
          <div className="dropHint">or</div>
          <label className="button" htmlFor={fileInputId}>
            Choose file
          </label>
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
    </section>
  )
}

