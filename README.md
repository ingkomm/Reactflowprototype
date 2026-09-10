# Passive Tree v0.1

연습 우선 · 로컬 우선 패시브 트리 트래커입니다. 브라우저에 그래프와 연습 기록을 저장하며, 서버 업로드는 하지 않습니다.

## 사용법

```bash
npm ci
npm run dev      # 개발 서버
npm run lint     # oxlint
npm test         # Vitest
npm run build    # 프로덕션 빌드
```

첫 실행 시 **빈 문서** 또는 **댄스 데모**를 선택할 수 있습니다. 이후 변경 사항은 `localStorage`에 자동 저장되며 새로고침 후에도 복구됩니다.

- **+1 연습**: Inspector에서 Small/Notable 노드에 연습 세션을 추가합니다 (날짜 자동 기록).
- **JSON 보내기/불러오기**: 수동 백업·이전. 가져오기 전 현재 문서는 자동 백업됩니다.
- **Root 연결 해제**: 링크는 삭제되지 않고 비활성화됩니다.

## 저장 방식

| 키 | 내용 |
|---|---|
| `pob-graph-document-v01` | 현재 작업 문서 (자동 저장) |
| `pob-graph-document-backup` | JSON 가져오기 직전 스냅샷 |
| `pob-bootstrap-choice` | 첫 실행 선택 (`empty` / `demo`) |

스키마 버전: `0.1` (`schemaVersion` 필드)

## 외부 요청

| 시점 | 대상 | 비고 |
|---|---|---|
| YouTube 재생 버튼 클릭 후 | `youtube-nocookie.com` embed | 클릭 전에는 요청 없음 |
| 외부 링크 동영상 | 사용자가 지정한 URL | 새 탭에서 열림 |

Google Fonts는 npm 패키지(`@fontsource/*`)로 번들에 포함되며 런타임 CDN 요청을 하지 않습니다.

## 데이터 형식

```json
{
  "schemaVersion": "0.1",
  "nodes": [{ "id": "...", "type": "passive", "position": { "x": 0, "y": 0 }, "data": { ... } }],
  "edges": [{ "id": "...", "type": "center", "source": "...", "target": "...", "data": { "active": true } }],
  "customSymbols": [],
  "settings": { "gridSnapEnabled": false, "voidHighlightEnabled": false }
}
```

### 제한 (v0.1)

- JSON: 2MB, 노드 500, 엣지 2000, 로그 5000, 문자열 500자
- 이미지 심볼: 512KB (PNG/JPEG/WebP/GIF만 — SVG 가져오기 비활성화)
- 오르빗 용량: 1–24

## GitHub Pages

`main` 브랜치 push 시 `.github/workflows/pages.yml`이 빌드·배포합니다.  
Base path: `/Reactflowprototype/` (저장소 이름 기준)

## LICENSE

**확인 필요** — 배포 전 라이선스를 팀에서 지정해 주세요.
