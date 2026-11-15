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
    var timer = null;
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    btn.addEventListener('pointerdown', function (ev) {
      cancel();
      var x0 = ev.clientX, y0 = ev.clientY;
      timer = setTimeout(function () { timer = null; openWhisper(); }, 520);
      var move = function (e2) {
        if (Math.abs(e2.clientX - x0) > 10 || Math.abs(e2.clientY - y0) > 10) { cancel(); }
      };
      var up = function () {
        cancel();
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointercancel', up);
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    });
    btn.addEventListener('pointerleave', cancel);
    /* 触摸兜底：部分机型不派发 pointerdown */
    btn.addEventListener('touchstart', function (ev) {
      cancel();
      var t0 = ev.touches && ev.touches[0];
      if (!t0) { return; }
      timer = setTimeout(function () { timer = null; openWhisper(); }, 520);
    }, { passive: true });
    btn.addEventListener('touchend', cancel, { passive: true });
    btn.addEventListener('touchmove', cancel, { passive: true });
    btn.addEventListener('touchcancel', cancel, { passive: true });
    btn.addEventListener('dblclick', function () { openWhisper(); });
  }

  function scan() {
    var btns = document.querySelectorAll('.nav-btn[data-nav="import"], .nav-btn[data-nav="mine"]');
    for (var i = 0; i < btns.length; i++) { bind(btns[i]); }
  }
  scan();
  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  try {
    var mo = new MutationObserver(function () { scan(); });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) { }
})();
