빌드: `pnpm install && pnpm build`

## `/api/v1/system` 확장 제안

시스템 화면은 클립 스토어 사용량을 게이지로 표시할 수 있도록 다음 선택 필드를 읽습니다.

```json
{
  "storage": {
    "clips_used_bytes": 2147483648,
    "clips_limit_bytes": 10737418240
  },
  "update_history": [
    { "id": "deploy-20260706", "version": "2026.07.06", "created_at": "2026-07-06T00:00:00.000Z", "status": "applied" }
  ],
  "rollback_history": []
}
```

필드가 없으면 대시보드는 사용량을 추정하지 않고 안내문을 표시합니다.
