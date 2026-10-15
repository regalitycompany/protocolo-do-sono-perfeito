# Gera b.html (variante B do teste A/B) a partir do index.html:
# mesma <head>, hero e barra de confiança; da 2ª dobra em diante usa tools/b-sections.html.
# Rodar de novo sempre que a hero do index.html mudar:  python3 tools/build-b.py
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'index.html').read_text(encoding='utf-8')
sections = (root / 'tools' / 'b-sections.html').read_text(encoding='utf-8')
css = (root / 'tools' / 'b.css').read_text(encoding='utf-8')

start = src.index('<!-- ============================================================\n     BLOCO 2')
end = src.index('<!-- ============================================================\n     BLOCO 15')
out = src[:start] + sections + src[end:]

# sem popup de "fulana acabou de comprar" na B (prova só com prints reais)
pop_a = out.index('<!-- ========== SOCIAL PROOF POPUP ========== -->')
pop_b = out.index('</div>\n\n', out.index('<div id="sp-popup">')) + len('</div>\n\n')
out = out[:pop_a] + out[pop_b:]
js_a = out.index('/* ======= SOCIAL PROOF POPUP ======= */')
js_b = out.index('</script>', js_a)
out = out[:js_a] + out[js_b:]

# marca a variante no pixel e no painel (o painel também separa pela URL /b)
out = out.replace("PSP.pvId=PSP.eid('pv');", "PSP.variant='B';PSP.pvId=PSP.eid('pv');", 1)
out = out.replace("content_category:'Baby Sleep',", "content_category:'Baby Sleep',variant:'B',", 1)
out = out.replace('</head>', '<meta name="robots" content="noindex"/>\n<style>\n' + css + '</style>\n</head>', 1)

(root / 'b.html').write_text(out, encoding='utf-8')
print('b.html', len(out))
