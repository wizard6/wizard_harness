(function () {
  const WHEEL_MS = 480;

  function boot() {
    const wrap = document.querySelector('.wrap');
    if (!wrap || document.querySelector('.win')) return;

    const header = wrap.querySelector('header');
    const kicker = header?.querySelector('.kicker')?.textContent?.trim() || 'meta-doc';
    const title = header?.querySelector('h1')?.textContent?.trim() || document.title;
    const ledeHtml = header?.querySelector('.lede')?.innerHTML;
    const nav = header?.querySelector('nav');

    const desk = el('div', 'desk');
    const win = el('div', 'win');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', title);

    const bar = el('div', 'win-bar');
    const dots = el('div', 'dots');
    dots.innerHTML = '<i></i><i></i><i></i>';
    const tbox = el('div', 'win-title');
    tbox.innerHTML = '<div class="kicker"></div><h1></h1>';
    tbox.querySelector('.kicker').textContent = kicker;
    tbox.querySelector('h1').textContent = title;
    bar.append(dots, tbox);
    if (nav) bar.append(nav);

    const main = el('div', 'win-main');
    const toc = el('aside', 'toc');
    toc.setAttribute('aria-label', '章节');
    const pane = el('div', 'pane');
    const page = el('div', 'page');
    pane.append(page);
    main.append(toc, pane);

    const foot = el('div', 'win-foot');
    const prev = el('button');
    prev.type = 'button';
    prev.textContent = '上一页';
    const pager = el('div', 'pager');
    const next = el('button');
    next.type = 'button';
    next.textContent = '下一页';
    foot.append(prev, pager, next);

    win.append(bar, main, foot);
    desk.append(win);

    if (header) header.remove();
    const leftover = [...wrap.childNodes].filter(keepNode);
    wrap.remove();
    document.body.replaceChildren(desk);

    const sections = splitSections(leftover, ledeHtml);
    let slides = [];
    let index = 0;
    let wheelAt = 0;

    function rebuild() {
      const keepTitle = slides[index]?.title;
      const keepPart = slides[index]?.part || 0;
      slides = [];
      for (const sec of sections) {
        const chunks = fitChunks(sec.nodes.map(cloneNode), pane, page);
        chunks.forEach((nodes, part) => {
          slides.push({
            title: sec.title,
            secId: sec.id,
            part,
            parts: chunks.length,
            nodes,
          });
        });
      }
      if (!slides.length) {
        slides = [{ title: '空', secId: 'empty', part: 0, parts: 1, nodes: [] }];
      }
      let nextIndex = slides.findIndex((s) => s.title === keepTitle && s.part === keepPart);
      if (nextIndex < 0) nextIndex = slides.findIndex((s) => s.title === keepTitle);
      index = Math.max(0, nextIndex);
      renderToc();
      show(index, false);
    }

    function renderToc() {
      toc.replaceChildren();
      const seen = new Set();
      for (const s of slides) {
        if (seen.has(s.secId)) continue;
        seen.add(s.secId);
        const b = el('button');
        b.type = 'button';
        b.dataset.sec = s.secId;
        b.textContent = s.title;
        b.addEventListener('click', () => {
          show(slides.findIndex((x) => x.secId === s.secId));
        });
        toc.append(b);
      }
    }

    function show(i, focusPane = true) {
      index = Math.max(0, Math.min(slides.length - 1, i));
      const s = slides[index];
      page.classList.remove('scroll-island');
      page.replaceChildren(...s.nodes);
      if (page.scrollHeight > pane.clientHeight + 2) page.classList.add('scroll-island');
      const label = s.parts > 1 ? `${s.title} · ${s.part + 1}/${s.parts}` : s.title;
      pager.textContent = `${index + 1} / ${slides.length}　${label}`;
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
      toc.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.dataset.sec === s.secId);
      });
      if (focusPane) pane.focus({ preventScroll: true });
    }

    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    document.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        show(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        show(index - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        show(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        show(slides.length - 1);
      }
    });
    pane.tabIndex = 0;
    pane.addEventListener(
      'wheel',
      (e) => {
        if (page.classList.contains('scroll-island')) {
          const atTop = page.scrollTop <= 0;
          const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 1;
          if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
        }
        e.preventDefault();
        const now = Date.now();
        if (now - wheelAt < WHEEL_MS) return;
        if (Math.abs(e.deltaY) < 18 && Math.abs(e.deltaX) < 18) return;
        wheelAt = now;
        const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        show(index + (delta > 0 ? 1 : -1));
      },
      { passive: false },
    );

    requestAnimationFrame(() => requestAnimationFrame(rebuild));
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuild, 120);
    });
  }

  function keepNode(n) {
    if (n.nodeType === 1) return true;
    return n.nodeType === 3 && n.textContent.trim().length > 0;
  }

  function cloneNode(n) {
    return n.cloneNode(true);
  }

  function splitSections(nodes, ledeHtml) {
    const sections = [];
    let current = { id: 'overview', title: '概述', nodes: [] };
    if (ledeHtml) {
      const p = el('p', 'lede');
      p.innerHTML = ledeHtml;
      current.nodes.push(p);
    }
    for (const node of nodes) {
      if (node.nodeType === 1 && node.tagName === 'H2') {
        if (current.nodes.length) sections.push(current);
        const title = (node.textContent || '未命名').replace(/\s+/g, ' ').trim();
        current = { id: 's' + sections.length, title, nodes: [node] };
      } else {
        current.nodes.push(node);
      }
    }
    if (current.nodes.length) sections.push(current);
    const first = sections[0];
    if (
      sections.length > 1 &&
      first?.id === 'overview' &&
      first.nodes.length === 1 &&
      first.nodes[0].classList?.contains('lede')
    ) {
      const intro = sections.shift();
      sections[0].nodes.unshift(...intro.nodes);
    }
    return sections;
  }

  function fitChunks(source, pane, page) {
    const nodes = source.filter(keepNode);
    if (!nodes.length) return [[]];
    const chunks = [];
    let i = 0;
    while (i < nodes.length) {
      page.classList.remove('scroll-island');
      page.replaceChildren();
      const chunk = [];
      while (i < nodes.length) {
        const node = nodes[i];
        page.append(node);
        const overflow = page.scrollHeight > pane.clientHeight + 2;
        if (overflow && chunk.length === 0 && node.tagName === 'TABLE') {
          page.removeChild(node);
          const tables = splitTable(node, pane, page);
          nodes.splice(i, 1, ...tables);
          continue;
        }
        if (overflow && chunk.length) {
          page.removeChild(node);
          break;
        }
        chunk.push(node);
        i += 1;
        if (overflow) break;
      }
      chunks.push(chunk);
    }
    page.replaceChildren();
    return chunks;
  }

  function splitTable(table, pane, page) {
    const head = table.querySelector('thead');
    const rows = [...(table.querySelector('tbody') || table).querySelectorAll(':scope > tr')];
    if (!rows.length) return [table];
    const out = [];
    let i = 0;
    while (i < rows.length) {
      const copy = document.createElement('table');
      if (head) copy.append(head.cloneNode(true));
      const body = document.createElement('tbody');
      copy.append(body);
      page.replaceChildren(copy);
      const used = [];
      while (i < rows.length) {
        body.append(rows[i]);
        if (page.scrollHeight > pane.clientHeight + 2 && used.length) {
          body.removeChild(rows[i]);
          break;
        }
        used.push(rows[i]);
        i += 1;
      }
      out.push(copy);
    }
    page.replaceChildren();
    return out.length ? out : [table];
  }

  function el(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
