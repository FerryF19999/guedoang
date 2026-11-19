"""Personal-card UI downloads + Chromium canvas content/boundary regression."""
from pathlib import Path
import json, struct
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'qa'; OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    assert page.goto('http://localhost:4174/').status==200
    downloads={}
    def download(name, voted=True):
        label='Bagikan pilihanku' if voted else 'Bagikan pertanyaan'
        with page.expect_download() as event:
            page.get_by_role('button',name=label,exact=True).click()
        dest=OUT/name; event.value.save_as(dest)
        assert ('pilihanku' if voted else 'pertanyaan') in event.value.suggested_filename
        raw=dest.read_bytes(); assert raw[:8]==b'\x89PNG\r\n\x1a\n'
        width,height=struct.unpack('>II',raw[16:24])
        assert width==1080 and 560<=height<=2200
        downloads[name]={'bytes':len(raw),'dimensions':[width,height],'source':'UI download'}
    page.locator('.card').first.get_by_role('button',name='Lihat dilema').click()
    assert page.get_by_role('button',name='Bagikan pilihanku',exact=True).count()==0
    assert page.locator('#vote-form input:checked').count()==0
    assert 'belum terhubung ke server bersama' in page.locator('#detail-body').inner_text()
    download('personal-choice-zero.png',False)
    # Even a checked radio and draft reason are NOT a submitted vote.
    page.locator('#vote-form input[value="0"]').check()
    page.locator('#reason').fill('Biar adil, bayar yang kita pesan. Tetap bisa makan bareng tanpa bikin dompet orang lain kepikiran.')
    download('personal-choice-unsubmitted.png',False)
    assert (OUT/'personal-choice-zero.png').read_bytes()==(OUT/'personal-choice-unsubmitted.png').read_bytes()
    assert page.evaluate("Object.keys(JSON.parse(localStorage.getItem('gue-doang-demo-v1')||'{\"votes\":{}}').votes).length")==0
    page.screenshot(path=str(OUT/'personal-choice-zero-ui.png'))
    page.get_by_role('button',name='Pilih & lihat hasil').click()
    assert page.get_by_role('button',name='Bagikan pertanyaan',exact=True).count()==0
    download('personal-choice-card.png')
    page.screenshot(path=str(OUT/'personal-choice-ui.png'))
    page.reload();page.locator('.card').first.get_by_role('button',name='Lihat dilema').click()
    download('personal-choice-reloaded.png')
    assert (OUT/'personal-choice-card.png').read_bytes()==(OUT/'personal-choice-reloaded.png').read_bytes()
    page.locator('#detail .close').click()
    # No-reason path, using the second option rather than an assumed first.
    page.locator('.card').nth(1).get_by_role('button',name='Lihat dilema').click()
    page.locator('#vote-form input[value="1"]').check()
    page.get_by_role('button',name='Pilih & lihat hasil').click()
    download('personal-choice-no-reason.png')
    page.locator('#detail .close').click()
    page.locator('#create-top').click()
    question=('Gue doang yang butuh waktu sendiri setelah kerja, walau teman-teman ngajak ketemu dan ngobrol sampai malam? '*2)[:180]
    page.locator('#question').fill(question)
    options=['Tetap di rumah, istirahat dulu sebelum besok mulai kerja lagi!','W'*60,'Ikut sebentar, lalu pulang lebih awal supaya bisa tidur cukup.','Bilang jujur kalau lagi capek dan cari waktu lain buat ketemu.']
    for i,opt in enumerate(options):
        if i>1:page.locator('#add-option').click()
        page.get_by_role('textbox',name=f'Pilihan {i+1}',exact=True).fill(opt)
    page.get_by_role('button',name='Lempar sekarang').click()
    page.locator('#vote-form input[value="1"]').check()
    page.locator('#reason').fill('W'*160)
    page.get_by_role('button',name='Pilih & lihat hasil').click()
    download('personal-choice-long.png')
    page.screenshot(path=str(OUT/'personal-choice-long-ui.png'))
    page.locator('#detail .close').click()
    page.locator('#create-top').click()
    page.locator('#question').fill('Gue doang yang butuh jeda? 👩🏽‍💻 Pulang, minum café, lalu ngobrol 家人?')
    page.get_by_role('textbox',name='Pilihan 1',exact=True).fill('Istirahat dulu 👩🏽‍💻')
    page.get_by_role('textbox',name='Pilihan 2',exact=True).fill('Ngobrol bareng keluarga 👨‍👩‍👧‍👦')
    page.get_by_role('button',name='Lempar sekarang').click()
    page.locator('#vote-form input[value="1"]').check()
    page.locator('#reason').fill('Aku pilih ngobrol.\nPelan-pelan, sambil minum café ☕ — 家人.')
    page.get_by_role('button',name='Pilih & lihat hasil').click()
    download('personal-choice-unicode.png')
    checks=page.evaluate(r'''async () => {
      const {renderResultCard}=await import('/src/result-card.js');
      const {validatePoll}=await import('/src/core.js');
      const cases=[];
      const compact=s=>s.replace(/\s/g,'');
      for(const count of [2,3,4]) for(const selected of [-1,...Array.from({length:count},(_,i)=>i)]) for(const kind of ['wide','words','literal','unicode','multiline']) {
        const content=kind==='wide'?'W':kind==='words'?'Pilihan panjang dengan kata berbeda ':kind==='literal'?'<img src=x onerror=alert(1)> ':kind==='multiline'?'Baris pertama.\nBaris kedua. ':'界😀 é 👩🏽‍💻 ';
        const poll=validatePoll({id:'stress',topic:'Sehari-hari',question:content.repeat(180).slice(0,180),options:Array.from({length:count},(_,i)=>String(i)+content.repeat(60).slice(0,59))});
        const voted=selected>=0;
        const state={votes:voted?{stress:{index:selected,reason:content.repeat(160).slice(0,160)}}:{}};
        const before=JSON.stringify(state);
        const {canvas,layout,mode}=renderResultCard(poll,state);
        if(JSON.stringify(state)!==before)throw Error('mutated vote state');
        if(mode!==(voted?'personal':'invitation'))throw Error('wrong mode');
        if(canvas.width!==1080||canvas.height<560||canvas.height>2200)throw Error('invalid dimensions '+canvas.height);
        const ctx=canvas.getContext('2d');
        for(const b of layout) {
          if(b.lines.length*b.lineHeight>b.h+.01)throw Error('vertical overflow '+JSON.stringify(b));
          ctx.font=b.font;
          if(b.lines.some(line=>ctx.measureText(line).width>b.w+.01))throw Error('horizontal overflow');
          if(b.x<72||b.x+b.w>1008||b.y<62||b.y+b.h>canvas.height-63)throw Error('outside safe area');
          if(b.size<24)throw Error('text too small '+b.size);
          if(b.font.includes('Georgia'))throw Error('unexpected decorative font');
        }
        for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){
          const a=layout[i],b=layout[j];
          if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)throw Error('overlapping text');
        }
        if(layout.some(b=>['percentage','count','option'].includes(b.role)))throw Error('aggregate or other options leaked');
        if(layout.filter(b=>b.role==='choice').length!==(voted?1:0))throw Error('invented/missing choice');
        if(layout.filter(b=>b.role==='reason').length!==(voted?1:0))throw Error('invented/missing reason');
        for(const [role,original] of [['question',poll.question],...(voted?[['choice',poll.options[selected]],['reason',state.votes.stress.reason]]:[])]){
          if(compact(layout.find(b=>b.role===role).lines.join(''))!==compact(original))throw Error('lost text '+role);
        }
        if(!layout.find(b=>b.role==='disclosure').lines.join(' ').includes('Demo lokal · Bukan hasil komunitas.'))throw Error('missing disclosure');
        if(layout.find(b=>b.role==='cta').lines.join(' ')!=='Kalau kamu?')throw Error('missing CTA');
        cases.push({count,selected,kind,height:canvas.height,sizes:layout.map(b=>b.size)});
      }
      return cases;
    }''')
    assert len(checks)==60
    assert not errors,errors
    report={'status':'PASS','dimensionPolicy':'1080 wide; content-measured height; complete text and 24px minimum','realUIDownloads':downloads,'canvasCases':checks,'pageErrors':errors,'checks':['unvoted invitation','unsubmitted selection not a vote','real selected option only','optional reason omitted','no aggregate roles','reload preserves identical export','all option indexes','2/3/4 options','Unicode and multiline','literal HTML','maximum content','no text overlap','safe bounds','full text preservation']}
    (OUT/'personal-choice-checks.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'status':report['status'],'canvasCases':len(checks),'downloads':downloads,'pageErrors':errors},indent=2));browser.close()
