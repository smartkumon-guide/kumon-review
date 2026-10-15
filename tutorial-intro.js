(() => {
  let page, tagline, brand, welcome, next, art, poster, posterFrame, originalHeader;
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
    posterFrame=document.createElement('div');posterFrame.className='intro-poster-frame';poster=document.createElement('img');poster.className='intro-poster';originalHeader=document.createElement('img');originalHeader.className='intro-original-header';originalHeader.alt='';originalHeader.hidden=true;posterFrame.append(poster,originalHeader);posterFrame.hidden=true;content.append(posterFrame,tagline, brand, welcome, next); page.append(art, content); document.body.prepend(page);
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
      page.classList.toggle('poster-intro',!!scene.poster);posterFrame.hidden=!scene.poster;originalHeader.hidden=!scene.originalHeader;if(scene.originalHeader)originalHeader.src=scene.originalHeader;tagline.hidden=brand.hidden=welcome.hidden=!!scene.poster;art.hidden=!!scene.poster;if(scene.poster){poster.src=scene.poster;poster.alt=scene.brand+' · '+scene.welcome.join(' ');}
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
