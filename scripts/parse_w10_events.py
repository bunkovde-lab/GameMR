"""W10: разбор сценария W10_EVENTS_v1.md в промежуточный JSON для build_w10_events.py."""
import re, json, sys
src = open(sys.argv[1], encoding='utf-8').read()
blocks = re.split(r'\n### EV-(\d\d)\. ', src)[1:]
out = []
for num, body in zip(blocks[::2], blocks[1::2]):
    body = body.split('\n## ')[0]
    title = body.split('\n', 1)[0].strip()
    def field(name):
        m = re.search(r'^- \*{0,2}' + re.escape(name) + r'\*{0,2}:?\*{0,2}\s*(.+)$', body, re.M)
        return m.group(1).strip() if m else ''
    e = {'num': num, 'title': title}
    e['district'] = re.search(r'Район: `(\w+)`', body).group(1)
    m = re.search(r'Класс: \*\*(\w+)\*\*; тип угрозы: ([^;]+); опасность: \*\*(\w+)\*\*; относительная нагрузка: (\w+)', body)
    e['cls'], e['threat'], e['danger'], e['grade'] = m.groups()
    m = re.search(r'Срок: \*\*(\w+)\*\*; при опоздании: (.+)$', body, re.M)
    e['term'], e['late'] = m.groups()
    e['qualities'] = field('Нужные качества').rstrip('.')
    e['role'] = field('Нужная роль').rstrip('.')
    e['tactics'] = field('Тактики')
    e['known'] = re.search(r'\*\*Что известно игроку:\*\* (.+)$', body, re.M).group(1).strip()
    e['hidden'] = re.search(r'\*\*Скрытая правда \(Core only\):\*\* (.+)$', body, re.M).group(1).strip()
    e['consequences'] = re.search(r'\*\*Последствия:\*\* (.+)$', body, re.M).group(1).strip()
    sc = re.search(r'Сцена: `([^`]+)`', body); e['scene'] = sc.group(1).replace('.png', '') if sc else None
    e['campaign'] = field('Связь с кампанией').rstrip('.')
    fl = re.search(r'флаг Core: `([^`]+)`', body); e['flags'] = [x.strip() for x in fl.group(1).split(';')] if fl else []
    integ = field('Интеграция'); e['integration'] = integ
    # forks / phases
    forks = []
    fm = re.search(r'\*\*(Развилки|Фазы)[^*]*\*\*:?(.*?)(?=\n- \*\*Последствия)', body, re.S)
    if fm:
        for q in re.finditer(r'\n\s*\d\.\s*\*(.+?)\*\s*\n((?:\s+- .+\n?)+)', fm.group(2)):
            opts = [o.strip()[2:] for o in q.group(2).strip().split('\n')]
            forks.append({'q': q.group(1).strip(), 'options': opts})
        e['forksRaw'] = fm.group(2).strip()[:1500] if not forks else None
    e['forks'] = forks
    out.append(e)
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out))
for e in out: print(e['num'], e['cls'], e['danger'], e['grade'], e['term'], e['role'], '|', e['qualities'], '| forks', len(e['forks']), [len(f['options']) for f in e['forks']], e.get('forksRaw') is not None)
