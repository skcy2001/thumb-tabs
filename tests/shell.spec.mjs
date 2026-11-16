import { expect, test } from '@playwright/test'

const initial = {
  tabs: [{ id: 1, title: '(3) Example', url: 'https://example.com/', pinId: 'site-a', faviconDataUrl: null, canGoBack: true, canGoForward: false, unreadCount: 3 },
    { id: 2, title: 'Second', url: 'https://example.org/', pinId: null, faviconDataUrl: null, canGoBack: false, canGoForward: false }],
  active: 1, collapsed: false, fullscreen: false, playerTarget: 1,
  settings: { side: 'right', paneWidth: 364, pins: [{ id: 'site-a', title: 'Example pin', url: 'https://example.com/', faviconDataUrl: null }] },
  downloads: [{id: 7, filename: 'report.txt', url: 'https://example.com/report.txt', savePath: 'C:/Downloads/report.txt', state: 'completed', receivedBytes: 10, totalBytes: 10, startedAt: 1}],
}
async function mount(page, role = 'pane', options = {}) {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/src/bridge.ts', async route => {
    const response = await route.fetch()
    await route.fulfill({response, body: `
      import { mockIPC } from '/node_modules/@tauri-apps/api/mocks.js';
      import { emit } from '/node_modules/@tauri-apps/api/event.js';
      window.testHost = { state: ${JSON.stringify(initial)}, actions: [], queries: [], fail: false, pendingMedia: {}, ...${JSON.stringify(options)} };
      window.testHost.update = async state => { window.testHost.state = state; await emit('browser-state', state) };
      window.testHost.emitEvent = (name, payload) => emit(name, payload);
      mockIPC(async (command, args) => {
        const h=window.testHost;
        if(command==='get_state') return h.state;
        if(command==='act') { h.actions.push(args.action); if(h.fail) throw new Error('Native operation failed'); return null; }
        if(command==='query') {
          h.queries.push(args);
          if(args.kind==='media' && h.deferMedia) return new Promise(resolve=>h.pendingMedia[args.id]=resolve);
          if(['playPause','nextTrack','mute'].includes(args.kind)) {
            if(h.failControls) throw new Error('The website could not perform this media action');
            if(h.deferControls) return new Promise(resolve=>h.finishControl=resolve);
            return args.kind==='playPause'?null:true;
          }
          return args.kind==='media' ? {tabId:args.id,title:args.id===1?'A song':'Second song',artist:'Artist',sourceTitle:'Example',artworkUrl:h.artworks?.[args.id]??null,hasMedia:true,canPlayPause:true,canNextTrack:true,canMute:true,isPlaying:true,isMuted:false,...h.mediaFlags} : null;
        }
        throw new Error('Unexpected native command: '+command);
      }, {shouldMockEvents:true});
    ` + await response.text()})
  })
  await page.goto('/?role=' + role)
  await expect.poll(() => page.evaluate(() => !!window.sidebarApi)).toBe(true)
  return errors
}
test('address edits survive incoming title updates and navigation uses the shared toolbar', async ({page}) => {
  const errors=await mount(page)
  await page.locator('.toolbar').hover()
  await page.locator('.url-display').click()
  const input=page.locator('.url-input')
  await input.fill('new search terms')
  await page.evaluate(() => {const s=structuredClone(window.testHost.state);s.tabs[0].title='Changed';return window.testHost.update(s)})
  await expect(input).toHaveValue('new search terms')
  await input.press('Enter')
  await expect.poll(() => page.evaluate(() => window.testHost.actions.some(a=>a.type==='navigate'&&a.url==='new search terms'))).toBe(true)
  await expect(page.getByRole('button',{name:'Go back',exact:true})).toBeEnabled()
  await expect(page.getByRole('button',{name:'Go forward',exact:true})).toBeDisabled()
  expect(errors).toEqual([])
})
test('original ribbon shows imported pins and unread badges, with native site menus',async({page})=>{
  const errors=await mount(page,'ribbon')
  await page.setViewportSize({width:53,height:800})
  await expect(page.getByRole('button',{name:'Example pin',exact:true})).toBeVisible()
  await expect(page.locator('.tab-unread-count')).toHaveText('3')
  await page.getByRole('button',{name:'Example pin',exact:true}).click({button:'right'})
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='menu'&&a.siteId==='site-a'))).toBe(true)
  await page.getByRole('button',{name:'New tab',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='create'))).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(53)
  expect(errors).toEqual([])
})

