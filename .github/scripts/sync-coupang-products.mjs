import fs from 'node:fs/promises';
import path from 'node:path';

const repo = process.cwd();
const sheetId = '1wU99mTHsdFaLqBalR8-pFQA9OvG2BbcDa69muJXNf4w';
const sheetTabs = ['광고용', 'Sheet1', 'Untitled', '시트1'];
const imageDir = path.join(repo, 'images', 'products');
const productsPath = path.join(repo, 'data', 'products.json');
const sheetExportPath = path.join(repo, 'data', 'sheet-update.csv');
const maxProducts = Number(process.env.MAX_PRODUCTS || 0);
const delayMs = Number(process.env.DELAY_MS || 1200);

await fs.mkdir(imageDir, { recursive: true });

const csv = await loadSheetCsv();
const rows = parseCsv(csv);
const headers = rows[0].map(value => value.trim().toLowerCase());
const index = name => headers.indexOf(name);
const linkIndex = firstIndex(index, ['쿠팡 파트너스 링크', '쿠팡파트너스 링크', '상품 링크']);
const categoryIndex = firstIndex(index, ['상황 태그', '카테고리']);
const titleIndex = firstIndex(index, ['상품명', '실제 상품명']);
const imageIndex = firstIndex(index, ['상품 이미지 url', '이미지 url']);
const descriptionIndex = firstIndex(index, ['상품 한줄설명', '상품 설명']);

const catalogOnly = process.argv.includes('--catalog-only');
const appsScriptUrl = '';
const flagsPath = path.join(repo, 'data', 'sheet-flags.json');
const failedPath = path.join(repo, 'data', 'scrape-failed.json');
const existing = await loadExistingProducts();
const failed = await loadFailedIds();

if (catalogOnly) {
  const current = [...existing.values()].sort((a, b) => a.id - b.id);
  await finalizeCatalog(current);
  process.exit(0);
}

const products = [];
const seen = new Set();
let scrapedCount = 0;

