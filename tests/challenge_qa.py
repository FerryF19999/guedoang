"""Exercise the hero, challenge links and sharing fallbacks against disposable vote data."""
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

from preview import chromium, preview


POLL_ID = 'contoh-split-bill'
ANSWERS = ['Sesuai pesanan, dong', 'Bagi rata aja, santai']
REASON = 'Catatan pribadi tentang makan malam kemarin.'


def vote(page):
    page.get_by_role('button', name='Pilih & lihat hasil').click()
    expect(page.locator('.result-row')).to_have_count(2)


def challenge_button(page):
    return page.get_by_role('button', name='Tantang 1 temen', exact=True)


def assert_url(link, origin, **parameters):
    parts = urlsplit(link)
    assert f'{parts.scheme}://{parts.netloc}' == origin and not parts.query, link
    assert parse_qs(parts.fragment, keep_blank_values=True) == {
        key: [value] for key, value in parameters.items()
    }, link


with preview() as origin, sync_playwright() as playwright:
    browser = chromium(playwright)
    sender = browser.new_context(permissions=['clipboard-read', 'clipboard-write'])
    # Exercise the actual clipboard even when this browser happens to offer native sharing.
    sender.add_init_script("Object.defineProperty(navigator, 'share', {configurable: true, value: undefined})")
    page = sender.new_page()
    page.goto(origin)
    hero = page.locator('#hero-choices')
    expect(hero.get_by_role('button')).to_have_text(ANSWERS)
    expect(page.locator('#hero-stats')).to_have_text('2 pilihan · 0 suara')
    hero.get_by_role('button', name=ANSWERS[1], exact=True).click()
    expect(page.locator('#vote-form input[value="1"]')).to_be_checked()
    expect(page.locator('#vote-form input[value="0"]')).not_to_be_checked()
    snapshot = sender.request.get(f'{origin}/api/polls?id={POLL_ID}').json()['poll']
    assert snapshot['counts'] == [0, 0] and snapshot['myVote'] is None
    page.locator('.vote-reason summary').click()
    page.locator('#reason').fill(REASON)
    vote(page)

    page.get_by_role('button', name='Salin tautan').click()
    page.wait_for_function("async () => (await navigator.clipboard.readText()).includes('#id=')")
    neutral = page.evaluate('navigator.clipboard.readText()')
    assert_url(neutral, origin, id=POLL_ID)
    challenge_button(page).click()
    page.wait_for_function("async () => (await navigator.clipboard.readText()).includes('&vs=')")
    challenge = page.evaluate('navigator.clipboard.readText()')
    assert_url(challenge, origin, id=POLL_ID, vs='1')

    page.evaluate("""() => Object.defineProperty(navigator, 'share', {
        configurable: true, value: async data => { window.sharedData = data }
    })""")
    challenge_button(page).click()
    payload = page.evaluate('window.sharedData')
    assert payload['url'] == challenge and REASON not in str(payload) and 'files' not in payload, payload
    assert '2 pilihan' in payload['text'] and ANSWERS[1] not in payload['text']

    page.evaluate("""async () => {
        await navigator.clipboard.writeText('unchanged')
        Object.defineProperty(navigator, 'share', {configurable: true, value: async () => {
            throw new DOMException('User cancelled', 'AbortError')
        }})
    }""")
    challenge_button(page).click()
    expect(page.locator('#share-link')).to_have_count(0)
    assert page.evaluate('navigator.clipboard.readText()') == 'unchanged'

    # Both share targets must remain usable when platform and clipboard access are refused.
    page.evaluate("""() => {
        const denied = async () => { throw new DOMException('Denied', 'NotAllowedError') }
        Object.defineProperty(navigator, 'share', {configurable: true, value: denied})
        Object.defineProperty(navigator.clipboard, 'writeText', {configurable: true, value: denied})
    }""")
    challenge_button(page).click()
    manual = page.locator('#share-link')
    expect(manual).to_have_value(challenge)
    assert manual.evaluate('input => input.readOnly')
    page.get_by_role('button', name='Salin tautan').click()
    expect(manual).to_have_value(neutral)
    sender.close()

    for choice, result, votes_before, chosen_votes in [(0, 'Beda kubu!', 1, 1), (1, 'Lu satu tim!', 2, 2)]:
        recipient = browser.new_context()
        receiver = recipient.new_page()
        receiver.goto(challenge)
        expect(receiver.locator('#challenge-prompt')).to_be_visible()
        expect(receiver.locator('#challenge-prompt')).to_contain_text(f'{votes_before} suara masuk.')
        expect(receiver.locator('#challenge-prompt')).not_to_contain_text(ANSWERS[1])
        expect(receiver.locator('#challenge-result, .result-row, #vote-form input:checked')).to_have_count(0)
        expect(receiver.locator('#detail-body')).not_to_contain_text(REASON)
        receiver.locator(f'#vote-form input[value="{choice}"]').check()
        vote(receiver)
        comparison = receiver.locator('#challenge-result')
        expect(comparison).to_contain_text(result)
        expect(comparison).to_contain_text(ANSWERS[1])
        expect(receiver.locator('#detail-body')).not_to_contain_text(REASON)
        receiver.reload()
        expect(comparison).to_contain_text(result)
        receiver.goto(origin + '/#id=contoh-weekend')
        expect(receiver.locator('#detail-title')).to_contain_text('nongkrong')
        expect(receiver.locator('#challenge-prompt, #challenge-result')).to_have_count(0)
        for link in [neutral, neutral + '&vs=19', neutral + '&vs=0&vs=1']:
            receiver.goto(link)
            expect(receiver.locator('.result-row')).to_have_count(2)
            expect(receiver.locator('#challenge-result')).to_have_count(0)
        receiver.goto(origin)
        expect(receiver.locator('#hero-feed-link')).to_be_visible()
        expect(receiver.locator('#hero-choices')).to_be_hidden()
        expect(receiver.locator('#hero-intro')).to_contain_text(f'{chosen_votes} dari {votes_before + 1} suara.')
        recipient.close()
    browser.close()
    print('PASS: direct hero vote, neutral and challenge links, share fallbacks, private reason, match and mismatch')