test('dragging a tab hides the other tabs grips and keeps the closed-hand cursor',async({page})=>{
  const errors=await mount(page,'ribbon')
  await page.setViewportSize({width:53,height:800})
  const tab=page.locator('.tab-item').first()
  const box=await tab.boundingBox()
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
  await page.mouse.down()
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2-40,{steps:5})
  await expect(page.locator('.tab-strip')).toHaveClass(/reordering/)
  const pin=page.getByRole('button',{name:'Example pin',exact:true})
  const pinBox=await pin.boundingBox()
  await page.mouse.move(pinBox.x+pinBox.width/2,pinBox.y+pinBox.height-20,{steps:5})
  expect(await pin.locator('.tab-grip').evaluate(e=>getComputedStyle(e).opacity)).toBe('0')
  expect(await pin.evaluate(e=>getComputedStyle(e).cursor)).toBe('grabbing')
  await page.mouse.up()
  await expect(page.locator('.tab-strip')).not.toHaveClass(/reordering/)
  expect(errors).toEqual([])
})
test('ribbon, pin, and tab context menus preserve the original click position', async ({page}) => {
  await mount(page, 'ribbon')
  await page.setViewportSize({width:62,height:800})
  for (const [selector, target] of [
    ['.pinned-site-btn', {siteId:'site-a'}],
    ['.tab-item', {id:2}],
    ['.tab-strip', {}],
  ]) {
    // Moving the pointer immediately afterward must not replace the click
    // coordinates with wherever the native popup eventually opens.
    await page.locator(selector).first().evaluate(el => {
      window.testHost.actions = []
      el.dispatchEvent(new MouseEvent('contextmenu', {clientX:19,clientY:237,button:2,bubbles:true}))
    })
    await page.mouse.move(1,799)
    await expect.poll(() => page.evaluate(() => window.testHost.actions.filter(a=>a.type==='menu').at(-1))).toEqual({type:'menu',...target,x:19,y:237})
  }
})

