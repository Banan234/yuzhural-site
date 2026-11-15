import copy
import unittest
from claims import applicability, conditions, digest, extract, index

def sample(mark='КВВГ',attributes=None):
    identity=dict(mark=mark,attributes=attributes or [],cores=4,crossSection=1,
                  groupCores=None,sourceName=mark+'4Х1',manufacturer=None)
    return dict(sku='YU-1',identity=identity,blocks=dict(description='Контрольный кабель.',
              marking=[dict(code='К',text='Контрольный')],construction='ПВХ.',
              application='Контроль.',selection='По схеме.'),specs={})
def proof(row):
    return dict(id='p',claimId=extract(row)[0]['id'],status='SOURCE_CONFIRMED',
                source='завод',pages=[4],scope=dict(conditions=conditions(row['identity']),
                configurations=[[4,1],[5,1]],skuIdentities={row['sku']:digest(row['identity'])}))

class EvidenceTests(unittest.TestCase):
    def test_same_identity_and_claim(self):
        row=sample();self.assertTrue(applicability(row,proof(row))[0])
    def test_different_mark(self):
        row=sample();p=proof(row);row['identity']['mark']='АКВВГ'
        self.assertFalse(applicability(row,p)[0])
    def test_screen_fire_climate_and_armor_do_not_leak(self):
        for attrs in (['Э'],['нг(А)-FRLS'],['ХЛ'],['Б']):
            with self.subTest(attrs=attrs):
                row=sample();p=proof(row);row['identity']['attributes']=attrs
                self.assertFalse(applicability(row,p)[0])
    def test_rare_mark_is_not_matched_by_profile(self):
        row=sample('RE-2X(ST)Y-FL');p=proof(row)
        row['identity']['mark']='RE-Y(ST)Y-FL'
        self.assertFalse(applicability(row,p)[0])
    def test_unreviewed_name_and_size_are_rejected(self):
        row=sample();p=proof(row);row['identity']['crossSection']=.8
        self.assertFalse(applicability(row,p)[0])
        row=sample();p=proof(row);row['identity']['sourceName']+='Э'
        self.assertFalse(applicability(row,p)[0])
    def test_unknown_manufacturer_not_filled_from_document(self):
        row=sample();p=proof(row);p['scope']['conditions']['manufacturer']='Завод'
        self.assertFalse(applicability(row,p)[0])
    def test_changed_statement_rejected(self):
        row=sample();p=proof(row);row['blocks']['description']='Новый текст.'
        self.assertFalse(applicability(row,p)[0])
    def test_reviewed_second_size_reuses_evidence(self):
        row=sample();other=copy.deepcopy(row);other['sku']='YU-2'
        other['identity'].update(cores=5,sourceName='КВВГ5Х1')
        p=proof(row);p['scope']['skuIdentities'][other['sku']]=digest(other['identity'])
        result=index([row,other],[p])
        self.assertEqual(len(result['applications']),2)
        self.assertEqual(len(result['claims']),len(extract(row)))
    def test_missing_page_or_unconfirmed_proof(self):
        for key,value in [('pages',[]),('status','UNREVIEWED')]:
            row=sample();p=proof(row);p[key]=value
            self.assertFalse(applicability(row,p)[0])
    def test_extraction_cannot_verify_card(self):
        row=sample();result=index([row],[])
        self.assertEqual(row.get('level'),None)
        self.assertTrue(all(c['status']=='SOURCE_REQUIRED' for c in result['claims']))
if __name__=='__main__':unittest.main()

class RegistryRegressionTests(unittest.TestCase):
    def test_serialized_proof_has_same_result(self):
        import json
        row=sample()
        p=json.loads(json.dumps(proof(row)))
        self.assertTrue(applicability(row,p)[0])
    def test_config_in_table_without_reviewed_identity_is_rejected(self):
        row=sample();p=proof(row);row['sku']='UNREVIEWED'
        row['identity'].update(cores=5,sourceName='КВВГ5Х1')
        self.assertFalse(applicability(row,p)[0])
    def test_shared_profile_never_grants_evidence(self):
        row=sample();other=copy.deepcopy(row);other['sku']='OTHER'
        other['profile']=row['profile']='shared'
        result=index([row,other],[proof(row)])
        self.assertEqual([x['sku'] for x in result['applications']],['YU-1'])