for (const row of rows.slice(1)) {
  const id = Number(row[0]);
  const link = (row[linkIndex] || '').trim().replace(/\/+$/, '');
  if (!id || !link || seen.has(link)) continue;
  seen.add(link);

  const previous = existing.get(id);
  const linkChanged = !previous || previous.product.coupangUrl !== link;
  let title = (row[titleIndex] || '').trim() || (linkChanged ? '' : previous?.product?.title) || '';
  let productId = linkChanged ? '' : previous?.product?.productId || '';
  let remoteImageUrl = (row[imageIndex] || '').trim();
  const sheetCategory = (row[categoryIndex] || '').replace(/^#/, '').trim();
  const sheetDescription = (row[descriptionIndex] || '').trim();
  const jpgPath = path.join(imageDir, `product-${String(id).padStart(3, '0')}.jpg`);
  let hasJpg = await fileExists(jpgPath);
  if (linkChanged && hasJpg) {
    await fs.unlink(jpgPath);
    hasJpg = false;
  }
  const needsTitle = linkChanged || !title || isFallbackTitle(title, id) || isWeakTitle(title);
  const needsImage = !hasJpg;

  let didScrape = false;
  if (needsImage || needsTitle) {
    if (maxProducts && scrapedCount >= maxProducts) break;
    scrapedCount += 1;
    didScrape = true;
    const scraped = await scrapeProduct(id, link, productId);
    if (scraped.title && !isBlockedTitle(scraped.title) && !isWeakTitle(scraped.title)) title = scraped.title;
    if (needsImage && scraped.imageUrl) remoteImageUrl = scraped.imageUrl;
    else if (needsImage) failed.add(id);
    if (scraped.productId) productId = scraped.productId;
  }

  if (!title || isBlockedTitle(title)) {
    title = previous?.product?.title && !isFallbackTitle(previous.product.title, id)
      ? previous.product.title
      : `자동차 용품 추천 ${id}`;
  }

  let imageUrl = hasJpg
    ? `./images/products/product-${String(id).padStart(3, '0')}.jpg`
    : `./images/products/product-${String(id).padStart(3, '0')}.svg`;

  if (needsImage && remoteImageUrl && !remoteImageUrl.startsWith('./')) {
    const saved = await downloadImage(remoteImageUrl, jpgPath, id);
    if (saved) imageUrl = `./images/products/product-${String(id).padStart(3, '0')}.jpg`;
    else failed.add(id);
  }

  if (imageUrl.endsWith('.svg')) {
    const svgPath = path.join(imageDir, `product-${String(id).padStart(3, '0')}.svg`);
    if (!(await fileExists(svgPath))) await fs.writeFile(svgPath, fallbackImage(id));
  }

  const category = classifyCategory(sheetCategory || previous?.category || '', title);
  const description = sheetDescription || previous?.description || categoryDescription(category);
  products.push({
    id,
    category,
    description,
    product: {
      title,
      coupangUrl: link,
      imageUrl,
      productId,
      sourceImageUrl: remoteImageUrl.startsWith('http') ? remoteImageUrl : ''
    }
  });

  if (didScrape || products.length % 15 === 0) await saveOutputs(products);
  const status = imageUrl.endsWith('.jpg') ? '사진' : '임시그림';
  console.log(`[${products.length}] ${id} ${status} ${title}`);
  if (didScrape) await sleep(delayMs);
}

await saveOutputs(products);
await fs.writeFile(failedPath, `${JSON.stringify([...failed].sort((a, b) => a - b), null, 2)}\n`);
const finalized = await finalizeCatalog(products.sort((a, b) => a.id - b.id));
const jpgCount = finalized.filter(item => item.product.imageUrl.endsWith('.jpg')).length;
console.log(`상품 ${finalized.length}개 동기화 완료. 실제 사진 ${jpgCount}개, 임시 그림 ${finalized.length - jpgCount}개.`);
console.log(`시트 붙여넣기 파일: ${path.relative(repo, sheetExportPath)}`);

async function finalizeCatalog(list) {
  const classified = list.map(item => {
    const rawTitle = item.product.title;
    const category = classifyCategory('', rawTitle);
    const title = displayTitle(rawTitle, item.id, category);
    return {
      ...item,
      category,
      description: categoryDescription(category),
      product: {
        ...item.product,
        title
      }
    };
  });

  for (const item of classified) {
    if (item.product.productId) continue;
    item.product.productId = await resolveProductId(item.product.coupangUrl);
    await sleep(120);
  }

  const { kept, duplicates } = dedupeProducts(classified);
  const missing = kept
    .filter(item => !item.product.imageUrl.endsWith('.jpg'))
    .map(item => item.id);
  await saveSiteProducts(kept, missing, duplicates);
  await notifyGoogleSheet(missing, duplicates);
  console.log(`중복 ${duplicates.length}개 삭제, 이미지 없음 ${missing.length}개 표시`);
  return kept;
}

function dedupeProducts(list) {
  const kept = [];
  const duplicates = [];
  const seenProduct = new Map();
  const seenTitle = new Map();

  for (const item of list) {
    const productId = item.product.productId || '';
    const title = item.product.title || '';
    const titleKey = isFallbackTitle(title, item.id) || isJunkTitle(title) ? '' : title;
    const prev = (productId && seenProduct.get(productId)) || (titleKey && seenTitle.get(titleKey));
    if (!prev) {
      kept.push(item);
      if (productId) seenProduct.set(productId, item);
      if (titleKey) seenTitle.set(titleKey, item);
      continue;
    }
    const prevHasPhoto = prev.product.imageUrl.endsWith('.jpg');
    const currHasPhoto = item.product.imageUrl.endsWith('.jpg');
    if (!prevHasPhoto && currHasPhoto) {
      duplicates.push(prev.id);
      const index = kept.indexOf(prev);
      if (index >= 0) kept[index] = item;
      if (productId) seenProduct.set(productId, item);
      if (titleKey) seenTitle.set(titleKey, item);
    } else {
      duplicates.push(item.id);
    }
  }
  return { kept, duplicates };
}

async function saveSiteProducts(list, missing, duplicates) {
  let previousFlags = { missing: [], duplicates: [] };
  try {
    previousFlags = JSON.parse(await fs.readFile(flagsPath, 'utf8'));
  } catch {}
  const keptIds = new Set(list.map(item => item.id));
  const mergedDuplicates = [...new Set([...(previousFlags.duplicates || []), ...duplicates])]
    .filter(id => !keptIds.has(id))
    .sort((a, b) => a - b);
  const mergedMissing = [...new Set([
    ...missing,
    ...(previousFlags.missing || []).filter(id => !list.some(item => item.id === id && item.product.imageUrl.endsWith('.jpg')))
  ])].sort((a, b) => a - b);
  const siteProducts = list.map(({ id, category, description, product }) => ({
    id,
    category,
    description,
    product: {
      title: product.title,
      coupangUrl: product.coupangUrl,
      imageUrl: product.imageUrl,
      productId: product.productId || ''
    }
  }));
  await writeFileRetry(productsPath, `${JSON.stringify(siteProducts, null, 2)}\n`);
  await writeFileRetry(flagsPath, `${JSON.stringify({ missing: mergedMissing, duplicates: mergedDuplicates }, null, 2)}\n`);
  const duplicateSet = new Set(mergedDuplicates);
  const missingSet = new Set(mergedMissing);
  const csvLines = [
    ['NO', '쿠팡 파트너스 링크', '상황 태그', '상품명', '상품 한줄설명', '상품 이미지 URL', '이미지 상태']
      .map(csvCell).join(','),
    ...list.map(item => [
      item.id,
      item.product.coupangUrl,
      item.category,
      item.product.title,
      item.description,
      item.product.sourceImageUrl || '',
      duplicateSet.has(item.id)
        ? '중복 상품 - 다른 링크로 교체 필요'
        : missingSet.has(item.id)
          ? '이미지 없음 - 링크 교체 필요'
          : '정상'
    ].map(csvCell).join(','))
  ];
  await fs.writeFile(sheetExportPath, `\ufeff${csvLines.join('\n')}\n`);
}

async function notifyGoogleSheet(missing, duplicates) {
  if (!appsScriptUrl) {
    console.log('Apps Script 웹앱 URL이 없어 시트 빨강 표시는 건너뜁니다.');
    return;
  }
  const url = `${appsScriptUrl}?action=mark&missing=${missing.join(',')}&duplicates=${duplicates.join(',')}`;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    console.log(`구글 시트 표시 결과: ${text.slice(0, 300)}`);
  } catch (error) {
    console.warn(`구글 시트 표시 실패: ${error.message}`);
  }
}