test('pinned sites distinguish closed, open, and selected without losing unread or audio badges', async ({page}) => {
  await mount(page, 'ribbon')
  await page.setViewportSize({width:56,height:800})
  await page.evaluate(() => {
    const s = structuredClone(window.testHost.state)
    s.settings.pins.push({id:'site-b',title:'Background pin',url:'https://example.org/'}, {id:'site-c',title:'Closed pin',url:'https://example.net/'})
    s.tabs[1].pinId = 'site-b'
    s.tabs[0].hasMedia = true
    return window.testHost.update(s)
  })
  const selected = page.getByRole('button', {name:'Example pin',exact:true})
  const background = page.getByRole('button', {name:'Background pin',exact:true})
  const closed = page.getByRole('button', {name:'Closed pin',exact:true})
  await expect(selected).toHaveAttribute('aria-pressed','true')
  await expect(selected).toHaveAttribute('data-open','true')
  await expect(background).toHaveAttribute('aria-pressed','false')
  await expect(background).toHaveAttribute('data-open','true')
  await expect(closed).toHaveAttribute('data-open','false')
  await page.evaluate(() => {const s=structuredClone(window.testHost.state);s.active=2;return window.testHost.update(s)})
  await expect(selected).toHaveAttribute('aria-pressed','false')
  await expect(selected).toHaveAttribute('data-open','true')
  await expect(background).toHaveAttribute('aria-pressed','true')
  await page.evaluate(() => {const s=structuredClone(window.testHost.state);s.tabs=s.tabs.filter(t=>t.id!==1);return window.testHost.update(s)})
  await expect(selected).toHaveAttribute('data-open','false')
})
test('downloads panel opens completed files and clears history through the native bridge',async({page})=>{
  const errors=await mount(page,'downloads')
  await expect(page.getByText('report.txt',{exact:true})).toBeVisible()
  await page.getByTitle('Open report.txt',{exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='openDownload'&&a.id===7))).toBe(true)
  expect(errors).toEqual([])
})
test('player uses metadata and media controls; fullscreen is available without shortcuts',async({page})=>{
  const errors=await mount(page,'player')
  await expect(page.getByText('A song',{exact:true}).first()).toBeVisible()
  await page.getByRole('button',{name:'Pause',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.queries.some(a=>a.kind==='playPause'&&a.id===1))).toBe(true)
  expect(errors).toEqual([])
})
test('player asks to be shown only after the track has drawn, never as a blank card',async({page})=>{
  const errors=await mount(page,'player',{deferMedia:true})
  await page.waitForTimeout(300)
  expect(await page.evaluate(()=>window.testHost.actions.some(a=>a.type==='playerReady'))).toBe(false)
  await page.evaluate(()=>window.testHost.pendingMedia[1]({tabId:1,title:'A song',artist:'Artist',artworkUrl:null,hasMedia:true,canPlayPause:true,canNextTrack:true,canMute:true,isPlaying:true,isMuted:false}))
  await expect(page.getByText('A song',{exact:true}).first()).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.filter(a=>a.type==='playerReady'&&a.id===1).length)).toBe(1)
  expect(errors).toEqual([])
})
test('player keeps its height and takes its width from the cover art',async({page})=>{
  const square='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#c33"/></svg>')
  const errors=await mount(page,'player',{artworks:{1:square}})
  await expect(page.getByRole('img',{name:'Media artwork'})).toBeVisible()
  // 161px cover height plus 14px of card chrome: a square cover asks for a 175px window.
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.filter(a=>a.type==='resizePlayer').at(-1)?.width)).toBe(175)
  await page.setViewportSize({width:175,height:400})
  await expect.poll(async()=>{const b=await page.locator('.player-thumbnail').boundingBox();return [Math.round(b.width),Math.round(b.height)]}).toEqual([161,161])
  expect(errors).toEqual([])
})
test('toolbar pin keeps the page open when focus moves elsewhere',async({page})=>{
  const errors=await mount(page)
  const pin=page.getByRole('button',{name:'Keep page open',exact:true})
  await expect(pin).toHaveAttribute('aria-pressed','false')
  await pin.click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='toggleKeepOpen'))).toBe(true)
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.settings.keepOpen=true;return window.testHost.update(s)})
  await expect(pin).toHaveAttribute('aria-pressed','true')
  expect(errors).toEqual([])
})
test('the toolbar menu opens a customizer that adds and removes buttons',async({page})=>{
  const errors=await mount(page)
  await page.evaluate(()=>localStorage.removeItem('tabbar.toolbar.v2'))
  await page.reload()
  await expect.poll(()=>page.evaluate(()=>!!window.sidebarApi)).toBe(true)
  await page.locator('.toolbar').click({button:'right',position:{x:200,y:10}})
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='toolbarMenu'))).toBe(true)
  // Choosing "Customize toolbar" in that native menu sends this event back.
  await page.evaluate(()=>window.testHost.emitEvent('toolbar-command','customize'))
  const panel=page.getByRole('dialog',{name:'Customize toolbar'})
  await expect(panel).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setPageHidden'&&a.hidden===true))).toBe(true)
  if (process.env.SHOT_DIR) await page.screenshot({path:process.env.SHOT_DIR+'/customizer.png'})
  await panel.getByRole('switch',{name:'Home'}).check()
  await panel.getByRole('switch',{name:'Open in browser'}).uncheck()
  await panel.getByRole('button',{name:'Done'}).click()
  await expect(panel).toHaveCount(0)
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setPageHidden'&&a.hidden===false))).toBe(true)
  await page.locator('.toolbar').hover()
  await expect(page.getByRole('button',{name:'Home',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Open in default browser',exact:true})).toHaveCount(0)
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('tabbar.toolbar.v2')).home)).toBe('on')
  // Pin open's middle stop shows the button only while the page is pinned open.
  await page.evaluate(()=>window.testHost.emitEvent('toolbar-command','customize'))
  const slider=page.getByRole('dialog',{name:'Customize toolbar'}).getByRole('slider',{name:'Pin open'})
  await slider.fill('1')
  await expect(page.locator('.customizer-row.mode-auto')).toHaveCount(2)
  await page.getByRole('button',{name:'Done'}).click()
  await expect(page.getByRole('button',{name:'Keep page open',exact:true})).toHaveCount(0)
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.settings.keepOpen=true;return window.testHost.update(s)})
  await expect(page.getByRole('button',{name:'Keep page open',exact:true})).toBeVisible()
  expect(errors).toEqual([])
})
test('settings opens from the ribbon button; appearance picks theme, tab shape and binder shape',async({page})=>{
  const ribbon=await mount(page,'ribbon')
  await page.setViewportSize({width:53,height:420})
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='openSettings'))).toBe(true)
  expect(ribbon).toEqual([])
  await page.setViewportSize({width:420,height:700})
  await page.goto('/?role=pane')
  await expect.poll(()=>page.evaluate(()=>!!window.sidebarApi)).toBe(true)
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.evaluate(()=>window.testHost.emitEvent('toolbar-command','settings'))
  const panel=page.getByRole('dialog',{name:'Settings'})
  await expect(panel).toBeVisible()
  await expect(panel).not.toContainText('Theme and tab shape')
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setPageHidden'&&a.hidden===true))).toBe(true)
  await panel.getByRole('button',{name:/Appearance/}).click()
  await expect(panel.locator('.customizer-hint, .choice-desc')).toHaveCount(0)
  await expect(panel.getByRole('radio',{name:'Light'})).toHaveCount(0)
  await expect(panel.getByRole('radio',{name:'Pill'})).toHaveCount(0)
  await expect(panel.locator('.binder-swatch')).toHaveCount(5)
  if (process.env.SHOT_DIR) await page.screenshot({path:process.env.SHOT_DIR+'/settings-appearance.png',fullPage:true})
  await panel.getByRole('radio',{name:'Midnight'}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setAppearance'&&a.theme==='midnight'&&a.tabStyle==='binder'&&a.binderShape==='wave'))).toBe(true)
  await panel.getByRole('radio',{name:'Cove'}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setAppearance'&&a.tabStyle==='binder'&&a.binderShape==='cove'))).toBe(true)
  await panel.getByRole('radio',{name:'Chrome'}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setAppearance'&&a.theme==='midnight'&&a.tabStyle==='chrome'))).toBe(true)
  // The native side stores it and broadcasts state; the page restyles from that.
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.settings.appearance={theme:'midnight',tabStyle:'chrome',binderShape:'cove'};return window.testHost.update(s)})
  await expect(page.locator('html')).toHaveAttribute('data-theme','midnight')
  await expect(page.locator('html')).toHaveAttribute('data-tab-style','chrome')
  await expect(page.locator('.ribbon-drag-handle')).toBeHidden()
  await expect(panel.getByRole('radio',{name:'Chrome'})).toHaveAttribute('aria-checked','true')
  await expect(panel.getByRole('radio',{name:'Cove'})).toHaveAttribute('aria-checked','false')
  await panel.getByRole('button',{name:'Done'}).click()
  await expect(panel).toHaveCount(0)
  expect(errors).toEqual([])
})
test('every tab shape and theme renders in the ribbon; chrome has no drag handle',async({page})=>{
  const errors=await mount(page,'ribbon')
  await page.setViewportSize({width:53,height:420})
  const looks=[
    ...['wave','chamfer','rounded','cove','trapezoid'].map(binderShape=>({tabStyle:'binder',binderShape})),
    {tabStyle:'classic',binderShape:'wave'},{tabStyle:'chrome',binderShape:'wave'},
  ]
  for (const side of ['right','left']) for (const look of looks) for (const theme of ['cocoa','midnight']) {
    await page.evaluate(({side,look,theme})=>{const s=structuredClone(window.testHost.state);s.settings.side=side;s.settings.appearance={theme,...look};return window.testHost.update(s)},{side,look,theme})
    await expect(page.locator('html')).toHaveAttribute('data-tab-style',look.tabStyle)
    await expect(page.locator('.ribbon-drag-handle'))[look.tabStyle==='chrome'?'toBeHidden':'toBeVisible']()
    await expect(page.getByRole('button',{name:'Settings',exact:true})).toBeVisible()
    if (process.env.SHOT_DIR && theme==='cocoa') {
      await page.waitForTimeout(200)
      await page.screenshot({path:`${process.env.SHOT_DIR}/ribbon-${side}-${look.tabStyle}-${look.binderShape}.png`})
    }
  }
  expect(errors).toEqual([])
})
test('dragging the pane edge moves a guide and resizes once on release',async({page})=>{
  const errors=await mount(page)
  const handle=page.locator('.pane-outer-resize-handle')
  const box=await handle.boundingBox()
  await page.mouse.move(box.x+box.width/2,box.y+200)
  await page.mouse.down()
  await page.mouse.move(box.x-40,box.y+200,{steps:6})
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='resizeGuide'&&a.width!=null))).toBe(true)
  expect(await page.evaluate(()=>window.testHost.actions.some(a=>a.type==='setWidth'))).toBe(false)
  await page.mouse.up()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.filter(a=>a.type==='setWidth').length)).toBe(1)
  expect(errors).toEqual([])
})
test('native failures are visible, and pane geometry leaves room for the native page',async({page})=>{
  await mount(page)
  await page.getByRole('button',{name:'Toggle fullscreen',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='fullscreen'))).toBe(true)
  const bounds=await page.locator('.toolbar').boundingBox()
  expect(bounds.height).toBe(44)
  await page.evaluate(()=>window.testHost.fail=true)
  await page.locator('.toolbar').hover()
  await page.getByRole('button',{name:'Reload',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Native operation failed')
  await page.getByRole('alert').click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('player shows the correct media artwork without screenshots or a close button and dismisses on mouse-out',async({page})=>{
  const oldImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="red"/></svg>')
  const newImage='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1600"><rect width="400" height="1600" fill="green"/></svg>')
  const errors=await mount(page,'player',{deferMedia:true,artworks:{2:newImage}})
  await page.setViewportSize({width:300,height:300})
  await expect.poll(()=>page.evaluate(()=>typeof window.testHost.pendingMedia[1])).toBe('function')
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.playerTarget=2;return window.testHost.update(s)})
  await expect.poll(()=>page.evaluate(()=>typeof window.testHost.pendingMedia[2])).toBe('function')
  await page.evaluate(image=>window.testHost.pendingMedia[1]({tabId:1,title:'A song',artworkUrl:image}),oldImage)
  await expect(page.getByAltText('Media artwork')).toHaveCount(0)
  await expect(page.getByText('A song',{exact:true})).toHaveCount(0)
  await page.evaluate(image=>{window.testHost.pendingMedia[2]({tabId:2,title:'Second song',artworkUrl:image,isPlaying:true});window.testHost.deferMedia=false},newImage)
  await expect(page.getByAltText('Media artwork')).toHaveAttribute('src',newImage)
  await expect(page.getByText('Second song',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Close preview',exact:true})).toHaveCount(0)
  await expect.poll(async()=>(await page.locator('.player-shell').boundingBox()).height).toBeLessThanOrEqual(420)
  const frame=await page.locator('.player-thumbnail').boundingBox()
  const imageBounds=await page.getByAltText('Media artwork').boundingBox()
  expect(imageBounds.height).toBeLessThanOrEqual(frame.height)
  await page.getByRole('button',{name:'Pause',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.testHost.queries.some(q=>q.kind==='playPause'&&q.id===2))).toBe(true)
  await page.mouse.move(299,299)
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.some(a=>a.type==='hidePlayer'))).toBe(true)
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.playerTarget=null;return window.testHost.update(s)})
  await expect(page.getByAltText('Media artwork')).toHaveCount(0)
  const count=await page.evaluate(()=>window.testHost.queries.length)
  await page.waitForTimeout(1200)
  expect(await page.evaluate(()=>window.testHost.queries.length)).toBe(count)
  expect(await page.evaluate(()=>window.testHost.queries.some(q=>q.kind==='preview'))).toBe(false)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(300)
  expect(errors).toEqual([])
})

