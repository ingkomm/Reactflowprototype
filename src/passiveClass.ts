import type { NodeIconColor, PassiveKind } from './types'
import { DEFAULT_ICON_BY_KIND, NODE_ICON_COLORS } from './types'
import { DEFAULT_ICON_ID_BY_KIND } from './icons'

/** User-managed passive class: one icon + color per class, scoped by kind. */
export type PassiveClass = {
  id: string
  kind: PassiveKind
  label: string
  iconId: string
  iconColor: NodeIconColor
}

export const DEFAULT_CLASS_ID_BY_KIND: Record<PassiveKind, string> = {
  initial: 'i-default',
  connect: 'c-default',
  mastery: 'm-default',
  notable: 'n-default',
  small: 's-default',
}

export function createPassiveClassId(kind: PassiveKind) {
  return `${kind[0]}-${Math.random().toString(36).slice(2, 9)}`
}

export function buildDefaultClass(kind: PassiveKind, label = '기본'): PassiveClass {
  return {
    id: DEFAULT_CLASS_ID_BY_KIND[kind],
    kind,
    label,
    iconId: DEFAULT_ICON_ID_BY_KIND[kind],
    iconColor: DEFAULT_ICON_BY_KIND[kind],
  }
}

/** Starter catalog matching the seed tree themes. */
export function buildSeedClasses(): PassiveClass[] {
  return [
    {
      id: 'i-default',
      kind: 'initial',
      label: 'Initial',
      iconId: 'tr-bolt',
      iconColor: NODE_ICON_COLORS[12],
    },
    buildDefaultClass('connect', 'Connect'),
    buildDefaultClass('mastery', '기본 마스터리'),
    {
      id: 'm-dance',
      kind: 'mastery',
      label: '댄스',
      iconId: 'da-disco',
      iconColor: NODE_ICON_COLORS[7],
    },
    {
      id: 'm-gym',
      kind: 'mastery',
      label: '운동',
      iconId: 'fi-dumbbell',
      iconColor: NODE_ICON_COLORS[0],
    },

    buildDefaultClass('notable', '기본 Notable'),
    {
      id: 'n-hiphop',
      kind: 'notable',
      label: '힙합',
      iconId: 'da-headphones',
      iconColor: NODE_ICON_COLORS[5],
    },
    {
      id: 'n-kpop',
      kind: 'notable',
      label: 'K-pop',
      iconId: 'da-note',
      iconColor: NODE_ICON_COLORS[4],
    },
    {
      id: 'n-strength',
      kind: 'notable',
      label: '근력',
      iconId: 'fi-kettle',
      iconColor: NODE_ICON_COLORS[8],
    },
    {
      id: 'n-cardio',
      kind: 'notable',
      label: '유산소',
      iconId: 'fi-runner',
      iconColor: NODE_ICON_COLORS[6],
    },

    buildDefaultClass('small', '기본 Small'),
    {
      id: 's-basic',
      kind: 'small',
      label: '기본기',
      iconId: 'da-spark',
      iconColor: NODE_ICON_COLORS[2],
    },
    {
      id: 's-footwork',
      kind: 'small',
      label: '풋워크',
      iconId: 'da-shoe',
      iconColor: NODE_ICON_COLORS[8],
    },
    {
      id: 's-stretch',
      kind: 'small',
      label: '스트레칭',
      iconId: 'da-wave',
      iconColor: NODE_ICON_COLORS[11],
    },
    {
      id: 's-legs',
      kind: 'small',
      label: '하체',
      iconId: 'fi-stretch',
      iconColor: NODE_ICON_COLORS[1],
    },
    {
      id: 's-back',
      kind: 'small',
      label: '등',
      iconId: 'fi-heart',
      iconColor: NODE_ICON_COLORS[14],
    },
    {
      id: 's-run',
      kind: 'small',
      label: '러닝',
      iconId: 'fi-timer',
      iconColor: NODE_ICON_COLORS[9],
    },
    {
      id: 's-core',
      kind: 'small',
      label: '코어',
      iconId: 'tr-flame',
      iconColor: NODE_ICON_COLORS[3],
    },
  ]
}

export function classesForKind(classes: PassiveClass[], kind: PassiveKind) {
  return classes.filter((c) => c.kind === kind)
}

export function resolvePassiveClass(
  classes: PassiveClass[],
  classId: string | undefined | null,
  kind: PassiveKind,
): PassiveClass {
  const exact = classes.find((c) => c.id === classId)
  if (exact && exact.kind === kind) return exact
  const sameKind = classesForKind(classes, kind)
  return (
    sameKind.find((c) => c.id === DEFAULT_CLASS_ID_BY_KIND[kind]) ??
    sameKind[0] ??
    buildDefaultClass(kind)
  )
}
