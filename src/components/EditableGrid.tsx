import { useEffect, useState } from 'react'

export interface GridColumn<T> {
  key: string
  label: string
  get: (row: T) => string
  readOnly?: boolean
  required?: boolean
  width?: number
}

type CellState = 'idle' | 'saving' | 'saved' | 'error'

function Cell<T extends { id: string }>({
  row,
  column,
  onCommit,
}: {
  row: T
  column: GridColumn<T>
  onCommit: (row: T, key: string, value: string) => Promise<void>
}) {
  const source = column.get(row)
  const [value, setValue] = useState(source)
  const [state, setState] = useState<CellState>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setValue(source)
  }, [source])

  useEffect(() => {
    if (state !== 'saved') return
    const timer = window.setTimeout(() => setState('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [state])

  if (column.readOnly) return <span className="grid-static">{source}</span>

  async function commit() {
    const next = value.trim()
    if (next === source || state === 'saving') {
      setValue(source)
      return
    }
    if (column.required && next === '') {
      setValue(source)
      setState('error')
      setMessage(`${column.label}은(는) 비워 둘 수 없습니다.`)
      return
    }
    setState('saving')
    setMessage('')
    try {
      await onCommit(row, column.key, next)
      setState('saved')
    } catch (error) {
      setValue(source)
      setState('error')
      setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.')
    }
  }

  return (
    <input
      className={`grid-input ${state}`}
      value={value}
      title={state === 'error' ? message : undefined}
      aria-label={column.label}
      aria-invalid={state === 'error'}
      onChange={(event) => {
        setValue(event.target.value)
        if (state === 'error') setState('idle')
      }}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setValue(source)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function EditableGrid<T extends { id: string }>({
  rows,
  columns,
  onCommit,
  onOpen,
  empty,
}: {
  rows: T[]
  columns: GridColumn<T>[]
  onCommit: (row: T, key: string, value: string) => Promise<void>
  onOpen?: (row: T) => void
  empty?: string
}) {
  if (rows.length === 0) return <p className="empty">{empty ?? '표시할 항목이 없습니다.'}</p>
  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.width ? { width: column.width } : undefined}>
                {column.label}
              </th>
            ))}
            {onOpen && <th aria-label="상세" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>
                  <Cell row={row} column={column} onCommit={onCommit} />
                </td>
              ))}
              {onOpen && (
                <td>
                  <button type="button" className="text-btn" onClick={() => onOpen(row)}>
                    상세
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint grid-hint">칸을 눌러 바로 고칩니다. Enter 또는 다른 칸으로 이동하면 저장되고, Esc는 되돌립니다.</p>
    </div>
  )
}