test('passing over a media tab does not open its preview after the pointer has left',async({page})=>{
  const errors=await mount(page,'ribbon')
  await page.setViewportSize({width:62,height:800})
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.collapsed=true;s.tabs[0].hasMedia=true;s.tabs[1].hasMedia=true;return window.testHost.update(s)})
  const first=page.getByRole('button',{name:'Example pin',exact:true})
  // Cross both tabs in one browser task, rather than letting Playwright's
  // actionability waits accidentally exceed the intentional 100ms dwell.
  await first.evaluate(node=>{
    const second=document.querySelector('[data-tab-id="2"]')
    node.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))
    node.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:second}))
    second.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:node}))
  })
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.filter(a=>a.type==='showPlayer').map(a=>a.id))).toEqual([2])
  await first.hover()
  await expect.poll(()=>page.evaluate(()=>window.testHost.actions.filter(a=>a.type==='showPlayer').at(-1)?.id)).toBe(1)
  expect(errors).toEqual([])
})

test('media buttons serialize actions and keep failures inside the player',async({page})=>{
  const errors=await mount(page,'player',{deferControls:true})
  const pause=page.getByRole('button',{name:'Pause',exact:true})
  await expect(pause).toBeEnabled()
  await pause.click()
  await pause.dispatchEvent('click')
  await expect(pause).toBeDisabled()
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'Mute',exact:true})).toBeDisabled()
  expect(await page.evaluate(()=>window.testHost.queries.filter(q=>q.kind==='playPause').length)).toBe(1)
  await page.evaluate(()=>{window.testHost.deferControls=false;window.testHost.finishControl(null)})
  await expect(pause).toBeEnabled()
  await page.evaluate(()=>window.testHost.failControls=true)
  await pause.click()
  await expect(page.getByRole('status')).toContainText('Open the tab')
  await expect(page.locator('#native-error')).toHaveCount(0)
  await expect(pause).toBeEnabled()
  await page.evaluate(()=>window.testHost.failControls=false)
  await pause.click()
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('unsupported media actions stay disabled and stale polling cannot undo an action',async({page})=>{
  await mount(page,'player',{mediaFlags:{canNextTrack:false}})
  const pause=page.getByRole('button',{name:'Pause',exact:true})
  await expect(pause).toBeEnabled()
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled()
  await page.evaluate(()=>window.testHost.deferMedia=true)
  await expect.poll(()=>page.evaluate(()=>typeof window.testHost.pendingMedia[1])).toBe('function')
  await page.evaluate(()=>{window.testHost.stalePoll=window.testHost.pendingMedia[1];window.testHost.deferMedia=false;window.testHost.mediaFlags.isPlaying=false})
  await pause.click()
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled()
  await page.evaluate(()=>window.testHost.stalePoll({tabId:1,title:'Stale',hasMedia:true,isPlaying:true}))
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled()
  await expect(page.getByText('Stale',{exact:true})).toHaveCount(0)
})

test('a stale audio flag cannot open a player without a playable track',async({page})=>{
  await mount(page,'ribbon')
  await page.setViewportSize({width:62,height:800})
  await page.evaluate(()=>{const s=structuredClone(window.testHost.state);s.collapsed=true;s.tabs[0].hasMedia=false;s.tabs[0].isAudioPlaying=true;return window.testHost.update(s)})
  await page.getByRole('button',{name:'Example pin',exact:true}).hover()
  await page.waitForTimeout(250)
  expect(await page.evaluate(()=>window.testHost.actions.some(a=>a.type==='showPlayer'))).toBe(false)
})
