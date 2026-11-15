"""Resume internal audit and build scoped evidence. Catalog is read-only."""
import argparse
from pathlib import Path
import json
import sqlite3
import hashlib
from collections import Counter
from datetime import datetime,timezone
from claims import extract,conditions,digest,index

root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--previous',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
out=root/args.output
previous=root/args.previous
started=datetime.now(timezone.utc)
def read(path):return json.loads(path.read_text())
def save(name,value):
    temp=out/(name+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')))
    temp.replace(out/name)
if (out/'state.json').exists():
    state=read(out/'state.json')
    if state.get('prior')==str(previous.relative_to(root)):
        print('Проход уже сохранён. Для следующего этапа используйте его audit.json и добавьте новые доказательства.')
        raise SystemExit(0)
d=read(previous/'audit.json')
snap=read(out/'snapshot.json')
current={r['sku']:r for r in snap['rows']}
assert len(current)==len(d['rows'])==5621
db=sqlite3.connect('file:'+str(root/'data/designation-manufacturer-corpus/corpus.sqlite')+'?mode=ro',uri=True)
title,url,sha,path=db.execute("select title,url,sha256,original_path from documents where id='podolsk-3'").fetchone()
assert hashlib.sha256((root/'data/designation-manufacturer-corpus'/path).read_bytes()).hexdigest()==sha
texts={n:db.execute("select text from pages where document_id='podolsk-3' and page=?",(n,)).fetchone()[0] for n in (7,8,10,11)}
assert all('ПВХ' in texts[n] and 'МАРКА' in texts[n] for n in texts)
source='podolsk-control-claim'
d['sources'][source]=dict(title=title,url=url,sha256=sha,pages=[7,8,10,11],
 section='Физ. с. 7–8 — вновь прочитаны нг(А)/нг(А)-ХЛ. С. 10–11 — повторное использование прежней сверки LS, без повторного запроса.')
claimsTexts={
 'construction':'Изоляция жил и наружная оболочка из ПВХ.',
 'application':'Неподвижные цепи контроля, управления и передачи сигналов.',
}
reviewed=[];stale=[];proofs=[];eligible={}
for row in d['rows']:
    now=current[row['sku']]
    if any(row.get(k)!=now.get(k) for k in ('identity','profile','blocks','specs')):
        stale.append(row['sku'])
        # Preserve old verification exactly, but make its snapshot boundary explicit.
        row['currentBlocks']=now['blocks']
        row['verificationScope']='SAVED_SNAPSHOT_ONLY'
        continue
    identity=row['identity']
    attrs=identity['attributes']
    choices=[['нг(А)'],['нг(А)-ХЛ'],['Э','нг(А)'],['Э','нг(А)-ХЛ'],
             ['нг(А)-LS'],['Э','нг(А)-LS']]
    if row['mark']!='КВВГ' or row.get('profile')!='0007' or attrs not in choices:continue
    if identity['voltage'] or identity['groupCores'] or identity['groundCores']:continue
    n,s=identity['cores'],identity['crossSection']
    valid=(s in (.75,1,1.5) and n in (2,3,4,5,7,8,10,12,14,19,27,37,52,61)) or (s==2.5 and n in (2,3,4,5,7,8,10,12,14,19,27,37,52)) or (s in (4,6) and n in (2,3,4,5,7,8,10)) or (s==10 and n in (2,3,4,5))
    if not valid:continue
    if not all(row['blocks'].get(k)==v for k,v in claimsTexts.items()):continue
    key=digest(conditions(identity))
    eligible.setdefault(key,[]).append(row)

for key,rows in eligible.items():
    identity=rows[0]['identity']
    legacy='нг(А)-LS' in identity['attributes']
    screen='Э' in identity['attributes']
    page=(11 if screen else 10) if legacy else (8 if screen else 7)
    for block,text in claimsTexts.items():
        literal=next(c for c in extract(rows[0]) if c['block']==block and c['text']==text)
        proofs.append(dict(id=digest([key,literal['id'],source,page]),claimId=literal['id'],
          assertion=text,status='SOURCE_CONFIRMED',source=source,pages=[page],
          origin='REUSED_PRIOR_SOURCE_REVIEW' if legacy else 'SOURCE_REVIEWED_THIS_RUN',
          reviewedAt=started.isoformat(),
          confirmed='ПВХ изоляции и оболочки' if block=='construction' else 'Контрольное назначение, неподвижные соединения',
          limitation='Подтверждён только этот общий признак. Материалы дополнительных слоёв, паспортные параметры и точный изготовитель партии не устанавливаются.',
          scope=dict(conditions=conditions(identity),
             configurations=[list(v) for v in sorted({(r['identity']['cores'],r['identity']['crossSection']) for r in rows})],
             skuIdentities={r['sku']:digest(r['identity']) for r in rows})))
    if legacy:continue
    for row in rows:
        # Mark actual technical source work; card remains partial until all claims are closed.
        reviewed.append(row['sku'])
        if row['level']=='AUTOMATED_ONLY':row['level']='SOURCE_REVIEWED_PARTIAL'
        row['reviews'].append(dict(sources=[source],confirmed=f'Физ. с. {page}: для полного нг(А)'+('-ХЛ' if 'нг(А)-ХЛ' in identity['attributes'] else '')+
           ' сверены два общих утверждения — ПВХ изоляции/оболочки и неподвижное контрольное назначение. Число и сечение входят в таблицу. Применимость ограничена точными идентичностями и конфигурациями в реестре доказательств.',
           remaining='Верифицировать остальные утверждения маркировки, экранов, рекомендаций и технической таблицы. Два подтверждённых утверждения не закрывают карточку.'))
claimIndex=index(d['rows'],proofs)
# Historical reviews retain their provenance; no blanket migration to verified claims.
d['claimsIndex']=claimIndex
d['claimMethod']=dict(extraction='Буквальные предложения, отдельные токены маркировки и строки характеристик. Автоматическое выделение сохраняет SOURCE_REQUIRED.',
 verification='Доказательства подтверждают только явно сопоставленные утверждения в точной области. Уровень карточки автоматически не повышается.',
 priorReviews='Сохранены полностью. Их перевод в реестр доказательств выполняется по мере адресной сверки.')
s=d['stats']
s.update(levels=Counter(r['level'] for r in d['rows']),statuses=Counter(r['status'] for r in d['rows']),
 corrected=0,reviewedThisPass=len(reviewed),
 specificallyUnsupported=sum(any(f.get('status') in ('CONFLICT','SOURCE_REQUIRED') and not f.get('resolved') for f in r['findings']) for r in d['rows']),
 openFindingInstances=sum(f.get('status') in ('CONFLICT','SOURCE_REQUIRED','CORRECTION_REQUIRED') and not f.get('resolved') for r in d['rows'] for f in r['findings']),
 flaggedProfiles=sum(bool(p.get('flags')) for p in d['profiles']))
uniqueNew={p['claimId'] for p in proofs if p['origin']=='SOURCE_REVIEWED_THIS_RUN'}
oldApplications=[a for a in claimIndex['applications'] if next(p for p in proofs if p['id']==a['proofId'])['origin']=='REUSED_PRIOR_SOURCE_REVIEW']
newApplications=[a for a in claimIndex['applications'] if a not in oldApplications]
progress=dict(stats=s,startedAt=started.isoformat(),finishedAt=datetime.now(timezone.utc).isoformat(),
 newUniqueClaimsReviewed=len(uniqueNew),newScopedEvidenceRecords=sum(p['origin']=='SOURCE_REVIEWED_THIS_RUN' for p in proofs),
 uniqueClaimKindsReused=len({a['claimId'] for a in oldApplications}),priorEvidenceApplications=len(oldApplications),
 newEvidenceApplications=len(newApplications),skuWithNewEvidence=len({a['sku'] for a in newApplications}),
 skuWithReusedEvidence=len({a['sku'] for a in oldApplications}),reviewedSku=reviewed,
 currentTextChanged=stale,openConflicts=[r['sku'] for r in d['rows'] if r['status']=='CONFLICT'],
 conflictsResolution='КУПП сохраняются открытыми. Архивные источники различают диаметр и сечение, паспорта партии отсутствуют. Новых фактов о партии не найдено.',
 correctionsThisRun=0,previousCorrections=5,
 fullVerifiedAdded=0)
d['claimProgress']=progress
save('audit.json',d)
save('claims.json',claimIndex)
save('progress.json',progress)
save('continuation.json',[dict(sku=r['sku'],name=r['name'],profile=r.get('profile'),level=r['level'],status=r['status'],
 next=r['reviews'][-1]['remaining'] if r['reviews'] else 'Проверить точные утверждения по источникам.') for r in d['rows'] if r['level']!='SOURCE_VERIFIED' or r.get('verificationScope')])
save('state.json',dict(audit=str((out/'audit.json').relative_to(root)),claims=str((out/'claims.json').relative_to(root)),
 prior=str(previous.relative_to(root)),updatedAt=datetime.now(timezone.utc).isoformat()))
print({k:v for k,v in progress.items() if k not in ('reviewedSku','currentTextChanged')})

pointer=root/'outputs/catalog-audit-state.json'
temp=pointer.with_suffix('.tmp')
temp.write_text(json.dumps(dict(audit=str((out/'audit.json').relative_to(root)),claims=str((out/'claims.json').relative_to(root)),progress=str((out/'progress.json').relative_to(root)),continuation=str((out/'continuation.json').relative_to(root)),prior=str(previous.relative_to(root))),ensure_ascii=False,indent=2))
temp.replace(pointer)
