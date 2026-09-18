import { appendFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const sheetId = '1wU99mTHsdFaLqBalR8-pFQA9OvG2BbcDa69muJXNf4w';
const sheetTabs = ['광고용', 'Sheet1', 'Untitled', '시트1'];
const csv = await loadSheetCsv();
const rows = parseCsv(csv);
const headers = rows[0].map(header => header.trim().toLowerCase());
const linkIndex = headers.indexOf('쿠팡 파트너스 링크');
const titleIndex = headers.indexOf('상품명') >= 0 ? headers.indexOf('상품명') : headers.indexOf('실제 상품명');
const links = new Map();

for (const row of rows.slice(1)) {
  const link = (row[linkIndex] || '').trim().replace(/\/+$/, '');
  if (link && !links.has(link)) links.set(link, row[titleIndex] || '(상품명 없음)');
}

const failures = [];
for (const [link, title] of links) {
  try {
    const response = await fetch(link, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
    const location = response.headers.get('location') || '';
    const ok = response.status < 400
      || (response.status >= 300 && response.status < 400 && /coupang\.com/i.test(location));
    if (!ok) {
      failures.push(`${response.status} | ${title} | ${link}`);
    }
  } catch (error) {
    failures.push(`NETWORK | ${title} | ${link} | ${error.message}`);
  }
}

if (failures.length) {
  const report = `문제 링크 ${failures.length}개 / 중복 제거 후 검사 ${links.size}개\n${failures.join('\n')}`;
  process.stdout.write(report);
  await writeOutput('report', report);
  process.exitCode = 1;
} else {
  console.log(`OK: 중복 제거 후 ${links.size}개 링크가 정상 응답했습니다.`);
}

async function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
  }
}

async function loadSheetCsv() {
  const localPath = process.env.SHEET_CSV_PATH || path.join(process.cwd(), 'data', 'sheet-source.csv');
  for (const tab of sheetTabs) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const text = await response.text();
      if (looksLikeCsv(text)) return text;
    } catch {}
  }
  try {
    await access(localPath);
    return await readFile(localPath, 'utf8');
  } catch {
    throw new Error('시트 CSV를 가져오지 못했습니다. data/sheet-source.csv를 두세요.');
  }
}

function looksLikeCsv(text) {
  if (!text || /^\s*</.test(text) || /accounts\.google|Sign in|Access Denied/i.test(text)) return false;
  const first = text.split(/\r?\n/).find(line => line.trim()) || '';
  return /쿠팡|상품|링크|no/i.test(first);
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && input[i + 1] === '"' && quoted) {
      value += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value);
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}
