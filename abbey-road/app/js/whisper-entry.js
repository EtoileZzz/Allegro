/* Whisper 入口：按「开发者模式长按设置」同一套写法，直接绑在按钮上。
   这样不再依赖 document 级委托（在部分 WebView 上 pointerdown 不会冒泡到 document）。 */
(function () {
  'use strict';
  var lastErr = '';
  window.addEventListener('error', function (e) {
    try {
      var src = (e && e.filename) || '';
      if (src.indexOf('whisper') >= 0) { lastErr = (e && e.message) || 'unknown'; }
    } catch (x) { }
  }, true);
  window.__whisperErr = function () { return lastErr; };

  function toast(msg) {
    try { if (window.AR && AR.UI && AR.UI.toast) { AR.UI.toast(msg); return; } } catch (e) { }
    try { console.log('[Whisper] ' + msg); } catch (e2) { }
  }
  function openWhisper() {
    try {
      if (window.__whisper && window.__whisper.open) { window.__whisper.open(); return; }
      if (window.AR && AR.Whisper && AR.Whisper.open) { AR.Whisper.open(); return; }
      toast('Whisper 没加载出来' + (lastErr ? '：' + lastErr : ''));
    } catch (err) { toast('Whisper: ' + (err && err.message)); }
  }

  function bind(btn) {
    if (!btn || btn.__whisperBound) { return; }
    btn.__whisperBound = true;
    var timer = null, fired = false, x0 = 0, y0 = 0, pid = null;
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } pid = null; }
    function trigger() { timer = null; fired = true; openWhisper(); }

    btn.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    /* 长按成功触发后吞掉松手时紧随的 click，避免底层导航跟着切到「导入/我的」页 */
    btn.addEventListener('click', function (ev) {
      if (fired) {
        fired = false;
        if (ev.preventDefault) { ev.preventDefault(); }
        if (ev.stopPropagation) { ev.stopPropagation(); }
        if (ev.stopImmediatePropagation) { ev.stopImmediatePropagation(); }
      }
    }, true);

    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', function (ev) {
        if (ev.button != null && ev.button !== 0) { return; }
        cancel();
        fired = false;
        x0 = ev.clientX; y0 = ev.clientY;
        pid = ev.pointerId;
        timer = setTimeout(trigger, 520);
      });
      btn.addEventListener('pointermove', function (ev) {
        if (!timer || (pid != null && ev.pointerId !== pid)) { return; }
        if (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10) { cancel(); }
      });
      btn.addEventListener('pointerup', cancel);
      btn.addEventListener('pointercancel', cancel);
      btn.addEventListener('pointerleave', cancel);
    } else {
      /* 触摸兜底：仅在不支持 PointerEvent 的老内核使用 */
      btn.addEventListener('touchstart', function (ev) {
        var t0 = ev.touches && ev.touches[0];
        if (!t0) { return; }
        cancel();
        fired = false;
        x0 = t0.clientX; y0 = t0.clientY;
        timer = setTimeout(trigger, 520);
      }, { passive: true });
      btn.addEventListener('touchmove', function (ev) {
        var t1 = ev.touches && ev.touches[0];
        if (!timer || !t1) { return; }
        if (Math.abs(t1.clientX - x0) > 10 || Math.abs(t1.clientY - y0) > 10) { cancel(); }
      }, { passive: true });
      btn.addEventListener('touchend', cancel, { passive: true });
      btn.addEventListener('touchcancel', cancel, { passive: true });
    }

    btn.addEventListener('dblclick', function (ev) {
      if (ev.preventDefault) { ev.preventDefault(); }
      cancel();
      openWhisper();
    });
  }

  var NAV_SEL = '.nav-btn[data-nav="import"], .nav-btn[data-nav="custom"], .nav-btn[data-nav="mine"]';
  var mo = null;
  function watchRoots() {
    if (typeof MutationObserver !== 'function') { return; }
    if (!mo) {
      mo = new MutationObserver(function () { scan(); });
    }
    var roots = [document.getElementById('railNav'), document.getElementById('tabbar')];
    for (var i = 0; i < roots.length; i++) {
      var r = roots[i];
      if (!r || r.__whisperObserved) { continue; }
      r.__whisperObserved = true;
      try {
        mo.observe(r, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-nav'] });
      } catch (e) { }
    }
  }
  function scan() {
    var btns = document.querySelectorAll(NAV_SEL);
    for (var i = 0; i < btns.length; i++) { bind(btns[i]); }
    watchRoots();
  }
  scan();
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
})();
