"""W10: из сценария docs/story/W10_EVENTS_v1.md собирает content/incidents_w10.json и развилки новых
сложных/особых событий в content/operations_v1.json. Числа — проверочные гипотезы (PROVISIONAL), подбираются прогонами.

Запуск (повторный запуск перезаписывает те же записи):
  python3 scripts/parse_w10_events.py docs/story/W10_EVENTS_v1.md /tmp/w10_events.json
  python3 scripts/build_w10_events.py /tmp/w10_events.json .
"""
import json, sys
ev = {e['num']: e for e in json.load(open(sys.argv[1], encoding='utf-8'))}
ROOT = sys.argv[2]

ID = {'01':'medriot','02':'cold_seal','03':'organ_vault','04':'triage','05':'graft','06':'stairs_blood','07':'bioleak','08':'specimen',
      '09':'spectrometer','10':'courier_box','11':'incubator','12':'foreign_memory','13':'missing','14':'court_stairs','15':'court_seal',
      '16':'convoy','17':'two_protocols','18':'foreign_badge','19':'raid','20':'floor_hum','21':'red_circuit','22':'strike','23':'false_shift',
      '24':'collector','25':'dome_breach','26':'garden_turn','27':'spores','28':'barefoot','29':'green_water','30':'false_call','31':'illegal',
      '32':'stair_quarantine','33':'empty_flat','34':'doctor_barricade','35':'no_guardian','36':'water_seize'}
EXISTING = {'01','07','13','19','31'}
SEV = {'низкая':'low','средняя':'medium','высокая':'high'}
DIFF = {'лёгкое':8,'среднее':11,'тяжёлое':14}
TERM = {'короткий':(18,22,22),'обычный':(32,36,40),'долгий':(50,55,58)}  # по нагрузке: тяжёлое/среднее/лёгкое
GRADE_I = {'тяжёлое':0,'среднее':1,'лёгкое':2}
Q = {'контроль':'control','авторитет':'authority','стойкость':'resilience','анализ':'analysis','реакция':'reaction'}
ROLE = {'страж':'guard','биокриминалист':'biocriminalist','следователь':'investigator','Ловчий':'lovchiy','аналитик':'analyst'}
ROLE_FILL = {'guard':['control','resilience','reaction'],'biocriminalist':['analysis','resilience','control'],'investigator':['analysis','authority','reaction'],
             'lovchiy':['reaction','analysis','resilience'],'analyst':['analysis','control','reaction']}
# Пригодность тактик (разведка, задержание, подавление, карантин) по строке «Тактики» сценария.
FIT = {
 '02':(2,-1,-2,-2),'03':(1,0,-2,-1),'04':(1,1,-2,-1),'05':(1,-1,-2,1),'06':(2,-1,-2,-2),'08':(1,-1,-2,1),'09':(2,-1,-2,-2),'10':(2,-1,-2,0),
 '11':(2,0,-2,-2),'12':(1,-1,-2,-1),'14':(1,0,-2,-1),'15':(2,0,-2,-2),'16':(1,0,-1,-2),'17':(2,-2,-2,-2),'18':(2,-1,-2,-2),'20':(1,-1,-2,1),
 '21':(0,-1,-2,2),'22':(1,0,-2,-2),'23':(2,-1,-2,-2),'24':(1,-1,-2,0),'25':(0,-1,-2,2),'26':(2,-1,-2,-1),'27':(1,-1,-2,1),'28':(2,0,-2,-1),
 '29':(1,-1,-2,1),'30':(2,-1,-2,-1),'32':(0,-1,-2,2),'33':(2,0,-2,-2),'34':(1,0,-1,-2),'35':(2,-1,-2,-2),'36':(1,0,-1,1),
}
def tags(e, role):
    t = e['threat']
    if t.startswith('беспоряд'): return ['riot']
    if t.startswith('биоугроз'): return ['bio']
    if t.startswith('розыск'): return ['trace']
    if t.startswith('вооруж'): return ['assault']
    return ['bio'] if role == 'biocriminalist' else ['riot'] if role == 'guard' else ['trace']
LATE = {'обострится':'escalate','исчезнет':'expire','превратится в другое событие':'branch'}
# Сюжетные события: приходят в свою смену, в случайный пул не входят (сценарий §0).
STORY = {'13':(1,'c1'),'14':(3,'c1'),'31':(5,'c2'),'02':(6,'c2'),'10':(7,'c2'),'34':(8,'c2'),'07':(9,'c3'),'03':(10,'c3'),'21':(11,'c3'),'32':(12,'c3')}

