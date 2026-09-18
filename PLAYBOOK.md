# 쿠팡 파트너스 정적 사이트 플레이북

차랑몰(Car-Parts-Cpang)을 기준으로, **같은 구조·같은 플랫폼**에 주제만 바꿔 사이트를 운영하는 방법이다.

작업 한 줄 요약: **구글 시트에 파트너스 링크를 넣으면, 로컬 스크립트가 상품명·사진을 모아 GitHub에 올리고, Vercel이 정적 HTML을 서비스한다.**

서핑용품(`surfwikikoreacpang`), 숨숨마을(`B-cat-Cpang`)과는 **원격·시트·Apps Script를 섞지 않는다.**

---

## 1. 이 조합을 고른 이유

| 선택 | 이유 |
|---|---|
| 정적 HTML + JSON | 서버/DB 없이 GitHub + Vercel로 끝난다. |
| 구글 시트 = 상품 원장 | 비개발자도 링크만 넣으면 된다. |
| 사진은 레포에 jpg로 저장 | 쿠팡 CDN 핫링크는 막히거나 사라진다. |
| 수집은 로컬 PC만 | GitHub Actions IP는 쿠팡/네이버에서 막히는 경우가 많다. |
| 용품가이드는 정적 페이지 | 쇼핑몰과 디자인·배포를 하나로 유지한다. |

---

## 2. 브랜드와 연결

- 샵: 차랑몰
- 레포: `eomjinseong-art/Car-Parts-Cpang`
- 사이트 타이틀: 차랑몰 | 자동차 용품 큐레이션

헤더: 차랑몰 | 자동차용품 | 용품가이드 | 오늘의 특가  
하단: 로켓와우 | 세차용품, 그 아래 용품가이드

시드 상품의 `coupangUrl`은 쿠팡 **검색 URL**이다. 파트너스 단축링크는 시트에 붙여 넣은 뒤 `npm run sync`로 교체한다.

---

## 3. 구글 시트 계약

시트 ID: `1wU99mTHsdFaLqBalR8-pFQA9OvG2BbcDa69muJXNf4w`  
탭 이름: **광고용**

편집용 원장(참고만): `1qaA9dgrbHxZ_6xqOw6dSN2ad8uUtEqHAxKRHvOhif2c`

| 필수 | 별칭 |
|---|---|
| 1열 = 행 번호 `NO` | 사진 파일명 `product-001.jpg`와 같다 |
| 쿠팡 파트너스 링크 | `쿠팡파트너스 링크`, `상품 링크` |

한 행 = 한 파트너스 단축링크(`https://link.coupang.com/a/...`).

공개 CSV:

```
https://docs.google.com/spreadsheets/d/1wU99mTHsdFaLqBalR8-pFQA9OvG2BbcDa69muJXNf4w/gviz/tq?tqx=out:csv&sheet=%EA%B4%91%EA%B3%A0%EC%9A%A9
```

---

## 4. 수집

본인 PC에서만:

```bash
npm run sync
```

분류만 다시:

```bash
npm run catalog
```

자리표시 제목은 `자동차 용품 추천 N`이다. 사이트는 jpg가 있고 이 제목이 아닌 행만 보여 준다.

Apps Script 웹앱 URL은 `.github/scripts/sync-coupang-products.mjs`의 `appsScriptUrl`에 둔다. 고양이·서핑 시트 웹앱을 재사용하지 않는다. 배포 전에는 빈 문자열로 두어도 된다.

---

## 5. 카테고리

`index.html`의 `CATEGORIES`와 `classifyCategory()`를 같이 맞춘다.

```
세차·클리닝
정비·소모품
실내·편의
전자·충전
안전
기타
```

---

## 6. GitHub · Vercel

- 배포 브랜치: `main`
- 원격은 `Car-Parts-Cpang`만. 다른 샵 레포에 push하지 않는다.
- Vercel은 **새 프로젝트**로 이 레포를 Import. `b-cat-cpang`·`surfwikikoreacpang`에 연결하지 않는다.
- jpg는 반드시 커밋한다. SVG 임시그림은 홈에서 걸러진다.

---

## 7. 하지 말 것

- 고양이·서핑 사진·JSON을 남긴 채 링크만 바꾸고 sync
- 쿠팡 상품 페이지를 Actions에서 크롤링
- 제휴 고지를 빼기
- 봇이 파트너스 단축링크를 만들게 하기 (시트에 직접 붙여 넣는다)
