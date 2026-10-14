(() => {
  if (parent === window) return;
  const frame = document.getElementById('appScene') || document.getElementById('frame');
  const planElement = document.getElementById('screen-plan');
  if (!frame || !planElement) return;
  const plan = JSON.parse(planElement.textContent), states = new Map();
  for (const scene of plan) {
    if (scene.phases) scene.phases.forEach((phase, index) => states.set(scene.id + '-' + (index + 1), {
      id: phase.reviewMemoId, label: scene.label + ' (' + (index + 1) + '/' + scene.phases.length + ')'
    }));
    else states.set(scene.id, {id: scene.id.toLowerCase(), label: scene.label});
  }
  function send() {
    const state = states.get(frame.dataset.state);
    if (state) parent.postMessage({type: 'kumon-review-scene', ...state}, location.origin);
  }
  new MutationObserver(send).observe(frame, {attributes: true, attributeFilter: ['data-state']});
  addEventListener('pageshow', send);
  send();
})();
