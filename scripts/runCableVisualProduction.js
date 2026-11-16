import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = path.join(root, 'data/product-image-metadata/production-v1');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      prepare: { type: 'boolean' },
      run: { type: 'boolean' },
      status: { type: 'boolean' },
    },
  });
  if ([values.prepare, values.run, values.status].filter(Boolean).length !== 1)
    throw new Error('Choose --prepare, --run or --status');
  const planFile = path.join(stateDir, 'plan.json');
  if (values.status) {
    const manifest = await read(path.join(stateDir, 'manifest.json'));
    const { productionSummary } =
      await import('./lib/cableVisualProduction.js');
    console.log(
      JSON.stringify(
        productionSummary(
          await read(planFile),
          manifest,
          (await read(path.join(root, 'shared/rejectedProductImages.json')))
            .byVisualKey
        ),
        null,
        2
      )
    );
    return;
  }
  throw new Error(
    'Legacy production generation disabled by CABLE_IMAGE_STYLE.md. Use scripts/lib/cableImageStyle.js draft-only workflow; existing manifest remains unchanged.'
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
