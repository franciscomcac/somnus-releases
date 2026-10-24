import './somnus-connecting-mark.css'

import { useId } from 'react'

const NBSP = String.fromCharCode(160)

/** Somnus's connecting screen: the moon mark breathing on a seamless 6s loop,
 *  the wordmark, and a status line whose letters wave in turn. */
export function SomnusConnectingMark({ className, status = 'CONNECTING' }: { className?: string; status?: string }) {
  const maskId = `sc-crescent-${useId().replace(/:/g, '')}`
  const letters = [...status]

  // The outer box takes the caller's classes (e.g. an exit fade); the stage's
  // own entry animation holds its end state, which would override them.
  return (
    <div aria-label={`Somnus is ${status.toLowerCase()}`} className={className} role="status">
      <div className="sc-stage font-mono">
        <div className="sc-mark">
          <div className="sc-halo" />
          <svg aria-hidden="true" viewBox="0 0 132 132">
            <defs>
              <mask id={maskId}>
                <rect fill="#fff" height="132" width="132" />
                <circle className="sc-shade" cx="66" cy="66" fill="#000" r="30" />
              </mask>
            </defs>

            <g className="sc-dust">
              <circle cx="18" cy="30" r="1" />
              <circle cx="116" cy="22" r="1.2" />
              <circle cx="110" cy="112" r="1" />
              <circle cx="14" cy="98" r="1.2" />
            </g>

            <circle className="sc-ring" cx="66" cy="66" r="52" />

            <g className="sc-moon">
              <circle cx="66" cy="66" fill="currentColor" mask={`url(#${maskId})`} r="32" />
            </g>

            <g className="sc-orbit">
              <path
                className="sc-star"
                d="M66 6 Q67.4 12.6 74 14 Q67.4 15.4 66 22 Q64.6 15.4 58 14 Q64.6 12.6 66 6Z"
                fill="currentColor"
              />
            </g>
          </svg>
        </div>

        <div className="sc-word">SOMNUS</div>

        <div className="sc-status">
          <div aria-hidden="true" className="sc-label">
            {letters.map((ch, i) => (
              <span key={i} style={{ animationDelay: `calc(var(--sc-t) / 2 * ${-(i / letters.length)})` }}>
                {ch === ' ' ? NBSP : ch}
              </span>
            ))}
          </div>
          <div className="sc-line" />
        </div>
      </div>
    </div>
  )
}
