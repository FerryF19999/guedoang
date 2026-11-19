from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'qa'; out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,accept_downloads=True,permissions=['clipboard-read','clipboard-write'])
 page=context.new_page(); errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 response=page.goto('http://localhost:4174/');assert response.status==200
 assert page.locator('.card').count()==6
 assert page.locator('.card-bottom').filter(has_text='0 pilihan lokal').count()==6
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 page.screenshot(path=str(out/'mobile-home.png'),full_page=True)
 page.get_by_role('button',name='Duit',exact=True).click();assert page.locator('.card').count()==1
 page.get_by_role('button',name='Semua',exact=True).click()
 page.locator('#create-top').click(); page.locator('#question').fill('Gue doang yang suka jalan kaki setelah kerja?')
 page.locator('#topic').select_option('Sehari-hari')
 page.get_by_role('textbox',name='Pilihan 1',exact=True).fill('Iya, biar santai')
 page.get_by_role('textbox',name='Pilihan 2',exact=True).fill('Mending langsung pulang')
 page.locator('#add-option').click();page.get_by_role('textbox',name='Pilihan 3',exact=True).fill('Tergantung cuaca')
 page.locator('#add-option').click();page.get_by_role('textbox',name='Pilihan 4',exact=True).fill('Naik sepeda aja');assert page.locator('#add-option').is_disabled()
 page.get_by_role('button',name='Lempar sekarang').click()
 assert page.locator('#detail').is_visible();assert page.locator('#vote-form input[type=radio]').count()==4
 page.locator('#vote-form input[value="2"]').check();page.locator('#reason').fill('Kalau hujan aku langsung pulang.')
 page.get_by_role('button',name='Pilih & lihat hasil').click();assert page.locator('.result-row').count()==4
 assert page.locator('.reason').inner_text()=='Kalau hujan aku langsung pulang.'
 assert page.locator('#vote-form').count()==0
 page.get_by_role('button',name='Salin tautan').click();link=page.evaluate('navigator.clipboard.readText()');assert '#poll=' in link
 with page.expect_download() as download:
  page.get_by_role('button',name='Bagikan pilihanku').click()
 dl=download.value;dl.save_as(out/'result-card.png');assert (out/'result-card.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
 page.screenshot(path=str(out/'mobile-results.png'))
 page.reload();page.locator('.card').first.get_by_role('button',name='Lihat dilema').click();assert page.locator('.result-row').count()==4
 assert page.locator('#vote-form').count()==0
 fresh=browser.new_context(viewport={'width':390,'height':844});recipient=fresh.new_page();recipient.goto(link);assert recipient.locator('#vote-form input[type=radio]').count()==4;assert recipient.locator('.result-row').count()==0
 assert recipient.locator('#detail-title').inner_text()=='Gue doang yang suka jalan kaki setelah kerja?'
 page.get_by_role('button',name='Laporkan & sembunyikan').click();page.locator('#report-reason').select_option('Spam atau promosi');page.get_by_role('button',name='Simpan laporan & sembunyikan').click()
 assert page.locator('.card').count()==6
 page.reload();assert page.locator('.card').count()==6
 page.locator('#moderation').click();assert page.locator('.hidden-report').count()==1;page.get_by_role('button',name='Tampilkan lagi').click();assert page.locator('.hidden-report').count()==0
 page.locator('#info .close').click();assert page.locator('.card').count()==7
 # Injection is rendered literally, never executed.
 page.locator('#create-top').click();page.locator('#question').fill('Gue doang? <img src=x onerror=alert(1)>');page.get_by_role('textbox',name='Pilihan 1',exact=True).fill('<b>Literal</b>');page.get_by_role('textbox',name='Pilihan 2',exact=True).fill('Aman kok');page.get_by_role('button',name='Lempar sekarang').click();assert page.locator('#detail img').count()==0
 page.locator('#detail .close').click();page.set_viewport_size({'width':320,'height':740});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 desktop=browser.new_context(viewport={'width':1440,'height':1000});dp=desktop.new_page();dp.goto('http://localhost:4174/');dp.screenshot(path=str(out/'desktop-home.png'),full_page=True)
 assert not errors,errors
 result={'status':'PASS','browser':'Chromium','checks':['HTTP 200','six samples zero votes','topic filter','create four-option poll','vote with reason','results','duplicate vote blocked after reload','copy permalink','fresh browser receives question but zero votes','PNG download signature','report persists and hides','restore report','literal HTML/XSS text','390px and 320px no horizontal overflow','desktop screenshot','no page errors'],'pageErrors':errors,'downloadBytes':(out/'result-card.png').stat().st_size}
 (out/'results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2));browser.close()
