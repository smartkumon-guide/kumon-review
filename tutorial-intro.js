(() => {
  let page, tagline, brand, welcome, next, art;
  function create() {
    page = document.createElement('section');
    page.className = 'product-intro'; page.hidden = true;
    page.setAttribute('aria-labelledby', 'introBrand');
    art = document.createElement('div'); art.className = 'intro-art'; art.setAttribute('aria-hidden', 'true');
    for (const name of ['one', 'two', 'three']) {
      const figure = document.createElement('span'); figure.className = 'intro-decoration ' + name;
      const image = document.createElement('img'); image.alt = ''; figure.append(image); art.append(figure);
    }
    const content = document.createElement('div'); content.className = 'intro-content';
    tagline = document.createElement('p'); tagline.className = 'intro-tagline';
    brand = document.createElement('h1'); brand.id = 'introBrand';
    welcome = document.createElement('p'); welcome.className = 'intro-welcome';
    next = document.createElement('button'); next.type = 'button'; next.textContent = '다음 →';
    next.setAttribute('aria-label', '튜토리얼 첫 화면으로 이동');
    content.append(tagline, brand, welcome, next); page.append(art, content); document.body.prepend(page);
  }
  window.TutorialIntro = {
    render(scene, frame, onContinue) {
      if (!page) create();
      const visible = scene.type === 'intro', wasVisible = !page.hidden;
      page.hidden = !visible; document.body.classList.toggle('product-intro-active', visible);
      if (!visible) {
        if (wasVisible) requestAnimationFrame(() => document.querySelector('#nextButton, #next')?.focus({preventScroll: true}));
        return false;
      }
      frame.dataset.state = scene.id;
      tagline.textContent = scene.tagline; brand.textContent = scene.brand;
      welcome.replaceChildren();
      for (const text of scene.welcome) {
        const line = document.createElement('span'); line.textContent = text; welcome.append(line);
      }
      art.classList.toggle('sprite', scene.sprite);
      for (const image of art.querySelectorAll('img')) image.src = scene.decoration;
      next.onclick = onContinue;
      if (!wasVisible && document.activeElement !== document.body) next.focus({preventScroll: true});
      return true;
    }
  };
})();
