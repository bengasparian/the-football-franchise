import asyncio, sys, json
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/index.html'
errors = []
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        await pg.screenshot(path='/tmp/s_start.png')
        await pg.click('[data-act=pickTeam][data-abbr=BUF]')
        await pg.click('[data-act=createLeague]')
        await pg.wait_for_selector('.hero-team', timeout=60000)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path='/tmp/s_home.png', full_page=False)
        routes = ['roster','depth','schedule','standings','stats','teams','news','history','cap','staff','owner','trade','finder','offers','fa','draft','rules','settings','online']
        for r in routes:
            await pg.goto(URL + '#/' + r); await pg.wait_for_timeout(700)
            txt = await pg.inner_text('#main')
            if 'Something went wrong' in txt: errors.append(f'PAGE {r}: ' + txt[:300])
        await pg.goto(URL + '#/roster'); await pg.wait_for_timeout(600)
        await pg.click('#main table tbody tr td a')
        await pg.wait_for_timeout(700)
        for t in ['ratings','stats','contract','persona','history']:
            await pg.click(f'[data-act=ptab][data-k={t}]'); await pg.wait_for_timeout(300)
            txt = await pg.inner_text('#main')
            if 'Something went wrong' in txt: errors.append('PLAYER TAB ' + t + txt[:200])
        await pg.screenshot(path='/tmp/s_player.png')
        # sim a week
        await pg.goto(URL + '#/home'); await pg.wait_for_timeout(500)
        await pg.click('[data-act=sim][data-target=week]')
        await pg.wait_for_function("!document.getElementById('busy').classList.contains('on')", timeout=60000)
        await pg.wait_for_timeout(600)
        await pg.goto(URL + '#/schedule'); await pg.wait_for_timeout(600)
        await pg.click('[data-act=schedView][data-v=league]'); await pg.wait_for_timeout(600)
        cards = await pg.query_selector_all('.gamecard')
        if cards:
            await cards[0].click(); await pg.wait_for_timeout(800)
            await pg.screenshot(path='/tmp/s_box.png')
            await pg.keyboard.press('Escape')
        # standings playoff view
        await pg.goto(URL + '#/standings'); await pg.wait_for_timeout(500)
        await pg.click('[data-act=standView][data-v=playoff]'); await pg.wait_for_timeout(400)
        await pg.screenshot(path='/tmp/s_stand.png')
        # trade center select player from other team
        await pg.goto(URL + '#/trade'); await pg.wait_for_timeout(1000)
        assets = await pg.query_selector_all('[data-act=trToggle][data-side=get]')
        if assets: await assets[0].click(); await pg.wait_for_timeout(1000)
        await pg.click('[data-act=trMake]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/s_trade.png')
        print('header:', (await pg.inner_text('#top'))[:200].replace('\n',' | '))
        await b.close()
asyncio.run(main())
print('\n'.join(errors) if errors else 'NO ERRORS')