async function scrapeProduct(id, link, knownProductId = '') {
  try {
    const productId = knownProductId || await resolveProductId(link);
    if (!productId) {
      console.warn(`상품 ${id}: 쿠팡 상품번호를 찾지 못했습니다.`);
      return { title: '', imageUrl: '', productId: '' };
    }
    const html = await fetchText(`https://search.naver.com/search.naver?query=${encodeURIComponent(`${productId} 쿠팡`)}`);
    const parsed = parseNaverResult(html, productId);
    console.log(`상품 ${id} productId=${productId} 제목=${parsed.title || '-'} 이미지=${parsed.imageUrl ? '있음' : '없음'}`);
    return { ...parsed, productId };
  } catch (error) {
    console.warn(`상품 ${id} 수집 실패: ${error.message}`);
    return { title: '', imageUrl: '', productId: knownProductId || '' };
  }
}

async function resolveProductId(link) {
  let url = link;
  for (let i = 0; i < 8; i++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: requestHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    const location = response.headers.get('location');
    if (!location) break;
    url = new URL(location, url).href;
    const productId = url.match(/\/vp\/products\/(\d+)/)?.[1] || url.match(/[?&]ctag=(\d+)/)?.[1];
    if (productId) return productId;
  }
  return '';
}

function parseNaverResult(html, productId) {
  const decoded = html
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');

  let imageUrl = '';
  for (const match of decoded.matchAll(/[?&]src=(https?[^"'&]+)/g)) {
    const src = decodeURIComponent(match[1]);
    if (/coupangcdn\.com/i.test(src)) {
      imageUrl = src.split('&')[0];
      break;
    }
  }
  if (!imageUrl) {
    const encoded = decoded.match(/https%3A%2F%2Fthumbnail\.coupangcdn\.com[^"'&]+/i);
    if (encoded) imageUrl = decodeURIComponent(encoded[0]).split('&')[0];
  }
  if (!imageUrl) {
    const direct = decoded.match(/https:\/\/thumbnail\.coupangcdn\.com\/[^"'\s<>]+/i);
    if (direct) imageUrl = decodeURIComponent(direct[0]).split('&')[0];
  }

  const skip = /네이버|검색|새 창|쿠팡!|로그인|열림|더보기|블로그|카페|뉴스|Access Denied|http|쿠스피|추세|가격 데이터|총 중량|주원료|대상연령|식품 기능|도착 보장|광고|판매자|리뷰|찜하기|장바구니|메뉴 영역|본문 영역|웨일|Keep에|포셀|실시간 데이터|순위 보드|데이터가 없습니다|놓치지 마세요|최저가 알림|브라우저를 업데이트|태그 하나로|오늘의 경험|이번 달 참여|추가적립|멤버십|개인정보|법적고지|정보를 가져오는|죄송합니다|참여$|가격비교|쿠프라이스|쇼핑몰 마케팅|카테고리 실시간|리뷰 증가|순위 상승|오늘 순위/i;
  const scored = [];
  const chunks = decoded.includes(`products/${productId}`)
    ? decoded.split(`products/${productId}`).slice(1, 8)
    : [decoded];
  for (const chunk of chunks) {
    const candidates = [...chunk.matchAll(/>([^<]{8,140})</g)]
      .map(match => match[1].replace(/\s+/g, ' ').trim())
      .map(text => text.replace(/할인\d[\s\S]*$/, '').replace(/내일\([^)]*\)[\s\S]*$/, '').trim());
    for (const text of candidates) {
      if (text.length < 8 || text.length > 90 || !/[가-힣]{2,}/.test(text) || skip.test(text)) continue;
      let score = 0;
      if (/세차|카샴푸|와이퍼|워셔|필터|디퓨저|거치대|시거잭|하이패스|삼각대|해머|타월|유리|휠|실내|충전|목쿠션|햇빛|도어가드|트렁크|청소기/.test(text)) score += 6;
      if (/,\s*\d+\s*개/.test(text)) score += 4;
      if (text.length >= 16) score += 2;
      if (/가격비교|최저가 \d/.test(text)) score -= 4;
      if (score > 0) scored.push({ text, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
  return { title: scored[0]?.text || '', imageUrl };
}

async function downloadImage(imageUrl, jpgPath, id) {
  try {
    const absoluteImageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
    const response = await fetch(absoluteImageUrl, {
      headers: { ...requestHeaders(), Referer: 'https://www.coupang.com/' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return false;
    const imageBody = Buffer.from(await response.arrayBuffer());
    if (!imageBody || imageBody.length < 2000) return false;
    await fs.writeFile(jpgPath, imageBody);
    return true;
  } catch (error) {
    console.warn(`상품 ${id} 이미지 저장 실패: ${error.message}`);
    return false;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: requestHeaders(),
    signal: AbortSignal.timeout(15000)
  });
  return response.text();
}

function requestHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
  };
}

async function saveOutputs(list) {
  const merged = new Map(existing);
  for (const item of list) merged.set(item.id, item);
  const ordered = [...merged.values()].sort((a, b) => a.id - b.id);
  const siteProducts = ordered.map(({ id, category, description, product }) => ({
    id,
    category,
    description,
    product: {
      title: product.title,
      coupangUrl: product.coupangUrl,
      imageUrl: product.imageUrl,
      productId: product.productId || ''
    }
  }));
  await writeFileRetry(productsPath, `${JSON.stringify(siteProducts, null, 2)}\n`);
  const csvLines = [
    ['NO', '쿠팡 파트너스 링크', '상황 태그', '상품명', '상품 한줄설명', '상품 이미지 URL', '이미지 상태']
      .map(csvCell).join(','),
    ...ordered.map(item => [
      item.id,
      item.product.coupangUrl,
      item.category,
      item.product.title,
      item.description,
      item.product.sourceImageUrl || '',
      item.product.imageUrl.endsWith('.jpg') ? 'GitHub 저장 완료' : '사진 수집 실패'
    ].map(csvCell).join(','))
  ];
  await fs.writeFile(sheetExportPath, `\ufeff${csvLines.join('\n')}\n`);
}

async function loadSheetCsv() {
  const localPath = process.env.SHEET_CSV_PATH || path.join(repo, 'data', 'sheet-source.csv');
  for (const tab of sheetTabs) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const text = await response.text();
      if (looksLikeCsv(text)) {
        console.log(`공개 CSV: 탭 '${tab}'`);
        return text;
      }
      console.warn(`탭 '${tab}' CSV 실패 (HTTP ${response.status})`);
    } catch (error) {
      console.warn(`탭 '${tab}' 요청 실패: ${error.message}`);
    }
  }

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    if (looksLikeCsv(text)) {
      console.log('공개 CSV: gid=0 export');
      return text;
    }
  } catch (error) {
    console.warn(`gid=0 export 실패: ${error.message}`);
  }

  if (await fileExists(localPath)) {
    console.log(`공개 시트가 잠겨 있어 로컬 CSV를 사용합니다: ${path.relative(repo, localPath)}`);
    return await fs.readFile(localPath, 'utf8');
  }

  throw new Error('시트 CSV를 가져오지 못했습니다. 시트를 웹에 게시하거나 data/sheet-source.csv를 두세요.');
}

function looksLikeCsv(text) {
  if (!text || /^\s*</.test(text) || /accounts\.google|Sign in|Access Denied/i.test(text)) return false;
  const first = text.split(/\r?\n/).find(line => line.trim()) || '';
  return /쿠팡|상품|링크|no/i.test(first);
}

async function loadExistingProducts() {
  try {
    const parsed = JSON.parse(await fs.readFile(productsPath, 'utf8'));
    return new Map(parsed.map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

async function loadFailedIds() {
  try {
    const parsed = JSON.parse(await fs.readFile(failedPath, 'utf8'));
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function isBlockedTitle(value) {
  return /access denied|error|쿠팡이 추천하는|접근이 거부|blocked/i.test(value || '');
}

function isFallbackTitle(value, id) {
  return value === `자동차 용품 추천 ${id}`;
}

function isWeakTitle(value) {
  return /^(자동차 용품|서핑 용품|고양이 용품|쇼핑|쿠팡|상품)$/.test(value || '')
    || /쿠스피|가격 데이터|총 중량|주원료|도착 보장|^Keep에/.test(value || '')
    || isJunkTitle(value);
}

function isJunkTitle(value) {
  return /지식iN|모래요 여러분|궁금한 것은|유사한 상품을 노출|소재: 합성섬유|사용대상 구분|서프코코스|웻슈트|래시가드|캣타워|츄르|로얄캐닌|숨숨집/.test(value || '');
}

function displayTitle(raw, id, category) {
  const cleaned = sanitizeTitle(raw);
  if (cleaned && !isJunkTitle(cleaned) && !isWeakTitle(cleaned)) return cleaned;
  if (category && category !== '기타') return `${category} 추천`;
  return `자동차 용품 추천 ${id}`;
}

function sanitizeTitle(title) {
  return String(title || '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^\]+/, '')
    .replace(/^추천이런건 어때요\?\s*;\s*/, '')
    .replace(/\s*상품 정보[—\-].*$/, '')
    .replace(/\s*\(\s*\d{1,3}(?:,\d{3})*원[^)]*\)\s*\d*$/g, '')
    .replace(/\s*\d{1,3}(?:,\d{3})*원.*$/g, '')
    .replace(/무료배송|로켓배송|쿠폰할인/g, '')
    .replace(/(\d개)할인/g, '$1')
    .replace(/할인\d+%/g, '')
    .replace(/\(1개당.*$/g, '')
    .replace(/\d+%[\d,]*(?:\(10g당.*)?$/g, '')
    .replace(/(\S)\d{1,3}(?:,\d{3})+$/g, '$1')
    .replace(/(\d(?:\.\d)?L)\d[\d,]*/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\d{2,3},\d{3}.*$/, '')
    .replace(/[\d$Hw%,]+\d{2,}$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeFileRetry(filePath, contents, attempts = 8) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.writeFile(filePath, contents);
      return;
    } catch (error) {
      lastError = error;
      await sleep(500 * (i + 1));
    }
  }
  throw lastError;
}

function firstIndex(indexer, names) {
  for (const name of names) {
    const value = indexer(name.toLowerCase());
    if (value >= 0) return value;
  }
  return -1;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }

  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function fallbackImage(id) {
  const hue = (id * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue},18%,92%)"/><stop offset="1" stop-color="hsl(${(hue + 20) % 360},22%,62%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><rect x="220" y="180" width="360" height="200" rx="28" fill="#fff" opacity=".72"/><path d="M250 320h300M280 250h80v40h140v-40h80" stroke="#1e293b" stroke-width="10" fill="none"/><circle cx="330" cy="360" r="28" fill="#1e293b"/><circle cx="470" cy="360" r="28" fill="#1e293b"/><text x="400" y="535" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="#1e293b">CAR GOODS ${id}</text></svg>`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function classifyCategory(value, title) {
  if (value && value !== '기타') return value;
  const text = `${value} ${title}`.toLowerCase();
  if (/삼각대|해머|비상|탈출|소화기|안전벨트|경고등|구명/.test(text)) return '안전';
  if (/거치대|맥세이프|시거잭|충전기|하이패스|청소기|블랙박스|케이블|usb/.test(text)) return '전자·충전';
  if (/디퓨저|방향제|목쿠션|햇빛|가리개|도어가드|문콕|틈새|트렁크|정리함|주차|번호판|방석/.test(text)) return '실내·편의';
  if (/와이퍼|워셔|필터|불스원샷|첨가제|엔진오일|소모품/.test(text)) return '정비·소모품';
  if (/세차|샴푸|타월|드라잉|유리|유막|휠세정|실내세정|클리닝/.test(text)) return '세차·클리닝';
  return '기타';
}

function categoryDescription(category) {
  return {
    '세차·클리닝': '셀프 세차와 유리·휠·실내를 닦는 용품입니다.',
    '정비·소모품': '와이퍼·워셔액·필터처럼 주기적으로 갈아 주는 소모품입니다.',
    '실내·편의': '향, 햇빛, 수납처럼 타고 내릴 때 편한 실내용품입니다.',
    '전자·충전': '거치·충전·하이패스처럼 전자 장비를 쓰는 칸입니다.',
    안전: '정차와 비상 탈출에 필요한 안전 용품입니다.',
    기타: '차에 유용한 추천 용품입니다.'
  }[category] || '자동차를 위한 추천 용품입니다.';
}
