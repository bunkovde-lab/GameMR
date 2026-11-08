from pathlib import Path
import base64,re
root=Path(__file__).parent
html=(root/'index.html').read_text(encoding='utf-8')
css=(root/'styles.css').read_text(encoding='utf-8')
js=(root/'app.js').read_text(encoding='utf-8')
svg=(root/'assets/map-placeholder.svg').read_bytes()
css=css.replace("url('assets/map-placeholder.svg')", "url('data:image/svg+xml;base64,"+base64.b64encode(svg).decode()+"')")
js=js.replace("`url('assets/map-placeholder.svg')`", "`url('data:image/svg+xml;base64,"+base64.b64encode(svg).decode()+"')`")
html=html.replace('<link rel="stylesheet" href="styles.css" />', '<style>\n'+css+'\n</style>')
html=html.replace('<script src="app.js"></script>', '<script>\n'+js+'\n</script>')
(root.parent/'Mir_Raskola_UI_Prototype.html').write_text(html,encoding='utf-8')
print('Standalone',len(html),'bytes')