def split_opt(o):
    label, _, hint = o.partition(' — ')
    return label.strip().rstrip('.'), (hint.strip().rstrip('.') or label)

# Числа вариантов: (pDelta, riskDelta, minutes, civil, evidence) и итог для журнала. Порядок как в сценарии.
OPT = {
 '03':[('sample',(0.02,0,3,1,-1),'Взята независимая проба, пациенту разрешили экстренное лечение.'),
       ('seal',(0.05,0,4,-2,1),'Партия опечатана до решения суда.'),
       ('handover',(0.0,-1,1,0,-2),'Партию закрыто передали донорской службе Дома.')],
 '08':[('shafts',(0.04,-1,5,1,1),'Шахты изолированы, поиск пошёл по химическому следу.'),
       ('hunt',(0.06,1,1,0,0),'Ловчий вошёл в сектор немедленно.'),
       ('burn',(0.02,0,1,1,-2),'Содержимое сектора уничтожено вместе с образцами.')],
 '14':[('talk',(0.02,-1,4,1,0),'Свидетелям открыли отдельный вход, с толпой вели переговоры.'),
       ('push',(0.06,1,1,-2,0),'Стражи вытеснили толпу от дверей суда.'),
       ('close',(-0.03,-1,2,0,-1),'Приём граждан временно приостановлен.')],
 '16':[('check',(0.04,0,4,1,1),'Охрану кортежа тихо проверили, путь для пассажиров подготовлен.'),
       ('block',(0.06,1,1,-1,0),'Машины кортежа заблокированы.'),
       ('escort',(-0.03,-1,2,0,-1),'Группа ограничилась незаметным сопровождением.')],
 '21':[('sample',(0.04,1,3,-1,2),'Отсек перекрыт, проба реагента взята.'),
       ('purge',(0.03,-1,2,1,-2),'Запущена продувка, людей вывели.'),
       ('wait',(-0.02,0,4,0,-1),'Группа дождалась технологов Дома.')],
 '23':[('rfid',(0.03,-1,4,0,1),'Маршрут сверен с метками до задержания.'),
       ('lock',(0.05,1,1,-1,0),'Депо заблокировано целиком.'),
       ('tail',(0.02,1,2,0,0),'Ловчий ушёл за подозрительной фурой в одиночку.')],
 '25':[('vent',(0.03,-1,4,1,0),'Воздух перекрыт, людей выводят партиями.'),
       ('patch',(0.04,1,2,0,0),'Разрыв залатан герметиком, пока люди были внутри.'),
       ('cut',(0.06,0,1,-2,-1),'Заражённую секцию срезали и сожгли.')],
 '28':[('split',(0.05,1,3,1,0),'Поисковая цепь разделилась по двум тоннелям.'),
       ('cordon',(-0.03,-1,4,-1,0),'Выставлен общий кордон, группа ждёт выхода людей.'),
       ('strong',(0.03,0,2,0,1),'Группа пошла по самому сильному следу.')],
 '32':[('medlock',(0.04,1,3,1,1),'Медицинский шлюз открыт под контролем биокриминалиста.'),
       ('cordon',(0.0,-1,4,-1,0),'Оцепление усилено до результатов проб.'),
       ('open',(0.02,0,1,1,-2),'Этаж разблокирован целиком.')],
 '34':[('talk',(0.03,-1,4,1,1),'Начаты открытые переговоры, свидетелям обещана защита.'),
       ('cellar',(0.04,0,2,0,0),'Ловчий тихо вывел врача через подвалы.'),
       ('clear',(0.06,1,1,-2,-1),'Стражи очистили двор.')],
 '36a':[('scout',(0.05,-1,4,0,1),'Ловчие провели тихую разведку узла.'),
        ('shutoff',(0.02,0,2,-1,0),'Подача воды перекрыта публично.'),
        ('envoy',(0.03,1,2,1,1),'К захватчикам вышел скрытый переговорщик.')],
 '36b':[('hostage',(0.0,-1,2,2,-1),'Заложника спасли, виновнику дали уйти.'),
        ('grab',(0.06,1,1,-1,1),'Захватчика у резервуара взяли силой.'),
        ('perimeter',(-0.02,-1,3,1,0),'Резервуар изолирован, группа отошла на внешний периметр.')],
}
TEXT = {
 '03':'Командир: «Две карточки на одну партию. Хирурги ждут ответа, окно закрывается».',
 '08':'Командир: «Клетка пуста, на решётке вентиляции след. Куда он ведёт — не видно».',
 '14':'Командир: «Толпа у ступеней суда. Свидетель по делу где-то внутри неё».',
 '16':'Командир: «Охрана кортежа требует не приближаться. Один из охранников ведёт себя странно».',
 '21':'Командир: «Красный контур на пределе. Технологи предлагают аварийную продувку».',
 '23':'Командир: «В депо лишняя смена водителей. Одна фура выходит без отметки».',
 '25':'Командир: «Купол держится на двух рёбрах. Внутри ещё работники и урожай».',
 '28':'Командир: «Следы босых ног расходятся: два сигнала уходят в разные тоннели».',
 '32':'Командир: «Карантин не выдержит второго часа. У жильца на седьмом этаже приступ».',
 '34':'Командир: «Жильцы перекрыли двор и не выпускают врача. Внутри машины свидетель».',
 '36a':'Командир: «Узел на грани отключения. Сколько внутри людей — неизвестно».',
 '36b':'Командир: «Один из захватчиков остался у резервуара с заложником».',
}
PHASE = {'сложное':'Развилка','особое':None}
def stage(key, phase, q):
    opts = []
    e_num = key[:2]
    for (oid, (pd, rd, mn, cv, evd), res), raw in zip(OPT[key], [o for f in ev[e_num]['forks'] for o in f['options']][(3 if key.endswith('b') else 0):]):
        label, hint = split_opt(raw)
        opts.append({'id': oid, 'label': label, 'hint': hint[:1].upper() + hint[1:], 'pDelta': pd, 'riskDelta': rd, 'minutes': mn, 'civil': cv, 'evidence': evd, 'result': res})
    ask = (' ' + q.strip()) if q.strip().endswith('?') else ''
    return {'phase': phase, 'title': ev[e_num]['title'], 'text': TEXT[key] + ask, 'options': opts}

