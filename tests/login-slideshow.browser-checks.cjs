const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
exports.verify = async ({ evaluate, command, wait, click, fill, login, logout, base }) => {
  const directory = path.join(__dirname, 'artifacts/login-portfolio');
  fs.mkdirSync(directory, { recursive: true });
  const report = { viewports: [], photographs: [], cycle: [], checks: [] };
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__loginTimers = new Set();
    const originalTimeout = window.setTimeout, originalClearTimeout = window.clearTimeout;
    window.setTimeout = (callback, delay, ...args) => {
      const fromGallery = new Error().stack.includes('/js/login-slideshow.js');
      const id = originalTimeout(() => { __loginTimers.delete(id); callback(...args); }, delay);
      if (fromGallery) __loginTimers.add(id);
      return id;
    };
    window.clearTimeout = id => { __loginTimers.delete(id); originalClearTimeout(id); };
  ` });
  const current = "document.querySelector('#login-slideshow').dataset.project";
  const paused = "document.querySelector('#login-slideshow').dataset.paused==='true'";
  const ready = "document.querySelector('#auth-email') && document.querySelector('#login-slideshow').dataset.project";
  const navigate = async (route = '/MCPA/index.html') => {
    await command('Page.navigate', { url: base + route });
    await wait(ready);
  };
  const focusArrow = async (direction = '-1') => {
    // Establish real keyboard modality before testing :focus-visible behavior.
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await evaluate(`document.querySelector('[data-login-step="${direction}"]').focus()`);
    await wait(paused);
  };
  const capture = async (name, viewport = false, verifyPhoto = false) => {
    const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !viewport });
    const bytes = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(directory, name + '.png'), bytes);
    if (verifyPhoto) {
      const rect = await evaluate(`(() => {
        const stage = document.querySelector('#login-slideshow');
        const slide = stage.querySelector('.login-slide[data-project="' + stage.dataset.project + '"]');
        const image = slide.querySelector('img'), box = image.getBoundingClientRect();
        const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
        const style = getComputedStyle(image);
        return {x:box.x,y:box.y,width:box.width,height:box.height,
          naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
          retainedWidth:box.width/(image.naturalWidth*scale),retainedHeight:box.height/(image.naturalHeight*scale),
          position:style.objectPosition,fit:style.objectFit,transform:style.transform,
          project:stage.dataset.project,viewportWidth:innerWidth,viewportHeight:innerHeight,
          opacity:getComputedStyle(slide).opacity};
      })()`);
      assert.equal(rect.opacity, '1', 'The decoded slide is fully visible after its fade');
      assert.equal(rect.fit, 'cover', 'Uniform cover scaling fills the gallery without stretching');
      assert.equal(rect.transform, 'none', 'No additional zoom or image distortion');
      assert.ok(rect.retainedWidth >= .997, 'Virtually the full original width remains visible');
      assert.ok(rect.retainedHeight >= .935, 'No more than ~6.5% of source height is cropped, including ratio rounding');
      if (['4','5','6'].includes(rect.project)) assert.equal(rect.position, '50% 0%', 'Top framing protects roof structure');
      if (['3','7','9'].includes(rect.project)) assert.equal(rect.position, '50% 100%', 'Bottom framing protects embedded watermark');
      report.photographs.push({capture:name,...rect});
      const shot = await loadImage(bytes), canvas = createCanvas(shot.width, shot.height), context = canvas.getContext('2d');
      context.drawImage(shot, 0, 0);
      let painted = 0;
      for (let x = 1; x <= 5; x++) for (let y = 1; y <= 5; y++) {
        const pixel = context.getImageData(Math.floor(rect.x+rect.width*x/6), Math.floor(rect.y+rect.height*y/6), 1, 1).data;
        if (Math.abs(pixel[0]-32)+Math.abs(pixel[1]-37)+Math.abs(pixel[2]-33)>24) painted++;
      }
      assert.ok(painted >= 10, `${name}: photograph pixels must be painted, not just loaded (${painted}/25)`);
    }
  };
  if (!process.argv.includes('--login-slideshow-fallback')) {
  if (!process.argv.includes('--login-slideshow-controls')) {
  for (const [width, height] of [[375,812],[393,852],[430,932],[768,1024],[900,900],[901,900],[1024,1366],[1024,768],[1200,800],[1201,800],[1366,768],[1440,900],[1920,1080],[2560,1440],[2560,1080]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate();
    assert.equal(await evaluate(current), '1');
    const layout = await evaluate(`(() => {
      const card=document.querySelector('.login-card').getBoundingClientRect();
      const input=document.querySelector('#auth-email').getBoundingClientRect();
      const gallery=document.querySelector('.login-gallery').getBoundingClientRect();
      const stage=document.querySelector('#login-slideshow').getBoundingClientRect();
      const photo=document.querySelector('.login-photo');
      const scale=Math.max(stage.width/photo.naturalWidth,stage.height/photo.naturalHeight);
      const controls=document.querySelector('.login-gallery-footer').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth,
        compact:getComputedStyle(document.querySelector('.login-mobile-backdrop')).display!=='none',
        card:{x:card.x,width:card.width,bottom:card.bottom},
        gallery:{x:gallery.x,y:gallery.y,width:gallery.width,height:gallery.height,right:gallery.right},
        stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},
        photograph:{width:photo.naturalWidth*scale,height:photo.naturalHeight*scale},
        controls:{x:controls.x,y:controls.y,bottom:controls.bottom},
        interactive:document.elementFromPoint(input.x+10,input.y+10).id==='auth-email',
        filters:Array.from(document.querySelectorAll('.login-slide,.login-scene,.login-photo')).map(el=>getComputedStyle(el).filter),
        photos:Array.from(document.querySelectorAll('.login-photo')).map(img=>getComputedStyle(img).objectFit),
        mobileFilter:getComputedStyle(document.querySelector('.login-mobile-photo')).filter,
        mobileFit:getComputedStyle(document.querySelector('.login-mobile-photo')).objectFit,
        glass:getComputedStyle(document.querySelector('.login-card')).backdropFilter,
        firstImage:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('project-1.webp')).map(r=>({duration:r.duration,bytes:r.transferSize}))};
    })()`);
    assert.equal(layout.overflow, false);
    assert.equal(layout.interactive, true);
    assert.ok(Math.abs(layout.card.x + layout.card.width / 2 - (!layout.compact ? (layout.gallery.right + width) / 2 : width / 2)) < 1, 'Form centered within its responsive panel');
    if (!layout.compact) {
      assert.ok(layout.gallery.width / height >= .749 && layout.gallery.width / height <= .801, 'Gallery stays near the original portrait proportions');
      if (width / height > 1.7 && width / height < 1.8) assert.ok(Math.abs(layout.gallery.width/width-.44)<.001, 'Normal 16:9 desktops use a balanced 44/56 split');
      assert.equal(layout.gallery.x, 0);
      assert.equal(layout.gallery.y, 0);
      assert.equal(layout.gallery.height, height, 'Gallery reaches both viewport edges');
      assert.equal(layout.stage.width, layout.gallery.width, 'No horizontal frame around photo');
      assert.equal(layout.stage.height, height, 'No caption row or padding shrinking photo');
      assert.ok(layout.photograph.width >= layout.stage.width-.1 && layout.photograph.height >= height-.1, 'Uniformly scaled photo fills every panel edge without empty margins');
      assert.ok(layout.controls.x >= layout.gallery.right, 'Controls cannot obscure photo or watermark');
      assert.ok(layout.controls.y >= layout.card.bottom, 'Controls cannot overlap the authentication form');
      assert.ok(layout.card.x >= layout.gallery.right, 'Login form cannot overlap the architecture');
    }
    assert.ok(layout.filters.every(filter => filter === 'none'), 'Sharp photographs: no blurred fill or filtering');
    assert.ok(layout.photos.every(fit => fit === 'cover'), 'Aspect-preserving photos fill the bounded gallery');
    assert.ok(layout.card.bottom <= height, 'Form fits the requested viewport');
    assert.equal(await evaluate("document.querySelector('[data-login-number]').textContent"), '01');
    await capture(`login-${width}-early`);
    if (layout.compact) {
      assert.equal(layout.mobileFilter, 'blur(16px)');
      assert.equal(layout.mobileFit, 'cover');
      assert.equal(layout.glass, 'blur(14px)');
      const source = await evaluate("document.querySelector('.login-mobile-photo').src");
      await fill('#auth-email', 'admin@example.test');
      await fill('#auth-password', 'test-password');
      await click('[data-auth-toggle-password]');
      await click('[data-auth-reset]');
      await wait("document.querySelector('#auth-feedback').textContent.includes('reset link')");
      await pause(5700);
      assert.equal(await evaluate(current), '1', 'Mobile never advances while typing or recovering');
      assert.equal(await evaluate("document.querySelector('.login-mobile-photo').src"), source);
      assert.equal(await evaluate('window.__loginTimers.size'), 0, 'Mobile has no slideshow timer');
      assert.ok(await evaluate("[...document.querySelectorAll('[data-login-step]')].every(button=>button.hidden) && document.getAnimations().length===0"));
      const requests = await evaluate("performance.getEntriesByType('resource').filter(r=>r.name.includes('/images/login-slideshow/')).map(r=>r.name)");
      assert.ok(requests.every(url=>url.endsWith('project-1.webp')), 'Mobile only loads the first optimized photo');
    } else {
    await wait(`${current}==='2'`);
    assert.ok(await evaluate("document.querySelectorAll('.login-slide').length===2 && document.getAnimations().some(a=>a.effect.getTiming().duration===1350)"));
    await pause(1500);
    assert.equal(await evaluate("document.querySelector('[data-login-number]').textContent"), '02');
    await capture(`login-${width}-later`);
    }
    report.viewports.push({ width, height, ...layout });
  }
  // A real-time complete cycle verifies ordering and the wrap, not just a timer mock.
  await command('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await navigate();
  for (let number = 1; number <= 9; number++) {
    await wait(`${current}==='${number}'`);
    report.cycle.push({ project: number, time: Date.now() });
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.login-slide')).find(el=>el.dataset.project==='${number}').querySelector('img').naturalWidth>0`));
    await pause(1500);
    // Headless Chromium can defer compositor frames. Settle the actual animation,
    // not just wall-clock time, before judging the rendered photograph.
    await wait(`(() => { const slide=document.querySelector('.login-slide[data-project="${number}"]'); return slide.getAnimations().length===0 && getComputedStyle(slide).opacity==='1'; })()`);
    // Every real slideshow photograph is checked at every requested desktop width,
    // including a short ultrawide where a fixed 44% would cut off roof details.
    for (const [width,height] of [[1366,768],[1440,900],[2560,1440],[2560,1080],[1920,1080]]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await capture(`login-${width}x${height}-project-${number}`,true,true);
      assert.equal(await evaluate(current),String(number),'Capture remains on the same real slideshow frame');
    }
  }
  await wait(`${current}==='1'`);
  report.cycle.push({ project: 1, time: Date.now() });
  for (let i = 1; i < report.cycle.length; i++) {
    const interval = report.cycle[i].time - report.cycle[i - 1].time;
    assert.ok(interval > 5000 && interval < 6200, `5.5-second cadence: ${interval}ms`);
  }
  } else { await navigate(); }
  const settled = "(() => { const slide=document.querySelector('.login-slide[data-project=\"'+document.querySelector('#login-slideshow').dataset.project+'\"]'); return slide.getAnimations().length===0 && getComputedStyle(slide).opacity==='1'; })()";
  await wait(settled);
  await focusArrow();
  await wait(paused);
  const beforePause = await evaluate(current);
  await pause(5700);
  assert.equal(await evaluate(current), beforePause);
  assert.ok(await evaluate("document.getAnimations().every(a=>a.playState==='paused' || a.playState==='finished')"));
  await wait(settled);
  // Full-page capture can temporarily change Chrome's viewport/focus. Keep the
  // focused-control assertion in the actual viewport, as with photo framing.
  await capture('login-focus-paused-settled-slide', true, true);
  await evaluate('document.activeElement.blur()');
  assert.ok(await evaluate(settled), 'Resuming a completed fade must not restart it from transparent');
  await wait(`${current}!==${JSON.stringify(beforePause)}`);
  report.checks.push('Keyboard focus pauses automatic progression; leaving controls resumes');

  await navigate();
  assert.equal(await evaluate("document.querySelector('[data-login-motion]')"),null);
  const previousPoint=await evaluate("(()=>{const r=document.querySelector('[data-login-step=\"-1\"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...previousPoint});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...previousPoint});
  await wait(`${current}==='9'`);
  assert.equal(await evaluate(paused),false,'Mouse navigation preserves autoplay');
  await evaluate("for(let i=0;i<20;i++)document.querySelector('[data-login-step=\"1\"]').click()");
  assert.equal(await evaluate(current),'9','Rapid clicks during a crossfade are ignored');
  await pause(1500); await wait(settled);
  await click('[data-login-step="1"]'); await wait(`${current}==='1'`);
  await pause(1500); await wait(settled);
  assert.equal(await evaluate("document.querySelector('[data-login-number]').textContent"),'01');
  assert.ok(await evaluate('__loginTimers.size<=1'),'Manual navigation keeps one automatic timer');
  await focusArrow('1');
  assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"),'solid');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait(`${current}==='2'`); await pause(1500); await wait(settled);
  await capture('login-desktop-arrows',true,true);
  await evaluate('document.activeElement.blur()');
  const afterManual=await evaluate(current);await wait(`${current}!==`+JSON.stringify(afterManual));
  report.checks.push('Previous/Next wrap, rapid clicks, counter, keyboard activation/focus, and automatic restart');

  // Switch real browser tabs, without mocking document.hidden or its events.
  await wait(settled);
  const { targetInfo } = await command('Target.getTargetInfo');
  const backgroundTab = await command('Target.createTarget', { url: 'about:blank' });
  await wait('document.hidden');
  await wait(paused);
  const hiddenFrame = await evaluate(current);
  await pause(5700);
  assert.equal(await evaluate(current), hiddenFrame);
  await command('Target.activateTarget', { targetId: targetInfo.targetId });
  await wait('!document.hidden');
  await wait(`!(${paused})`);
  assert.ok(await evaluate(settled), 'Returning to a tab must not replay a finished fade');
  await command('Target.closeTarget', { targetId: backgroundTab.targetId });
  report.checks.push('Real browser visibility changes pause and resume the slideshow');

  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigate();
  await wait(paused);
  await pause(5700);
  assert.equal(await evaluate(current), '1');
  assert.ok(await evaluate("document.getAnimations().length===0 && [...document.querySelectorAll('[data-login-step]')].every(button=>!button.hidden)"));
  await click('[data-login-step="-1"]'); await wait(`${current}==='9'`);
  assert.equal(await evaluate('document.getAnimations().length'),0,'Reduced-motion manual navigation has no animation');
  report.checks.push('Reduced motion uses a still photo with no animation or automatic slide changes');
  await command('Emulation.setEmulatedMedia', { features: [] });

  // The first photo is server-rendered and does not wait for this controller.
  await command('Emulation.setScriptExecutionDisabled', { value: true });
  await command('Page.navigate', { url: base + '/MCPA/index.html' });
  await wait("document.querySelector('.login-photo')?.naturalWidth>0");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-slide')).opacity"), '1');
  assert.equal(await evaluate('window.MCPALoginSlideshow === undefined'), true);
  await command('Emulation.setScriptExecutionDisabled', { value: false });
  await navigate();
  report.checks.push('First image is visible from HTML even before slideshow JavaScript runs');

  await fill('#auth-email', 'admin@example.test');
  await fill('#auth-password', 'test-password');
  await click('[data-auth-toggle-password]');
  assert.equal(await evaluate("document.querySelector('#auth-password').type"), 'text');
  await click('[data-auth-toggle-password]');
  await click('[data-auth-reset]');
  await wait("document.querySelector('#auth-feedback').textContent.includes('reset link')");
  await login('admin');
  await wait("window.MCPAAuth?.profile?.role==='admin' && document.querySelector('#login-screen').classList.contains('hidden')");
  assert.ok(await evaluate(paused));
  assert.equal(await evaluate("document.querySelector('#login-slideshow').getClientRects().length"), 0);
  await command('Page.reload');
  await wait("window.MCPAAuth?.profile?.role==='admin' && document.querySelector('#login-screen').classList.contains('hidden')");
  assert.ok(await evaluate(paused));
  await logout();
  await wait(`!(${paused})`);
  for (let i = 0; i < 3; i++) {
    await click('[data-auth-demo]');
    await click('[data-auth-back]');
    await evaluate('MCPALoginSlideshow.hide(); MCPALoginSlideshow.show(); MCPALoginSlideshow.show()');
  }
  assert.equal(await evaluate('__loginTimers.size'), 1, 'Repeated auth rendering retains a single slide timer');
  assert.equal(await evaluate("document.querySelectorAll('.login-slide').length"), 2);
  await focusArrow();
  assert.equal(await evaluate('__loginTimers.size'), 0, 'Focus still pauses after repeated renders');
  await evaluate('document.activeElement.blur()');
  await click('[data-auth-demo]');
  await click('[data-demo-role=engineer]');
  await wait("window.MCPAAuth?.isDemo && document.querySelector('#login-screen').classList.contains('hidden')");
  assert.ok(await evaluate(paused));
  await logout();
  await wait(`!(${paused})`);
  report.checks.push('Sign in, restored session, password visibility, reset, demo and logout retain correct slideshow lifecycle');

  for (const route of ['/index.html', '/2-engr/index.html', '/MCPA/2-engr/index.html']) {
    await navigate(route);
    assert.equal(await evaluate(current), '1');
    assert.ok(await evaluate("document.querySelector('.login-photo').naturalWidth>0"));
  }
  report.checks.push('Root, engineer and /MCPA/ GitHub Pages paths load the actual images');

  // Local light/dark preference must not alter this deliberately dark login surface.
  const themeColors = [];
  for (const theme of ['light', 'dark']) {
    await evaluate(`localStorage.setItem('mcpa.theme', '${theme}')`);
    await navigate();
    themeColors.push(await evaluate("getComputedStyle(document.querySelector('.login-card')).backgroundColor"));
  }
  assert.equal(themeColors[0], themeColors[1]);
  await evaluate("localStorage.removeItem('mcpa.theme')");
  report.checks.push('Login appearance stays consistent with either saved application theme');

  // Emulate the reduced layout height caused by a mobile keyboard; every control
  // must remain reachable through natural scrolling rather than a clipped panel.
  await command('Emulation.setDeviceMetricsOverride', { width: 393, height: 420, deviceScaleFactor: 1, mobile: true });
  await navigate();
  for (const selector of ['#auth-email', '#auth-password', '#auth-form [type=submit]', '[data-auth-reset]', '[data-auth-demo]']) {
    const accessible = await evaluate(`(() => {
      const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.scrollIntoView({block:'center'});
      const rect=el.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight && el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
    })()`);
    assert.ok(accessible, `Keyboard-height control remains reachable: ${selector}`);
  }
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  await capture('login-393-keyboard-scrolled', true);
  await evaluate('scrollTo(0,0)');
  await capture('login-393-keyboard-height', true);
  await login('admin');
  await wait("window.MCPAAuth?.profile?.role==='admin'");
  await logout();
  assert.ok(await evaluate("document.querySelector('.login-mobile-photo').dataset.project==='1' && [...document.querySelectorAll('[data-login-step]')].every(button=>button.hidden)"));
  assert.equal(await evaluate('__loginTimers.size'), 0);
  report.checks.push('Mobile background remains static across typing, recovery, login and logout; all form controls remain reachable at 393x420');
  await command('Emulation.setDeviceMetricsOverride', { width: 1366, height: 600, deviceScaleFactor: 1, mobile: false });
  await navigate();
  await evaluate("document.querySelector('[data-auth-demo]').scrollIntoView({block:'center'})");
  assert.ok(await evaluate("document.querySelector('[data-auth-demo]').getBoundingClientRect().bottom <= innerHeight"));
  await capture('login-1366-short-scrolled', true);
  await evaluate('scrollTo(0,0)');
  await capture('login-1366-short', true);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  }

  await command('Network.setBlockedURLs', { urls: ['https://*', '*project-1.webp', '*project-2.webp', '*project-2.png'] });
  await navigate();
  assert.ok(await evaluate("document.querySelector('.login-photo').src.endsWith('project-1.png')"));
  await wait(`${current}==='3'`);
  report.checks.push('Missing WebP falls back to PNG; a missing photo skips without a blank frame');

  await command('Network.setBlockedURLs', { urls: ['https://*', '*images/login-slideshow/*'] });
  await command('Page.navigate', { url: base + '/MCPA/index.html' });
  await wait("document.querySelector('#auth-email') && document.querySelector('#login-slideshow')?.dataset.unavailable==='true'");
  assert.ok(await evaluate("[...document.querySelectorAll('[data-login-step]')].every(button=>button.hidden) && Array.from(document.querySelectorAll('.login-photo')).every(img=>getComputedStyle(img).visibility==='hidden')"), 'No broken-image icon or irrelevant motion control');
  await fill('#auth-email', 'admin@example.test');
  await fill('#auth-password', 'test-password');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#login-screen')).backgroundColor"), 'rgb(17, 19, 18)');
  await capture('login-all-images-unavailable');
  await command('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate("getComputedStyle(document.querySelector('.login-mobile-photo')).visibility==='hidden' && __loginTimers.size===0"));
  await capture('login-mobile-images-unavailable');
  await login('admin');
  await wait("window.MCPAAuth?.profile?.role==='admin'");
  report.checks.push('All images unavailable: readable charcoal fallback and successful sign in');
  await command('Network.setBlockedURLs', { urls: ['https://*'] });
  fs.writeFileSync(path.join(directory, process.argv.includes('--login-slideshow-fallback') ? 'fallback-results.json' : 'results.json'), JSON.stringify(report, null, 2));
  console.log('Slideshow screenshots and results: ' + directory);
};
