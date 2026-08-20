/** Solid monochrome vector infographic icons (24×24 viewBox). */

export type IconSetId = 'training' | 'dance' | 'fitness' | 'focus'

export type IconDef = {
  id: string
  set: IconSetId
  label: string
  /** SVG path `d` attributes drawn with fill=currentColor */
  paths: string[]
}

export const ICON_SETS: { id: IconSetId; label: string }[] = [
  { id: 'training', label: '트레이닝' },
  { id: 'dance', label: '댄스' },
  { id: 'fitness', label: '운동' },
  { id: 'focus', label: '집중' },
]

export const NODE_ICONS: IconDef[] = [
  // Training
  {
    id: 'tr-target',
    set: 'training',
    label: '타깃',
    paths: [
      'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3.2a6.8 6.8 0 1 1-6.8 6.8A6.8 6.8 0 0 1 12 5.2zm0 3.3a3.5 3.5 0 1 0 3.5 3.5A3.5 3.5 0 0 0 12 8.5zm0 2a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 12 10.5z',
    ],
  },
  {
    id: 'tr-bolt',
    set: 'training',
    label: '번개',
    paths: ['M13.2 2 4.5 13.4h6.1L9.3 22 19.5 10.2h-6.2L13.2 2z'],
  },
  {
    id: 'tr-star',
    set: 'training',
    label: '별',
    paths: [
      'M12 2.2 14.7 9h7.1l-5.7 4.3 2.2 6.9L12 16.7 5.7 20.2l2.2-6.9L2.2 9h7.1L12 2.2z',
    ],
  },
  {
    id: 'tr-shield',
    set: 'training',
    label: '실드',
    paths: ['M12 2 4 5.2v6.1c0 5 3.4 8.4 8 10.2 4.6-1.8 8-5.2 8-10.2V5.2L12 2z'],
  },
  {
    id: 'tr-flag',
    set: 'training',
    label: '깃발',
    paths: ['M5 3h1.8v18H5V3zm2.4 0 11.2 4.2-11.2 4.4V3z'],
  },
  {
    id: 'tr-flame',
    set: 'training',
    label: '불꽃',
    paths: [
      'M12 2c1.2 2.4 1.8 4.1 1.2 6.1-.4 1.2.3 2 1.4 2.7 1.8 1.2 3.4 2.7 3.4 5.2A6 6 0 0 1 6 16c0-2.8 1.5-4.3 3.1-5.8.9-.8 1.5-1.7 1.2-2.9C9.8 5.2 10.6 3.6 12 2z',
    ],
  },

  // Dance
  {
    id: 'da-note',
    set: 'dance',
    label: '음표',
    paths: [
      'M9 4.2v10.3a3.1 3.1 0 1 1-1.8-2.8V7.1l9.2-2.1v8.2a3.1 3.1 0 1 1-1.8-2.8V4.2L9 4.2z',
    ],
  },
  {
    id: 'da-headphones',
    set: 'dance',
    label: '헤드폰',
    paths: [
      'M12 3a8 8 0 0 0-8 8v5.2a2.8 2.8 0 0 0 2.8 2.8H8V12H6.2V11a5.8 5.8 0 0 1 11.6 0v1H16v7h1.2A2.8 2.8 0 0 0 20 16.2V11a8 8 0 0 0-8-8z',
    ],
  },
  {
    id: 'da-spark',
    set: 'dance',
    label: '스파클',
    paths: [
      'M12 2.5 13.4 9 20 10.4 13.4 11.8 12 18.5 10.6 11.8 4 10.4 10.6 9 12 2.5zM18.2 15.2 19 17.4 21.2 18.2 19 19 18.2 21.2 17.4 19 15.2 18.2 17.4 17.4z',
    ],
  },
  {
    id: 'da-shoe',
    set: 'dance',
    label: '슈즈',
    paths: [
      'M3.5 14.2c0-1.4.8-2.6 2.5-3.4L12 8.2l2.2-3.4h2.4L14.8 9l5.7 2.6c1.4.6 2 1.6 2 3v1.6H3.5v-2z',
    ],
  },
  {
    id: 'da-disco',
    set: 'dance',
    label: '디스코',
    paths: [
      'M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 2.2 1.6 3.4 3.7.4-2.8 2.5.9 3.6L12 13.4 8.6 15.1l.9-3.6-2.8-2.5 3.7-.4z',
    ],
  },
  {
    id: 'da-wave',
    set: 'dance',
    label: '웨이브',
    paths: [
      'M3 13.2c1.6-2.4 3-3.6 4.5-3.6s2.6 1.2 4 3.2c1.4 2 2.7 3.4 4.3 3.4s3.1-1.4 4.7-3.8v3.4c-1.7 2.2-3.3 3.4-5 3.4s-3-1.3-4.4-3.2c-1.4-1.9-2.7-3.2-4.1-3.2S4.6 14.2 3 16.2v-3z',
    ],
  },

  // Fitness
  {
    id: 'fi-dumbbell',
    set: 'fitness',
    label: '덤벨',
    paths: [
      'M3 9.2h2.2v5.6H3V9.2zm3.2-1.6h2.2v8.8H6.2V7.6zm3.4 3.2h5.2v2.4H9.6v-2.4zm5.8-3.2h2.2v8.8h-2.2V7.6zm3.2 1.6H21v5.6h-2.2V9.2z',
    ],
  },
  {
    id: 'fi-heart',
    set: 'fitness',
    label: '하트',
    paths: [
      'M12 20.4S3.2 14.6 3.2 8.9A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.7c0 5.7-8.8 11.5-8.8 11.5z',
    ],
  },
  {
    id: 'fi-runner',
    set: 'fitness',
    label: '러너',
    paths: [
      'M14.6 4.6a2.1 2.1 0 1 1-2.1 2.1 2.1 2.1 0 0 1 2.1-2.1zM8.2 10.4l3.1-1.6 2.4 2.2 3.4-1.1 1.1 2-4.1 1.5-1.6 4.8H10l1.2-3.6-2.2-1.7-2.8 2.1-1.2-1.8z',
    ],
  },
  {
    id: 'fi-timer',
    set: 'fitness',
    label: '타이머',
    paths: [
      'M9.2 2.5h5.6v2.1H9.2V2.5zM12 5.4a8.1 8.1 0 1 0 8.1 8.1A8.1 8.1 0 0 0 12 5.4zm.9 3.2v5.1l4 2.3-.9 1.5-4.9-2.9V8.6z',
    ],
  },
  {
    id: 'fi-stretch',
    set: 'fitness',
    label: '스트레치',
    paths: [
      'M12 3.2a2 2 0 1 1-2 2 2 2 0 0 1 2-2zM6.2 9.4h11.6v2.1H13v4.2l3.8 4.6-1.7 1.4L11.2 16H9.4l-3.6 5.1-1.8-1.3 3.5-4.9V11.5H6.2z',
    ],
  },
  {
    id: 'fi-kettle',
    set: 'fitness',
    label: '케틀벨',
    paths: [
      'M9.4 4.8h5.2c1.1 0 2 .9 2 2.1v1.1h1.5A3.1 3.1 0 0 1 21.2 11v1.4A7.2 7.2 0 0 1 12 21.2 7.2 7.2 0 0 1 2.8 12.4V11a3.1 3.1 0 0 1 3.1-3h1.5V6.9c0-1.2.9-2.1 2-2.1zm1.9 2.1v1.1h1.4V6.9z',
    ],
  },

  // Focus
  {
    id: 'fo-eye',
    set: 'focus',
    label: '눈',
    paths: [
      'M12 5.2C6.4 5.2 2.2 10.2 1.4 12c.8 1.8 5 6.8 10.6 6.8S21.8 13.8 22.6 12C21.8 10.2 17.6 5.2 12 5.2zm0 3.1A3.7 3.7 0 1 1 8.3 12 3.7 3.7 0 0 1 12 8.3z',
    ],
  },
  {
    id: 'fo-book',
    set: 'focus',
    label: '북',
    paths: [
      'M4.2 4.2h6.1c1.3 0 2.4.7 3 1.7.6-1 1.7-1.7 3-1.7h3.5v14.4h-4.2c-.9 0-1.7.3-2.3.9l-.7.7-.7-.7a3.4 3.4 0 0 0-2.3-.9H4.2V4.2zm2.1 2.1v10.2h3.4c.7 0 1.4.2 2 .5V7.4c-.5-.2-1-.3-1.5-.3H6.3zm7.6 1.1v9.6c.6-.3 1.3-.5 2-.5h3.2V7.4h-3.7c-.5 0-1 .1-1.5.3z',
    ],
  },
  {
    id: 'fo-check',
    set: 'focus',
    label: '체크',
    paths: [
      'M12 2.4a9.6 9.6 0 1 0 9.6 9.6A9.6 9.6 0 0 0 12 2.4zm4.6 7.1-5.3 5.4a1 1 0 0 1-1.4 0L7.4 12.4l1.4-1.4 2 2 4.6-4.6z',
    ],
  },
  {
    id: 'fo-moon',
    set: 'focus',
    label: '달',
    paths: [
      'M13.2 2.6A9.4 9.4 0 1 0 21.4 14 7.6 7.6 0 0 1 13.2 2.6z',
    ],
  },
  {
    id: 'fo-compass',
    set: 'focus',
    label: '나침반',
    paths: [
      'M12 2.2A9.8 9.8 0 1 0 21.8 12 9.8 9.8 0 0 0 12 2.2zm3.9 5.1-1.8 5.4-5.4 1.8 1.8-5.4z',
    ],
  },
  {
    id: 'fo-layers',
    set: 'focus',
    label: '레이어',
    paths: [
      'M12 3.2 2.8 8.2 12 13.2l9.2-5zm0 7.6L2.8 15.8 12 20.8l9.2-5z',
    ],
  },
]

export const DEFAULT_ICON_ID_BY_KIND: Record<'small' | 'notable' | 'mastery', string> = {
  small: 'tr-target',
  notable: 'tr-star',
  mastery: 'tr-shield',
}

export function getIconDef(id: string | undefined | null): IconDef {
  return NODE_ICONS.find((i) => i.id === id) ?? NODE_ICONS[0]!
}

export function iconsInSet(set: IconSetId): IconDef[] {
  return NODE_ICONS.filter((i) => i.set === set)
}
