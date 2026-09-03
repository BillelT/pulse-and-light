import type { ChangeEvent, ReactNode } from 'react'

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
  hint?: string
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <b>{format ? format(value) : value.toFixed(2)}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div className="color-row">
        <input
          type="color"
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

/** Trois sliders X/Y/Z compacts pour une position. */
export function Vec3Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: [number, number, number]
  min: number
  max: number
  step: number
  onChange: (v: [number, number, number]) => void
}) {
  const axes: Array<{ i: 0 | 1 | 2; k: 'X' | 'Y' | 'Z' }> = [
    { i: 0, k: 'X' },
    { i: 1, k: 'Y' },
    { i: 2, k: 'Z' },
  ]
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <b>
          {value[0].toFixed(1)}, {value[1].toFixed(1)}, {value[2].toFixed(1)}
        </b>
      </div>
      {axes.map(({ i, k }) => (
        <input
          key={k}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[i]}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const next = [...value] as [number, number, number]
            next[i] = Number(e.target.value)
            onChange(next)
          }}
        />
      ))}
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

export function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  )
}
