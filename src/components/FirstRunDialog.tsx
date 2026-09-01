import './FirstRunDialog.css'

type Props = {
  onChoose: (choice: 'empty' | 'demo') => void
}

export function FirstRunDialog({ onChoose }: Props) {
  return (
    <div className="first-run" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
      <div className="first-run__card">
        <p className="first-run__eyebrow">연습 우선 · 로컬 우선 트래커</p>
        <h2 id="first-run-title">시작 문서를 선택하세요</h2>
        <p className="first-run__desc">
          데이터는 브라우저에 자동 저장됩니다. 빈 문서로 시작하거나 댄스+컨디셔닝 데모를 불러올
          수 있습니다.
        </p>
        <div className="first-run__actions">
          <button type="button" className="btn" onClick={() => onChoose('empty')}>
            빈 문서
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onChoose('demo')}>
            댄스+컨디셔닝 데모
          </button>
        </div>
      </div>
    </div>
  )
}
