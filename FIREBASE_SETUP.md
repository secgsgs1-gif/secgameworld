# Firebase Setup

1. Firebase Console에서 프로젝트 생성
2. Authentication -> Sign-in method -> Email/Password 활성화
3. Firestore Database 생성 (Production 또는 Test)
4. Web App 추가 후 config 값 복사
5. `shared/firebase-config.js`의 `REPLACE_ME` 값을 실제 값으로 교체

## Firestore 권장 규칙

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /transactions/{txId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## 데이터 구조

- `users/{uid}`
  - `email`: string
  - `points`: number
  - `lastCheckInDate`: string (`YYYY-MM-DD`)
  - `createdAt`: timestamp
  - `updatedAt`: timestamp

- `users/{uid}/transactions/{txId}`
  - `type`: `daily_check_in` | `spend` | `earn`
  - `amount`: number
  - `reason`: string
  - `meta`: map
  - `createdAt`: timestamp
