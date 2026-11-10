import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPracticalCableVisualProduct } from '../familyVisualRules.js';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const rulesFiles = {
  rules: 'data/cableVisualClassificationRules.json',
  familyVisualRules: 'data/familyVisualRules.json',
  knowledge: 'shared/designationKnowledgeBase.json',
  colorRules: 'data/cableImageColors.json',
};
const read = async (file) =>
  JSON.parse(await fs.readFile(path.join(project, file), 'utf8'));

export async function withCableStyleSandbox(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cable-style-test-'));
  const editTarget = 'outputs/previous-draft.png';
  try {
    await fs.mkdir(path.join(root, 'outputs'));
    await fs.mkdir(path.join(root, 'data/catalog-current'), {
      recursive: true,
    });
    const paths = [
      'assets',
      'shared',
      'cable-image-style.json',
      ...Object.values(rulesFiles).filter((file) => file.startsWith('data/')),
      'data/cable-approved-results',
      'data/cable-geometry-references.json',
      'data/cableLayerContactRules.json',
      'data/cableMulticoreVisualRules.json',
      'data/cableScreenVisualStandard.json',
      'data/cableStrippingCompositionRules.json',
      'data/cableTechnicalConstructionRules.json',
    ];
    await Promise.all(
      paths.map((file) =>
        fs.symlink(path.join(project, file), path.join(root, file))
      )
    );
    const products = await read('scripts/lib/fixtures/cablePilotProducts.json');
    const context = Object.fromEntries(
      await Promise.all(
        Object.entries(rulesFiles).map(async ([key, file]) => [
          key,
          await read(file),
        ])
      )
    );
    await fs.writeFile(
      path.join(root, 'data/catalog-current/products.json'),
      JSON.stringify(products)
    );
    // Reuse local PNG bytes to exercise draft validation and upload without API access.
    await fs.copyFile(
      path.join(project, 'assets/cable-style-reference/layered.png'),
      path.join(root, editTarget)
    );

    const classify = (sku) =>
      classifyPracticalCableVisualProduct(
        products.find((product) => product.sku === sku),
        context
      );
    return await run({ root, editTarget, classify });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
