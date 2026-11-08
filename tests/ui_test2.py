import asyncio
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/index.html'
errors = []
async def sim(pg, target):
    await pg.evaluate("""(t)=>{const s=document.querySelector('[data-change=simSelect]'); if(!s) return; s.value=t; s.dispatchEvent(new Event('change',{bubbles:true}));}""", target)
    await pg.wait_for_timeout(400)
    await pg.wait_for_function("!document.getElementById('busy').classList.contains('on')", timeout=180000)
    await pg.wait_for_timeout(500)
async def click_primary(pg):
    await pg.click('#top .simbar .btn.pri')
    await pg.wait_for_timeout(300)
    await pg.wait_for_function("!document.getElementById('busy').classList.contains('on')", timeout=180000)
    await pg.wait_for_timeout(600)
async def check(pg, label):
    txt = await pg.inner_text('#main')
    if 'Something went wrong' in txt: errors.append(label + ': ' + txt[:300])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900})
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        pg.on('console', lambda m: errors.append(f'[console] {m.text}') if m.type == 'error' and 'net::' not in m.text and 'Failed to load' not in m.text else None)
        await pg.goto(URL + '#/start'); await pg.wait_for_timeout(2000)
        await pg.click('[data-act=startMode][data-mode=preseason]'); await pg.wait_for_timeout(500)
        await pg.click('#fantasy')
        await pg.click('[data-act=pickTeam][data-abbr=CHI]')
        await pg.click('[data-act=createLeague]')
        await pg.wait_for_timeout(4000)
        if await pg.query_selector('#tourSkip'): await pg.click('#tourSkip')
        await pg.goto(URL + '#/fantasy'); await pg.wait_for_timeout(1500); await check(pg, 'fantasy')
        await pg.screenshot(path='/tmp/u_fantasy.png')
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('[data-act=fdSimAll]')
        await pg.wait_for_timeout(500)
        await pg.wait_for_function("!document.getElementById('busy').classList.contains('on')", timeout=120000)
        await pg.wait_for_timeout(1500)
        print('after fantasy:', (await pg.inner_text('#top'))[:120].replace('\n', ' | '))
        t0 = asyncio.get_event_loop().time()
        await click_primary(pg)  # preseason week
        await sim(pg, 'playoffs')
        print('sim to playoffs took', round(asyncio.get_event_loop().time() - t0, 1), 's')
        await pg.goto(URL + '#/standings'); await pg.wait_for_timeout(800); await check(pg, 'standings')
        await sim(pg, 'seasonEnd')
        await pg.goto(URL + '#/history'); await pg.wait_for_timeout(800); await check(pg, 'history')
        await pg.click('[data-act=histTab][data-k=awards]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/u_awards.png')
        await click_primary(pg)  # -> RESIGN
        await pg.goto(URL + '#/home'); await pg.wait_for_timeout(1000); await check(pg, 'home resign')
        await pg.screenshot(path='/tmp/u_resign.png')
        btn = await pg.query_selector('[data-act=negotiate]')
        if btn:
            await btn.click(); await pg.wait_for_timeout(800)
            await pg.click('[data-act=ngSubmit]'); await pg.wait_for_timeout(800)
            await pg.screenshot(path='/tmp/u_neg.png')
            await pg.keyboard.press('Escape')
        await click_primary(pg)  # -> FA
        await pg.goto(URL + '#/fa'); await pg.wait_for_timeout(1200); await check(pg, 'fa')
        await pg.screenshot(path='/tmp/u_fa.png')
        await click_primary(pg)  # -> League meeting
        await pg.goto(URL + '#/rules'); await pg.wait_for_timeout(800); await check(pg, 'rules')
        v = await pg.query_selector('[data-act=vote]')
        if v: await v.click(); await pg.wait_for_timeout(600)
        await pg.screenshot(path='/tmp/u_rules.png')
        await click_primary(pg)  # -> Draft
        await pg.goto(URL + '#/draft'); await pg.wait_for_timeout(1200); await check(pg, 'draft')
        sn = await pg.query_selector('[data-act=draftSimNext]')
        if sn:
            await sn.click(); await pg.wait_for_timeout(500)
            await pg.wait_for_function("!document.getElementById('busy').classList.contains('on')", timeout=120000)
            await pg.wait_for_timeout(1000)
        await pg.screenshot(path='/tmp/u_draft.png')
        pk = await pg.query_selector('[data-act=draftPick]')
        if pk:
            await pk.click(); await pg.wait_for_timeout(500)
            await pg.wait_for_function("!document.getElementById('busy').classList.contains('on')", timeout=120000)
            await pg.wait_for_timeout(800)
        await check(pg, 'draft after pick')
        # mobile layout
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await pg.goto(URL + '#/home'); await pg.wait_for_timeout(1000)
        await pg.screenshot(path='/tmp/u_mobile.png')
        await b.close()
asyncio.run(main())
print('\n'.join(errors) if errors else 'NO ERRORS')
