import type { BinderShapeId, Side } from '../shared/types'

/*
 * Outlines for the binder tab style, as CSS shape() values.
 *
 * A tab's page edge is its inner side. Each outline is written once for the
 * top half of the tab, walking from the page edge out to the middle of the
 * outer edge, with the page edge on the left. The bottom half is that same
 * walk mirrored top to bottom, and a left dock mirrors it left to right, so
 * every shape works on both docks and the two halves cannot drift apart.
 *
 * Every shape starts with the same sweep out of the page edge (a flare of
 * --binder-flare), which is what lets neighbouring tabs overlap. The box is
 * that much taller than the visible body at top and bottom. The --binder-*
 * sizes are defined in binder.css.
 */

const F = 'var(--binder-flare)'
const R = 'var(--binder-round)'
const S = 'var(--binder-slant)'

/** A horizontal position: a share of the width plus a length, from the page edge. */
type X = [percent: number, length: string]
interface Node { x: X; y: string; control?: { x: X; y: string } }

const at = (percent: number, length = '0px'): X => [percent, length]
const line = (x: X, y: string): Node => ({ x, y })
const curve = (x: X, y: string, cx: X, cy: string): Node => ({ x, y, control: { x: cx, y: cy } })

const lead: Node[] = [curve(at(0, F), F, at(0), `${F} * 0.7`)]
const outer = at(100)
const beforeOuter = (length: string) => at(100, `0px - ${length}`)

/** A plateau at `inset` from the tab's ends, rounded at the outer corner. */
const roundedEnd = (inset: string, radius = R): Node[] => [
  line(beforeOuter(radius), inset),
  curve(outer, `${inset} + ${radius}`, outer, inset),
]

const slanted = (rise: string): Node[] => [
  line(beforeOuter(R), `${F} + ${rise} - ${R} * 0.3`),
  curve(outer, `${F} + ${rise} + ${R}`, outer, `${F} + ${rise}`),
]

const TOPS: Record<BinderShapeId, Node[]> = {
  wave: slanted(S),
  rounded: roundedEnd(F),
  slant: slanted('16px'),
  shoulder: [line(at(45), F), line(at(45), `${F} + 7px`), ...roundedEnd(`${F} + 7px`)],
  notch: [line(at(45), F), line(at(45), `${F} + 7px`), ...roundedEnd(`${F} + 7px`, '3px')],
  step: [
    line(at(35), F), line(at(35), `${F} + 6px`),
    line(at(65), `${F} + 6px`), line(at(65), `${F} + 13px`),
    ...roundedEnd(`${F} + 13px`),
  ],
  dome: [curve(outer, '50%', outer, F)],
  scallop: [line(at(35), F), line(at(35), `${F} + 6px`), line(at(62), `${F} + 6px`), curve(outer, '50%', outer, `${F} + 6px`)],
  crown: [
    line(at(30), F), line(at(30), `${F} + 5px`),
    line(at(55), `${F} + 5px`), line(at(55), `${F} + 11px`),
    curve(outer, '50%', outer, `${F} + 11px`),
  ],
}

export function binderShapeIds(): BinderShapeId[] {
  return Object.keys(TOPS) as BinderShapeId[]
}

/** The shape() value for a tab docked on `side`. */
export function binderShape(id: BinderShapeId, side: Side): string {
  const horizontal = ([percent, length]: X) =>
    side === 'right' ? `calc(${percent}% + ${length})` : `calc(${100 - percent}% - (${length}))`
  const top = (y: string) => `calc(${y})`
  const bottom = (y: string) => `calc(100% - (${y}))`
  const point = (x: X, y: string) => `${horizontal(x)} ${y}`

  const nodes = [...lead, ...TOPS[id]]
  const starts = [{ x: at(0), y: '0px' }, ...nodes]
  const start = side === 'right' ? '0% 0%' : '100% 0%'
  const command = (n: Node, y: (v: string) => string) =>
    n.control
      ? `curve to ${point(n.x, y(n.y))} with ${point(n.control.x, y(n.control.y))}`
      : `line to ${point(n.x, y(n.y))}`

  const down = nodes.map(n => command(n, top))
  // Walking back up: each segment ends at the previous node and keeps its control point.
  const up = nodes
    .map((n, i) => ({ target: starts[i], control: n.control }))
    .reverse()
    .map(({ target, control }) =>
      control
        ? `curve to ${point(target.x, bottom(target.y))} with ${point(control.x, bottom(control.y))}`
        : `line to ${point(target.x, bottom(target.y))}`,
    )
  const last = nodes[nodes.length - 1]
  const join = `line to ${point(last.x, bottom(last.y))}`
  return `shape(from ${start}, ${[...down, join, ...up, 'close'].join(', ')})`
}
