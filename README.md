# 오토픽스 (Autopicks)

자동차 용품 쿠팡 파트너스 큐레이션 샵.

세차·클리닝, 정비 소모품, 실내 편의, 전자·충전, 안전 용품을 한곳에서 비교합니다.

- 사이트: 정적 HTML (`index.html` + `data/products.json`)
- 배포: GitHub `main` → Vercel
- 상품 원장: 구글 시트 `광고용` 탭
- 운영: [PLAYBOOK.md](./PLAYBOOK.md)
- 영국차 아카이브: [영국차아카이브](https://british-motors.vercel.app/)

파트너스 단축링크(`https://link.coupang.com/a/...`)를 시트에 붙여 넣은 뒤 로컬에서 `npm run sync` 하면 상품명·사진이 갱신됩니다. 지금은 검색 URL과 JPG 플레이스홀더로 홈이 먼저 보이게 되어 있습니다.
