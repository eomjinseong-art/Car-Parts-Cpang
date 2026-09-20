(function () {
  const $ = id => document.getElementById(id);
  const PLACEHOLDER = '../images/placeholder.svg';
  const SURF_CAT = '';
  function articleSlug() {
    const last = (location.pathname.split('/').filter(Boolean).pop() || '').replace(/\.html$/, '');
    if (last && last !== 'article' && last !== 'wiki') return last;
    return decodeURIComponent(location.hash.replace(/^#/, ''))
      || new URLSearchParams(location.search).get('slug')
      || '';
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
  function uniqueProducts(list) {
    const seen = new Set();
    return list.filter(item => {
      const title = item.product?.title || '';
      const key = item.product?.productId
        || (!/^자동차 용품 추천 /.test(title) && title)
        || item.product?.coupangUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function catalogReady(item) {
    return item.product?.imageUrl?.endsWith('.jpg') && !/^자동차 용품 추천 /.test(item.product.title || '');
  }
  function imageSrc(item) {
    const url = item.product.imageUrl || '';
    return url.startsWith('./') ? '../' + url.slice(2) : url;
  }
  function slugify(text) {
    return String(text).trim().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '').toLowerCase() || 's';
  }
  function parseMarkdown(raw) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    return match ? match[2] : raw;
  }
  function rewriteLinks(body, wikiSlugs, blog) {
    return body.replace(/\]\(\/guides\/([a-z0-9-]+)\)/g, (_, dest) => {
      if (wikiSlugs.has(dest)) return `](./${dest}.html)`;
      return `](${blog})`;
    });
  }
  function highlightNav(isSurf) {
    const gear = $('navGear');
    const surf = $('navSurf');
    if (!gear || !surf) return;
    gear.className = isSurf ? 'pb-1 text-neutral-400 hover:text-black' : 'border-b border-black pb-1 text-black';
    surf.className = isSurf ? 'border-b border-black pb-1 text-black' : 'pb-1 text-neutral-400 hover:text-black';
  }
  const slug = articleSlug();
  fetch('../data/config.json').then(r => r.json()).then(config => {
    $('headerLink').href = config.featuredLink;
    $('headerLink').textContent = config.featuredLabel;
    if (config.rocketWowLink && $('footerWow')) $('footerWow').href = config.rocketWowLink;
    if (config.carSearchLink && $('footerStay')) $('footerStay').href = config.carSearchLink;
    if (config.archiveLink && $('footerArchive')) $('footerArchive').href = config.archiveLink;
    if (config.blogLink && $('headerBlog')) $('headerBlog').href = config.blogLink;
    if (config.blogLink && $('footerBlog')) $('footerBlog').href = config.blogLink;
    if (config.blogLabel && $('headerBlog')) $('headerBlog').textContent = config.blogLabel;
    if (config.blogLabel && $('footerBlog')) $('footerBlog').textContent = config.blogLabel;
  }).catch(() => {});
  Promise.all([
    fetch('./guides.json').then(r => r.json()),
    fetch(`./content/${encodeURIComponent(slug)}.md`).then(r => {
      if (!r.ok) throw new Error('missing');
      return r.text();
    })
  ]).then(([data, raw]) => {
    const guide = (data.guides || []).find(item => item.slug === slug);
    if (!guide) throw new Error('unknown');
    const wikiSlugs = new Set((data.guides || []).map(item => item.slug));
    const blog = data.blog || '../';
    const isSurf = false;
    const sectionLabel = '용품가이드';
    document.title = `${guide.title} | ${sectionLabel}`;
    const meta = $('metaDesc');
    if (meta) meta.setAttribute('content', guide.description);
    if ($('crumbHome')) {
      $('crumbHome').textContent = sectionLabel;
      $('crumbHome').href = isSurf ? './?cat=서핑 입문' : './';
    }
    $('crumbCat').textContent = `· ${guide.wikiCategory}`;
    $('pageTitle').textContent = guide.title;
    $('pageDesc').textContent = guide.description;
    $('pageMeta').textContent = `읽는 시간 약 ${guide.readMinutes}분`;
    $('disclaimer').textContent = data.disclaimer || '';
    highlightNav(isSurf);
    marked.setOptions({ gfm: true, breaks: false });
    $('content').innerHTML = marked.parse(rewriteLinks(parseMarkdown(raw), wikiSlugs, blog));
    const used = new Set();
    $('content').querySelectorAll('h2, h3').forEach((heading, index) => {
      let id = slugify(heading.textContent);
      if (used.has(id)) id = `${id}-${index}`;
      used.add(id);
      heading.id = id;
    });
    const headings = [...$('content').querySelectorAll('h2, h3')];
    if (!headings.length) {
      $('tocBox').classList.add('hidden');
    } else {
      let h2 = 0, h3 = 0;
      $('toc').innerHTML = headings.map(heading => {
        if (heading.tagName === 'H2') { h2 += 1; h3 = 0; }
        else { h3 += 1; }
        const num = heading.tagName === 'H2' ? `${h2}` : `${h2}.${h3}`;
        const pad = heading.tagName === 'H3' ? 'pl-4 text-neutral-500' : 'font-medium text-neutral-800';
        return `<a class="block py-0.5 ${pad} hover:text-black" href="#${heading.id}">${num} ${escapeHtml(heading.textContent)}</a>`;
      }).join('');
      $('tocBox').open = window.matchMedia('(min-width: 1024px)').matches;
    }
    return fetch('../data/products.json').then(r => r.json()).then(products => {
      const catalog = uniqueProducts(products).filter(catalogReady);
      const groups = (guide.productCategories || []).map(category => ({
        category,
        items: catalog.filter(item => item.category === category).slice(0, 4)
      })).filter(group => group.items.length);
      if (!groups.length) return;
      $('related').classList.remove('hidden');
      $('relatedGroups').innerHTML = groups.map(group =>
        `<div><h3 class="mb-3 text-[12px] font-medium tracking-wide text-neutral-400">${escapeHtml(group.category)}</h3><div class="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4">${group.items.map(item =>
          `<a href="${escapeHtml(item.product.coupangUrl)}" target="_blank" rel="noopener sponsored" class="text-left"><img src="${escapeHtml(imageSrc(item))}" alt="${escapeHtml(item.product.title)}" class="aspect-square w-full object-cover" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"><div class="pt-2"><span class="text-[10px] font-medium tracking-wide text-neutral-400">${escapeHtml(item.category || '추천')}</span><h3 class="mt-1 line-clamp-2 text-[12px] font-medium leading-5">${escapeHtml(item.product.title)}</h3><p class="mt-1 line-clamp-2 text-[11px] leading-4 text-neutral-500">${escapeHtml(item.description || item.product.description || '자동차를 위한 추천 용품')}</p></div></a>`
        ).join('')}</div></div>`
      ).join('');
    });
  }).catch(() => {
    $('pageTitle').textContent = '글을 찾지 못했습니다';
    $('pageDesc').textContent = '가이드 목록으로 돌아가 다른 글을 골라 주세요.';
    $('content').innerHTML = '<p><a href="./">가이드 목록으로</a></p>';
    $('tocBox').classList.add('hidden');
  });
  if (!document.getElementById('visit-counter-script')) {
    const script = document.createElement('script');
    script.id = 'visit-counter-script';
    script.src = '../visits.js';
    document.body.appendChild(script);
  }
})();
