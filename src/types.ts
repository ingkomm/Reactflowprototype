export type PassiveKind = 'small' | 'notable' | 'mastery'

export type TrainingEntry = {
  id: string
  label: string
  count: number
  note?: string
}

export type PassiveNodeData = {
  label: string
  kind: PassiveKind
  trainings: TrainingEntry[]
}

export const PASSIVE_KIND_LABEL: Record<PassiveKind, string> = {
  small: 'Small Passive',
  notable: 'Notable Passive',
  mastery: 'Mastery',
}
