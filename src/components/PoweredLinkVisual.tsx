import './PoweredLinkVisual.css'

type Props = {
  id: string
  pathD: string
  sx: number
  sy: number
  tx: number
  ty: number
  targetFlareR?: number
  selected?: boolean
}

function flareLayers(nodeR: number) {
  return {
    outer: nodeR + 14,
    mid: nodeR + 8,
    inner: nodeR + 3,
  }
}

function EndpointFlares({
  gradId,
  prefix,
  cx,
  cy,
  nodeR,
}: {
  gradId: string
  prefix: string
  cx: number
  cy: number
  nodeR: number
}) {
  const layers = flareLayers(nodeR)
  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={layers.outer}
        fill={`url(#${gradId}-${prefix}-outer)`}
        className="powered-link__flare powered-link__flare--outer"
      />
      <circle
        cx={cx}
        cy={cy}
        r={layers.mid}
        fill={`url(#${gradId}-${prefix}-mid)`}
        className="powered-link__flare powered-link__flare--mid"
      />
      <circle
        cx={cx}
        cy={cy}
        r={layers.inner}
        fill={`url(#${gradId}-${prefix}-inner)`}
        className="powered-link__flare powered-link__flare--inner"
      />
    </>
  )
}

function radialStops(prefix: string, gradId: string, cx: number, cy: number, nodeR: number) {
  const layers = flareLayers(nodeR)
  return (
    <>
      <radialGradient
        id={`${gradId}-${prefix}-outer`}
        gradientUnits="userSpaceOnUse"
        cx={cx}
        cy={cy}
        r={layers.outer}
      >
        <stop offset="0%" stopColor="#d8fff8" stopOpacity="0.5" />
        <stop offset="42%" stopColor="#9fe8dd" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#5ec4b4" stopOpacity="0" />
      </radialGradient>
      <radialGradient
        id={`${gradId}-${prefix}-mid`}
        gradientUnits="userSpaceOnUse"
        cx={cx}
        cy={cy}
        r={layers.mid}
      >
        <stop offset="0%" stopColor="#eafffb" stopOpacity="0.65" />
        <stop offset="55%" stopColor="#9fe8dd" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#7fd4c8" stopOpacity="0" />
      </radialGradient>
      <radialGradient
        id={`${gradId}-${prefix}-inner`}
        gradientUnits="userSpaceOnUse"
        cx={cx}
        cy={cy}
        r={layers.inner}
      >
        <stop offset="0%" stopColor="#f4fffd" stopOpacity="0.45" />
        <stop offset="70%" stopColor="#9fe8dd" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#7fd4c8" stopOpacity="0" />
      </radialGradient>
    </>
  )
}

/** Wide transparent power beam with a flare at the target end only. */
export function PoweredLinkVisual({
  id,
  pathD,
  sx,
  sy,
  tx,
  ty,
  targetFlareR = 24,
  selected = false,
}: Props) {
  const gradId = `power-beam-${id}`

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={sx}
          y1={sy}
          x2={tx}
          y2={ty}
        >
          <stop offset="0%" stopColor="#b8f5ec" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#9fe8dd" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#b8f5ec" stopOpacity="0.52" />
        </linearGradient>
        {radialStops('tgt', gradId, tx, ty, targetFlareR)}
      </defs>
      <g
        className={`powered-link${selected ? ' powered-link--selected' : ''}`}
        aria-hidden
      >
        <EndpointFlares gradId={gradId} prefix="tgt" cx={tx} cy={ty} nodeR={targetFlareR} />
        <path d={pathD} className="powered-link__beam-wide" stroke={`url(#${gradId})`} />
        <path d={pathD} className="powered-link__beam-mid" stroke={`url(#${gradId})`} />
        <path d={pathD} className="powered-link__beam-core" stroke={`url(#${gradId})`} />
      </g>
    </>
  )
}
