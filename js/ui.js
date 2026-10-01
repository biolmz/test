/* ═══════════════════════════════════════════════════════════
   FigForge · UI 组件  (js/ui.js)
   属性面板生成器 / 弹出菜单 / 模态框 / 提示条
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const CG = global.CG || (global.CG = {});
  const U = {};

  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  U.h = h;
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  U.esc = esc;

  /* ═════════ Toast ═════════ */
  U.toast = function (msg, kind, ms) {
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) return;
    const t = h('div', 'toast' + (kind ? ' ' + kind : ''));
    const ic = h('span', 'ic', kind === 'err' ? '✕' : kind === 'ok' ? '✓' : 'ⓘ');
    t.appendChild(ic);
    t.appendChild(h('span', '', msg));
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 260);
    }, ms || (kind === 'err' ? 3600 : 2100));
  };

  /* ═════════ 弹出菜单 ═════════ */
  let pmOpen = null;
  const pmMain = () => document.getElementById('popmenu');
  const pmSub = () => document.getElementById('popmenu-sub');

  U.closePopmenu = function () {
    [pmMain(), pmSub()].forEach(pm => {
      if (pm) { pm.hidden = true; pm.innerHTML = ''; pm.classList.remove('wide'); }
    });
    document.querySelectorAll('.dropdown-btn.open').forEach(b => b.classList.remove('open'));
    pmOpen = null;
  };

  /** 把菜单塞进指定容器；item 结构见 U.popmenu 注释 */
  function fillMenu(pm, items, opt) {
    pm.innerHTML = '';
    if (opt && opt.wide) pm.classList.add('wide');
    items.forEach(it => {
      if (it.sep) { pm.appendChild(h('div', 'pm-sep')); return; }
      if (it.title) { pm.appendChild(h('div', 'pm-title', it.title)); return; }
      const row = h('div', 'pm-item' + (it.on ? ' on' : '') + (it.dis ? ' dis' : ''));
      if (it.icon) {
        const sp = h('span', 'pm-ico');
        sp.innerHTML = it.icon;
        row.appendChild(sp);
      }
      row.appendChild(h('span', '', it.label));
      if (it.desc) row.appendChild(h('span', 'pm-desc', it.desc));
      if (it.sub && it.sub.length) {
        row.appendChild(h('span', 'pm-arrow', '›'));
        // 悬停展开二级菜单；点一下也行（触屏没有 hover）
        const openSub = () => {
          const sub = pmSub();
          fillMenu(sub, it.sub, {});
          sub.hidden = false;
          const r = row.getBoundingClientRect();
          const w = sub.offsetWidth, hh = sub.offsetHeight;
          let x = r.right + 2;
          if (x + w > window.innerWidth - 8) x = Math.max(8, r.left - w - 2);
          let y = r.top - 5;
          if (y + hh > window.innerHeight - 8) y = Math.max(8, window.innerHeight - hh - 8);
          if (y < 8) y = 8;
          sub.style.left = x + 'px';
          sub.style.top = y + 'px';
        };
        row.addEventListener('mouseenter', openSub);
        row.addEventListener('click', (e) => { e.stopPropagation(); openSub(); });
      } else {
        // 移到别的主项上就收起二级菜单
        row.addEventListener('mouseenter', () => { const s = pmSub(); if (s) s.hidden = true; });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.dis) return;
          U.closePopmenu();
          if (it.onClick) it.onClick();
        });
      }
      pm.appendChild(row);
    });
  }

  /**
   * @param {HTMLElement|null} anchor 锚点元素；传 null 表示用 opt.at 定位（右键菜单）
   * @param {Array} items [{label, desc, on, icon, onClick, sep:true, title, sub:[...]}]
   * @param {object} opt {wide, align, at:{x,y}}
   */
  U.popmenu = function (anchor, items, opt) {
    opt = opt || {};
    const pm = pmMain();
    // 右键菜单每次都在新位置，不做「再点一次收起」的切换
    if (!opt.at && pmOpen === anchor && !pm.hidden) { U.closePopmenu(); return; }
    U.closePopmenu();
    fillMenu(pm, items, opt);
    pm.hidden = false;
    const w = pm.offsetWidth, hh = pm.offsetHeight;
    if (opt.at) {
      let left = opt.at.x, top = opt.at.y;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
      if (left < 8) left = 8;
      if (top + hh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - hh - 8);
      pm.style.left = left + 'px';
      pm.style.top = top + 'px';
    } else {
      const r = anchor.getBoundingClientRect();
      let left = opt.align === 'right' ? r.right - w : r.left;
      let top = r.bottom + 4;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      if (top + hh > window.innerHeight - 8) top = Math.max(8, r.top - hh - 4);
      pm.style.left = left + 'px';
      pm.style.top = top + 'px';
    }
    if (anchor && anchor.classList) anchor.classList.add('open');
    pmOpen = anchor;
  };
  document.addEventListener('mousedown', (e) => {
    const pm = pmMain();
    if (!pm || pm.hidden) return;
    if (pm.contains(e.target)) return;
    const sub = pmSub();
    if (sub && !sub.hidden && sub.contains(e.target)) return;
    if (pmOpen && pmOpen.contains && pmOpen.contains(e.target)) return;
    U.closePopmenu();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') U.closePopmenu(); });

  /* ═════════ 模态框 ═════════ */
  U.modal = function (opt) {
    const root = document.getElementById('modal-root');
    root.hidden = false;
    root.innerHTML = '';
    const box = h('div', 'modal');
    const head = h('div', 'modal-head');
    head.appendChild(h('h3', '', opt.title || ''));
    const close = h('button', 'modal-close', '×');
    close.type = 'button';
    head.appendChild(close);
    box.appendChild(head);
    const body = h('div', 'modal-body');
    box.appendChild(body);
    const foot = h('div', 'modal-foot');
    box.appendChild(foot);
    root.appendChild(box);

    let done = false;
    function shut(val) {
      if (done) return;
      done = true;
      root.hidden = true;
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (opt.onClose) opt.onClose(val);
    }
    close.addEventListener('click', () => shut(null));
    root.addEventListener('mousedown', (e) => { if (e.target === root) shut(null); });
    function onKey(e) {
      if (e.key === 'Escape') shut(null);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const prim = foot.querySelector('.btn-primary');
        if (prim) prim.click();
      }
    }
    document.addEventListener('keydown', onKey);

    (opt.buttons || [{ label: '关闭' }]).forEach(b => {
      const btn = h('button', 'btn' + (b.primary ? ' btn-primary' : ''), b.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (b.onClick) {
          const r = b.onClick(body, shut);
          if (r === false) return;
        }
        if (b.keepOpen) return;
        shut(true);
      });
      foot.appendChild(btn);
    });
    if (opt.build) opt.build(body, shut);
    return { body, close: shut, footer: foot };
  };

  /** 简单确认框 */
  U.confirm = function (msg, opt) {
    opt = opt || {};
    return new Promise(resolve => {
      U.modal({
        title: opt.title || '确认',
        build(b) { b.appendChild(h('div', 'note-card', msg)); },
        buttons: [
          { label: opt.cancelText || '取消', onClick: () => resolve(false) },
          { label: opt.okText || '确定', primary: true, onClick: () => resolve(true) }
        ],
        onClose: () => resolve(false)
      });
    });
  };

  /* ═════════ 输入对话框 ═════════ */
  U.prompt = function (opt) {
    return new Promise(resolve => {
      let inputEl = null;
      U.modal({
        title: opt.title || '输入',
        build(b) {
          const row = h('div', 'field-row');
          if (opt.label) row.appendChild(h('label', '', opt.label));
          inputEl = h('input', '');
          inputEl.type = 'text';
          inputEl.value = opt.value === undefined ? '' : opt.value;
          if (opt.placeholder) inputEl.placeholder = opt.placeholder;
          row.appendChild(inputEl);
          b.appendChild(row);
          if (opt.hint) b.appendChild(h('div', 'note-card', opt.hint));
          setTimeout(() => { inputEl.focus(); inputEl.select(); }, 40);
          inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
              const ok = b.parentNode.querySelector('.modal-foot .btn-primary');
              if (ok) ok.click();
            }
          });
        },
        buttons: [
          { label: '取消', onClick: () => resolve(null) },
          {
            label: '确定', primary: true,
            onClick: () => { resolve(inputEl ? inputEl.value.trim() : null); }
          }
        ],
        onClose: () => resolve(null)
      });
    });
  };

  /* ═════════ 属性面板生成器 ═════════ */
  /**
   * @param {HTMLElement} host
   * @param {Array} schema  [{group, key, open, items:[{key,label,type,...}]}]
   * @param {object} ctl {get(path), set(path,val), changed(path), ctx}
   */
  U.buildControls = function (host, schema, ctl) {
    host.innerHTML = '';
    const collapsed = ctl.collapsed || {};
    schema.forEach(sec => {
      if (!sec) return;
      if (sec.hidden && sec.hidden(ctl)) return;
      const g = h('div', 'pgroup' + (collapsed[sec.group] ? ' collapsed' : ''));
      const head = h('div', 'pgroup-head');
      const caret = h('span', 'caret');
      caret.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 4 6 7.5 9.5 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
      head.appendChild(caret);
      head.appendChild(h('span', 'pgroup-title', sec.group));
      if (sec.right) {
        const r = h('span', 'pgroup-right');
        r.style.cssText = 'margin-left:auto;font-size:10.5px;color:var(--text-3)';
        r.textContent = sec.right;
        head.appendChild(r);
      }
      head.addEventListener('click', () => {
        g.classList.toggle('collapsed');
        const on = g.classList.contains('collapsed');
        if (ctl.onCollapse) ctl.onCollapse(sec.group, on);
      });
      g.appendChild(head);
      const body = h('div', 'pgroup-body');
      (sec.items || []).forEach(it => {
        if (it && it.if && !it.if(ctl)) return;
        const c = makeControl(it, ctl);
        if (c) body.appendChild(c);
      });
      g.appendChild(body);
      host.appendChild(g);
    });
  };

  function makeControl(it, ctl) {
    if (it.note) {
      const n = h('div', 'note-card' + (it.warn ? ' warn' : ''));
      n.innerHTML = it.note;
      return n;
    }
    if (it.custom) return it.custom(ctl);
    const row = h('div', 'ctrl' + (it.tall ? ' tall' : ''));
    if (it.label) row.appendChild(h('label', '', it.label));
    const inp = h('div', 'ctrl-in');
    const path = it.key;
    const val = ctl.get(path);

    const commit = (v, live) => {
      ctl.set(path, v);
      if (ctl.changed) ctl.changed(path, v, live);
    };

    switch (it.type) {
      case 'switch': {
        const sw = h('div', 'switch' + (val ? ' on' : ''));
        sw.addEventListener('click', () => {
          const nv = !sw.classList.contains('on');
          sw.classList.toggle('on', nv);
          commit(nv);
        });
        inp.appendChild(sw);
        break;
      }
      case 'range': {
        const wrap = h('div', 'range-wrap');
        const s = h('input', '');
        s.type = 'range';
        s.min = it.min !== undefined ? it.min : 0;
        s.max = it.max !== undefined ? it.max : 1;
        s.step = it.step || 0.01;
        s.value = val === null || val === undefined || val === '' ? (it.def || 0) : val;
        const lab = h('span', 'range-val', it.fmt ? it.fmt(+s.value) : String(s.value));
        s.addEventListener('input', () => {
          lab.textContent = it.fmt ? it.fmt(+s.value) : String(s.value);
          commit(+s.value, true);
        });
        s.addEventListener('change', () => commit(+s.value));
        wrap.appendChild(s); wrap.appendChild(lab);
        inp.appendChild(wrap);
        break;
      }
      case 'number': {
        const n = h('input', '');
        n.type = 'number';
        if (it.min !== undefined) n.min = it.min;
        if (it.max !== undefined) n.max = it.max;
        n.step = it.step || 0.1;
        n.value = val === null || val === undefined ? '' : val;
        if (it.placeholder) n.placeholder = it.placeholder;
        n.addEventListener('change', () => commit(n.value === '' ? '' : +n.value));
        inp.appendChild(n);
        if (it.suffix) inp.appendChild(h('span', 'range-val', it.suffix));
        break;
      }
      case 'color': {
        const sw = h('div', 'swatch');
        const c = h('input', '');
        c.type = 'color';
        c.value = val || '#000000';
        c.addEventListener('input', () => commit(c.value, true));
        c.addEventListener('change', () => commit(c.value));
        sw.appendChild(c);
        inp.appendChild(sw);
        if (it.clearable) {
          const b = h('button', 'mini-btn', '默认');
          b.type = 'button';
          b.addEventListener('click', () => commit(''));
          inp.appendChild(b);
        }
        break;
      }
      case 'select': {
        const s = h('select', 'mini-select');
        (it.options || []).forEach(o => {
          const op = h('option', '', o.name !== undefined ? o.name : o.label);
          op.value = o.v !== undefined ? o.v : o.value;
          s.appendChild(op);
        });
        s.value = val === null || val === undefined ? '' : val;
        s.addEventListener('change', () => commit(s.value));
        inp.appendChild(s);
        break;
      }
      case 'btnrow': {
        const br = h('div', 'btnrow');
        (it.options || []).forEach(o => {
          const b = h('button', String(val) === String(o.v) ? 'on' : '', o.name || o.label);
          b.type = 'button';
          b.addEventListener('click', () => {
            br.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            commit(o.v);
          });
          br.appendChild(b);
        });
        inp.appendChild(br);
        break;
      }
      case 'palette': {
        const wrap = h('div', 'swatch-row');
        (it.options || []).forEach(o => {
          const s = h('div', 'swatch' + (val === o.v ? ' sel' : ''));
          s.title = o.desc || o.name || o.v;
          if (o.colors) {
            s.style.background = 'linear-gradient(90deg,' + o.colors.slice(0, 5).join(',') + ')';
          } else {
            s.style.background = o.color || '#ccc';
          }
          s.addEventListener('click', () => {
            wrap.querySelectorAll('.swatch').forEach(x => x.classList.remove('sel'));
            s.classList.add('sel');
            commit(o.v);
          });
          wrap.appendChild(s);
        });
        inp.appendChild(wrap);
        break;
      }
      case 'colorlist': {
        const wrap = h('div', 'swatch-row');
        const list = Array.isArray(val) ? val : [];
        (it.options || []).forEach((o, i) => {
          const holder = h('div', 'swatch');
          const c = h('input', '');
          c.type = 'color';
          c.value = list[i] || o.color || '#cccccc';
          c.addEventListener('input', () => {
            const arr = (Array.isArray(ctl.get(path)) ? ctl.get(path).slice() : []);
            arr[i] = c.value;
            commit(arr, true);
          });
          holder.appendChild(c);
          wrap.appendChild(holder);
        });
        inp.appendChild(wrap);
        break;
      }
      case 'text': {
        const t = h('input', '');
        t.type = 'text';
        t.value = val === null || val === undefined ? '' : val;
        if (it.placeholder) t.placeholder = it.placeholder;
        t.addEventListener('change', () => commit(t.value));
        t.addEventListener('keydown', e => { if (e.key === 'Enter') t.blur(); });
        inp.appendChild(t);
        break;
      }
      case 'textarea': {
        const t = h('textarea', '');
        t.rows = it.rows || 3;
        t.value = val === null || val === undefined ? '' : val;
        t.style.cssText = 'width:100%;border:1px solid var(--line-2);border-radius:4px;padding:5px;font-size:11.5px;font-family:var(--font-ui);resize:vertical;outline:none';
        t.addEventListener('change', () => commit(t.value));
        inp.appendChild(t);
        break;
      }
      case 'button': {
        const b = h('button', 'btn btn-sm btn-block', it.text || it.label);
        b.type = 'button';
        b.addEventListener('click', () => { if (it.onClick) it.onClick(ctl); });
        inp.appendChild(b);
        break;
      }
      case 'infobox': {
        const n = h('div', 'stat-table');
        n.innerHTML = it.html ? it.html(ctl) : '';
        inp.style.display = 'block';
        inp.appendChild(n);
        break;
      }
      default:
        return null;
    }
    row.appendChild(inp);
    /* hint 对所有控件类型都生效。早前只在 switch 里读它，
       select / number / text 上写的 hint 会被静默丢掉。
       below 是「控件下方再挂一个节点」的扩展位，两者可以同时存在。 */
    if (it.hint || it.below) {
      const col = h('div', 'ctrl ctrl-col');
      col.appendChild(row);
      if (it.hint) col.appendChild(h('div', 'ctrl-hint', it.hint));
      if (it.below) col.appendChild(it.below(ctl));
      return col;
    }
    return row;
  }
  U.makeControl = makeControl;

  /* ═════════ 分组表（统计结果） ═════════ */
  U.statTable = function (head, rows) {
    const t = h('table', 'stat-table');
    if (head) {
      const tr = h('tr');
      head.forEach(x => tr.appendChild(h('th', '', x)));
      const th = h('thead');
      th.appendChild(tr);
      t.appendChild(th);
    }
    const tb = h('tbody');
    rows.forEach(r => {
      const tr = h('tr');
      r.forEach(c => {
        if (c && typeof c === 'object') {
          const td = h('td', c.cls || '');
          if (c.html) td.innerHTML = c.html; else td.textContent = c.text === undefined ? c : c.text;
          tr.appendChild(td);
        } else {
          tr.appendChild(h('td', '', c));
        }
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  };

  /* ═════════ 其它小工具 ═════════ */
  U.pill = function (sig, text) {
    const s = h('span', 'pill ' + (sig ? 'sig' : 'ns'), text || (sig ? '显著' : '不显著'));
    return s;
  };
  U.el = h;

  CG.ui = U;
})(typeof window !== 'undefined' ? window : globalThis);
