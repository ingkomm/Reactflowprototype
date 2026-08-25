# Passive Tree Prototype

Path of Building 스타일 패시브 트리 UI를 React Flow로 만든 프로토타입입니다.

## Features

- 노드: Initial, Connect, Small, Notable, Mastery
- 파워: Initial → Connect(On/Off) → 그래프, Notable 1밴드(3) 완료 후 전달
- Mastery 오르빗(최대 3단): 슬롯 용량, 빈 슬롯 void 스페이싱, 잠금/회전
- 링크: 전원(center), 오르빗(orbit), Notable affinity
- Notable 트레이닝 로그 → 누적 3/5/7 밴드
- 클래스(아이콘·색상), Inspector, 실행 취소/다시 실행

## Run

```bash
npm install
npm run dev
```

## Stack

- Vite + React + TypeScript
- `@xyflow/react` (React Flow)