templates, stages = [], {}
for num, e in sorted(ev.items()):
    role_list = [ROLE[r.strip()] for r in e['role'].split(',')]
    req = [Q[q.strip()] for q in e['qualities'].split(',')]
    for f in ROLE_FILL[role_list[0]]:
        if len(req) >= 3: break
        if f not in req: req.append(f)
    late_kind, _, late_text = e['late'].partition(':')
    gi = GRADE_I[e['grade']]
    t = {
        'id': ID[num], 'num': int(num), 'title': e['title'], 'districtId': e['district'],
        'incidentClass': {'рядовое':'routine','сложное':'complex','особое':'special'}[e['cls']],
        'severity': SEV[e['danger']], 'deadlineMinutes': TERM[e['term']][gi], 'deadlineType': LATE[late_kind.strip()], 'lateText': late_text.strip(),
        'difficulty': DIFF[e['grade']], 'requirements': req[:3], 'requiredRoles': role_list,
        'intel': 0 if e['cls'] == 'особое' else 1,
        'tags': tags(e, role_list[0]), 'known': e['known'], 'hidden': e['hidden'], 'aftermath': e['consequences'],
        'scene': e['scene'], 'coreFlags': e['flags'],
    }
    if num in FIT: t['tacticFit'] = dict(zip(['recon','arrest','suppression','quarantine'], FIT[num]))
    if num in STORY: t['story'] = {'shift': STORY[num][0], 'caseId': STORY[num][1]}
    if num in EXISTING: t = {k: v for k, v in t.items() if k in ('id','num','deadlineType','lateText','hidden','aftermath','scene','coreFlags','story')}
    templates.append(t)
    if num not in EXISTING and e['cls'] == 'сложное':
        stages[ID[num]] = [stage(num, 'Развилка', e['forks'][0]['q'])]
stages['water_seize'] = [stage('36a', 'Подход', ev['36']['forks'][0]['q'].split('—',1)[1].strip().capitalize()),
                         stage('36b', 'Кризис', ev['36']['forks'][1]['q'].split('—',1)[1].strip().capitalize())]
json.dump({'_status': 'PROVISIONAL — сценарий W10_EVENTS_v1 (согласован Дмитрием 2026-11-09). Сроки, сложность и пригодность тактик — проверочные гипотезы до балансного прогона; «hidden» — состояние Core, игроку не показывается.',
           'templates': templates}, open(f'{ROOT}/content/incidents_w10.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
ops = json.load(open(f'{ROOT}/content/operations_v1.json', encoding='utf-8'))
ops['stages'].update(stages)
json.dump(ops, open(f'{ROOT}/content/operations_v1.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(f'{ROOT}/content/operations_v1.json', 'a').write('\n')
print(len(templates), 'templates;', len(stages), 'new stage sets:', list(stages))
