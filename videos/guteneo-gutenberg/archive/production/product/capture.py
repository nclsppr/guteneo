from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import datetime, timezone
import json
out=Path(__file__).resolve().parent
manifest={'url':'https://guteneo.com/','captured_at':datetime.now(timezone.utc).isoformat(),'method':'Real Chromium browser screenshots of the live public website, unmodified UI. No login, no form submissions.','captures':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for label,w,h,dpr in [('desktop',1920,1080,1),('mobile',360,640,3)]:
  c=b.new_context(viewport={'width':w,'height':h},device_scale_factor=dpr,locale='fr-FR',is_mobile=label=='mobile',has_touch=label=='mobile')
  page=c.new_page()
  page.goto('https://guteneo.com/',wait_until='domcontentloaded',timeout=90000)
  page.wait_for_timeout(5000)
  page.evaluate('document.fonts.ready')
  page.screenshot(path=str(out/f'{label}.png'))
  manifest['captures'].append({'file':f'{label}.png','viewport_css':{'width':w,'height':h},'device_scale_factor':dpr,'output_px':{'width':w*dpr,'height':h*dpr},'section':'Homepage hero','scroll_y':0})
  # Align a real section in the viewport; no CSS or content is modified.
  top=page.locator('#how').evaluate('(e)=>e.getBoundingClientRect().top+window.scrollY')
  if label=='desktop':
   target=round(top-40)
  else:
   target=round(page.get_by_role('heading',name='L’épreuve avant l’envoi.').evaluate('(e)=>e.getBoundingClientRect().top+window.scrollY')-55)
  page.evaluate('(y)=>window.scrollTo(0,y)',target)
  page.wait_for_timeout(1200)
  page.screenshot(path=str(out/f'{label}-verification.png'))
  manifest['captures'].append({'file':f'{label}-verification.png','viewport_css':{'width':w,'height':h},'device_scale_factor':dpr,'output_px':{'width':w*dpr,'height':h*dpr},'section':'Public demonstration — verification, fictitious example. Not authenticated production app.','scroll_y':page.evaluate('window.scrollY')})
  if label=='mobile':
   target=round(top-20)
   page.evaluate('(y)=>window.scrollTo(0,y)',target)
   page.wait_for_timeout(1200)
   page.screenshot(path=str(out/'mobile-principe.png'))
   manifest['captures'].append({'file':'mobile-principe.png','viewport_css':{'width':w,'height':h},'device_scale_factor':dpr,'output_px':{'width':w*dpr,'height':h*dpr},'section':'Public demonstration — three-step principle.','scroll_y':page.evaluate('window.scrollY')})
  c.close()
 b.close()
out.joinpath('manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(json.dumps(manifest,ensure_ascii=False,indent=2))
