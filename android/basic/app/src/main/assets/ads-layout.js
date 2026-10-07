(() => {
  'use strict';
  const slot = document.getElementById('adSlot');
  let pending = false;
  function measure() {
    pending = false;
    const r = slot.getBoundingClientRect();
    const bar = document.querySelector('.action-bar').getBoundingClientRect();
    console.debug('VEF_AD_LAYOUT:' + JSON.stringify({
      x: r.left, y: r.top, width: r.width, height: r.height,
      viewport: window.innerWidth, bottom: Math.min(window.innerHeight, bar.top),
      visible: !document.querySelector('dialog[open]')
    }));
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(measure); }
  }
  window.vefAdHeight = height => {
    slot.style.height = Math.max(0, Math.min(150, Number(height) || 0)) + 'px';
    schedule();
  };
  addEventListener('scroll', schedule, {passive: true});
  addEventListener('resize', schedule);
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', schedule);
    visualViewport.addEventListener('scroll', schedule);
  }
  new ResizeObserver(schedule).observe(document.body);
  new MutationObserver(schedule).observe(document.getElementById('confirmDialog'), {attributes: true, attributeFilter: ['open']});
  schedule();
})();
