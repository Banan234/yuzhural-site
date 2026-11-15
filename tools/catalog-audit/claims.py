"""Internal claim evidence index. Never writes catalog data or promotes card status."""
import hashlib
import json
import re

BLOCKS = ('description', 'marking', 'construction', 'application', 'selection')
CONDITIONS = ('mark', 'attributes', 'groupCores', 'groundCores', 'groundSection',
              'voltage', 'manufacturer', 'catalogBrand', 'hasGroundCore',
              'screenCrossSection', 'concentricConductorCrossSection')
def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def extract(row):
    """Keep literal atomic units. Extraction alone is never verification."""
    result = []
    for block in BLOCKS:
        value = row['blocks'].get(block)
        parts = [t['code']+' — '+t['text'] for t in value] if isinstance(value,list) else re.split(r'(?<=[.!?])\s+',value or '')
        for text in parts:
            if text.strip():
                result.append(dict(id=digest([block,text]),block=block,text=text,status='SOURCE_REQUIRED'))
    for label,value in (row.get('specs') or {}).items():
        if label not in ('Марка','Ед. изм.','Остаток'):
            text=label+' — '+str(value)
            result.append(dict(id=digest(['specs',text]),block='specs',text=text,status='SOURCE_REQUIRED'))
    return result

def conditions(identity):
    return {key: identity.get(key) for key in CONDITIONS}

def applicability(row, proof):
    scope=proof['scope']
    if conditions(row['identity']) != scope['conditions']:
        return False, 'Различаются марка, индексы, материалы/изготовитель или дополнительные признаки'
    config=[row['identity'].get('cores'),row['identity'].get('crossSection')]
    if config not in scope['configurations']:
        return False, 'Конфигурация вне явно проверенной матрицы'
    if row['sku'] not in scope['skuIdentities']:
        return False, 'Связь исходной маркировки с исполнением не проверена'
    if digest(row['identity']) != scope['skuIdentities'][row['sku']]:
        return False, 'Исходное обозначение или идентичность изменились'
    if proof['status'] != 'SOURCE_CONFIRMED' or not proof.get('source') or not proof.get('pages'):
        return False, 'Отсутствует проверенное доказательство и страница'
    if not any(c['id']==proof['claimId'] for c in extract(row)):
        return False, 'Проверенное утверждение изменилось или отсутствует'
    return True, 'Совпали проверенная идентичность, точные условия, размер и текст утверждения'

def index(rows, proofs):
    claims={}
    for row in rows:
        for claim in extract(row):
            item=claims.setdefault(claim['id'],dict(claim,sku=[],proofs=[]))
            item['sku'].append(row['sku'])
    applications=[];denied=[]
    by_id={}
    for proof in proofs:by_id.setdefault(proof['claimId'],[]).append(proof)
    for row in rows:
        for claim in extract(row):
            for proof in by_id.get(claim['id'],[]):
                ok,reason=applicability(row,proof)
                entry=dict(sku=row['sku'],claimId=claim['id'],proofId=proof['id'],reason=reason)
                if ok:
                    applications.append(entry)
                    item=claims[claim['id']]
                    if proof['id'] not in item['proofs']:item['proofs'].append(proof['id'])
                elif len(denied)<100:
                    denied.append(entry)
    # A claim can be confirmed only for a subset of its SKU. Global status stays scoped.
    for item in claims.values():
        if item['proofs']:item['status']='CONFIRMED_FOR_LISTED_APPLICATIONS'
    return dict(claims=list(claims.values()),proofs=proofs,applications=applications,deniedExamples=denied)
