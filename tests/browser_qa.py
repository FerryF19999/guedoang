"""Two independent visitors vote on the same public poll using the normal UI."""
import json
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from preview import chromium, preview

OUT = Path(__file__).resolve().parents[1] / 'qa'
OUT.mkdir(exist_ok=True)

with preview() as origin, sync_playwright() as playwright:
    browser = chromium(playwright)
    phone = browser.new_context(viewport={'width': 390, 'height': 844},
                                accept_downloads=True, permissions=['clipboard-read', 'clipboard-write'])
    page = phone.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    assert page.goto(origin).status == 200
    expect(page.locator('.card')).to_have_count(6)
    page.screenshot(path=str(OUT / 'mobile-home.png'), full_page=True)
    page.get_by_role('button', name='Duit', exact=True).click()
    expect(page.locator('.card')).to_have_count(1)
    page.get_by_role('button', name='Semua', exact=True).click()

    question = 'Gue doang yang suka jalan kaki setelah kerja?'
    page.locator('#create-top').click()
    page.locator('#question').fill(question)
    for index, answer in enumerate(['Iya, biar santai', 'Mending langsung pulang', 'Tergantung cuaca', 'Naik sepeda aja'], 1):
        if index > 2:
            page.locator('#add-option').click()
        page.get_by_role('textbox', name=f'Pilihan {index}', exact=True).fill(answer)
    expect(page.locator('#add-option')).to_be_disabled()
    page.get_by_role('button', name='Lempar sekarang').click()
    expect(page.locator('#detail-title')).to_have_text(question)
    page.locator('#vote-form input[value="2"]').check()
    private_reason = 'Kalau hujan aku langsung pulang.'
    page.locator('.vote-reason summary').click()
    page.locator('#reason').fill(private_reason)
    page.get_by_role('button', name='Pilih & lihat hasil').click()
    expect(page.locator('.result-row')).to_have_count(4)
    expect(page.locator('#detail-body')).to_contain_text('Lu yang pertama milih!')
    expect(page.locator('.reason')).to_have_text(private_reason)

    page.get_by_role('button', name='Salin tautan').click()
    page.wait_for_function("async () => (await navigator.clipboard.readText()).includes('#id=')")
    link = page.evaluate('navigator.clipboard.readText()')
    poll_id = link.split('#id=')[1]
    with page.expect_download() as pending:
        page.get_by_role('button', name='Bagikan pilihanku').click()
    pending.value.save_as(OUT / 'result-card.png')
    assert (OUT / 'result-card.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
    page.screenshot(path=str(OUT / 'mobile-results.png'))

    # Another browser sees the public poll and counts, but no private answer or reason from the first.
    second = browser.new_context(viewport={'width': 1440, 'height': 1000})
    other = second.new_page()
    other.on('pageerror', lambda error: errors.append(str(error)))
    other.goto(origin)
    expect(other.locator('.card').filter(has_text=question)).to_have_count(1)
    other.screenshot(path=str(OUT / 'desktop-home.png'), full_page=True)
    other.goto(link)
    expect(other.locator('#detail-title')).to_have_text(question)
    expect(other.locator('#vote-form input[type=radio]')).to_have_count(4)
    snapshot = second.request.get(origin + '/api/polls?id=' + poll_id).json()['poll']
    assert snapshot['counts'] == [0, 0, 1, 0] and snapshot['myVote'] is None
    assert private_reason not in json.dumps(snapshot)
    other.locator('#vote-form input[value="0"]').check()
    other.get_by_role('button', name='Pilih & lihat hasil').click()
    expect(other.locator('.result-row')).to_have_count(4)
    expect(other.locator('.result-label b')).to_have_text(['50%', '0%', '50%', '0%'])
    expect(other.locator('#detail-body')).to_contain_text('Pilihan lu lagi seri di posisi teratas!')
    expect(other.locator('#detail-body')).to_contain_text('Pilihan lu dapat 1 dari 2 suara.')

    page.goto(link)
    expect(page.locator('.result-label b')).to_have_text(['50%', '0%', '50%', '0%'])
    expect(page.locator('.reason')).to_have_text(private_reason)
    expect(page.locator('#vote-form')).to_have_count(0)
    page.get_by_role('button', name='Laporkan & sembunyikan').click()
    page.locator('#report-reason').select_option('Spam atau promosi')
    page.get_by_role('button', name='Simpan laporan & sembunyikan').click()
    expect(page.locator('.card').filter(has_text=question)).to_have_count(0)
    page.goto(origin)
    expect(page.locator('.card')).to_have_count(6)
    other.goto(origin)
    expect(other.locator('.card').filter(has_text=question)).to_have_count(1)
    page.locator('#moderation').click()
    expect(page.locator('.hidden-report')).to_have_count(1)
    page.get_by_role('button', name='Tampilkan lagi').click()
    expect(page.locator('.hidden-report')).to_have_count(0)
    page.locator('#info .close').click()
    expect(page.locator('.card').filter(has_text=question)).to_have_count(1)

    page.locator('#create-top').click()
    page.locator('#question').fill('Gue doang yang nulis tag <b> di catatan?')
    page.get_by_role('textbox', name='Pilihan 1', exact=True).fill('<b>Literal</b>')
    page.get_by_role('textbox', name='Pilihan 2', exact=True).fill('Biasa aja')
    page.get_by_role('button', name='Lempar sekarang').click()
    expect(page.locator('#detail-title')).to_contain_text('<b>')
    expect(page.locator('.vote-option b')).to_have_count(0)
    page.locator('#detail .close').click()
    page.set_viewport_size({'width': 320, 'height': 740})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    result = {'status': 'PASS', 'countsAfterTwoVisitors': [1, 0, 1, 0], 'pageErrors': errors}
    (OUT / 'results.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
    browser.close()
