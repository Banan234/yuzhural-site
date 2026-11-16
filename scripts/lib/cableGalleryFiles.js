import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const unzip = promisify(execFile);
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exists = async dir => fs.readdir(dir, { withFileTypes: true }).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
const cableFolder = /^(?:cable-|approved-cable-|visual-reference-|product-images-vvg-|codex-sale-image-models-|pugv-colors-)/u;

const reviewArtifactNames = [
  /^(?:applied-product|card-YU-\d+|catalog(?:ue)?-[\w-]+|product-(?:\d+(?:-\d+)?|\d+core-\d+|desktop|mobile|\w+-\d+|\w+-progress|shvvp|YU-\d+)|pvs-card)\.png$/iu,
  /^(?:gallery|groups-preview|comparison-preview|report|review)(?:-(?:checker|dark|white|preview|desktop|mobile|final|1440|390|page-\d+))?\.png$/iu,
  /^(?:qa-[\w-]+|sheet-\d+|tip-review-[\w-]+|inspect-[\w-]+|contact-[\w-]+|thumb-(?:before|after)-\d+|preview-grid|contact-sheet)\.png$/iu,
  /^(?:background-review|checked-light-dark|preview-(?:checker|dark|white|desktop|mobile|final)|shvvp-real-photo)\.png$/iu,
];

function isReviewArtifact(file) {
  if (reviewArtifactNames.some(pattern => pattern.test(path.basename(file)))) return true;
  return /(?:^|\/)(?:cable-rules-verification-[^/]+\/(?:APPROVED|NEEDS_REVIEW)|cable-7248-stranded-[^/]+\/(?:checker|dark|white)|cable-single-core-composition-review-[^/]+\/desktop|cable-(?:approved-next-five|next-ten-controls|recovery-four)-[^/]+\/(?:revisions\/)?overview|cable-(?:approved-library-audit|next-constructions|visualkey-audit)(?:-[^/]+)?\/preview)\.png$/iu.test(file);
}

async function* walk(root, folder, origin, decisions) {
  for (const entry of await exists(path.join(root, folder))) {
    const file = folder + '/' + entry.name;
    if (entry.isDirectory()) yield* walk(root, file, origin, decisions);
    else if (entry.isFile() && /\.png$/iu.test(file)) {
      if ((origin === 'unknown' || origin === 'review-artifact') && isReviewArtifact(file)) continue;
      yield { file, origin };
    } else if (entry.isFile() && decisions && /^(?:.*-)?(?:approval|decision|decisions)\.json$/u.test(entry.name)) {
      decisions.add(file);
    } else if (entry.isFile() && /\.zip$/iu.test(file)) {
      yield* zipEntries(root, file);
    }
  }
}

async function* zipEntries(root, file) {
  let stdout;
  try {
    ({ stdout } = await unzip('unzip', ['-Z1', path.join(root, file)], { maxBuffer: 4 * 1024 * 1024 }));
  } catch (error) {
    yield { file, error: 'Не удалось прочитать ZIP: ' + error.message };
    return;
  }
  for (const entry of stdout.trim().split('\n')) {
    if (/\.png$/iu.test(entry) && !entry.startsWith('/') && !entry.split('/').includes('..') &&
        !isReviewArtifact(entry))
      yield { file: file + '!/' + entry, origin: 'generated' };
  }
}

export async function* galleryPngLocations(root, catalogLocations, decisions, { archive = true, activeFiles = [] } = {}) {
  if (!archive) {
    yield* walk(root, 'assets/cable-style-reference', 'style');
    yield* walk(root, 'data/cable-approved-results', 'generated');
    yield* walk(root, 'data/product-image-metadata/review-decisions', 'generated');
    yield* catalogLocations;
    for (const file of new Set(activeFiles)) yield { file, origin: 'generated' };
    return;
  }
  const roots = {
    'assets/cable-style-reference': 'style',
    'assets/cable-images': 'unknown',
    'public/product-images/generated': 'generated',
    'public/product-images/previews': 'generated',
    'data/cable-approved-results': 'generated',
    'data/product-image-metadata': 'generated',
    'public/review': 'review-artifact',
  };
  for (const [dir, origin] of Object.entries(roots)) yield* walk(root, dir, origin);
  for (const location of catalogLocations) {
    if (!location.file.startsWith('public/product-images/generated/') &&
        !location.file.startsWith('public/product-images/previews/')) yield location;
  }
  const snapshots = new Set(['']);
  for (const entry of await exists(path.join(root, 'outputs'))) {
    const file = 'outputs/' + entry.name;
    if (entry.isDirectory() && cableFolder.test(entry.name)) yield* walk(root, file, 'unknown', decisions);
    if (entry.isFile() && /^cable-.*\.zip$/iu.test(entry.name)) yield* zipEntries(root, file);
    if (entry.isDirectory() && /^catalog-(?:safe-release|release-ready|full-status-report|enrichment-pilot)-/u.test(entry.name)) {
      for (const child of ['', '/candidate', '/site', '/snapshot']) snapshots.add(file + child);
    }
  }
  for (const snapshot of snapshots) {
    const prefix = snapshot ? snapshot + '/' : '';
    const staticRoots = snapshot ? ['dist', 'dist/server', 'public', 'ssr'] : ['dist', 'dist/server'];
    for (const dir of staticRoots) {
      for (const kind of ['generated', 'previews']) yield* walk(root, prefix + dir + '/product-images/' + kind, 'generated');
    }
    if (snapshot) {
      for (const entry of await exists(path.join(root, prefix, 'outputs'))) {
        if (entry.isDirectory() && cableFolder.test(entry.name)) yield* walk(root, prefix + 'outputs/' + entry.name, 'unknown');
      }
      yield* walk(root, prefix + 'data/cable-approved-results', 'generated');
      yield* walk(root, prefix + 'data/product-image-metadata', 'generated');
    }
    for (const releaseArea of ['data/.public-current-releases', 'data/.web-template-current-releases']) {
      const area = prefix + releaseArea;
      for (const release of await exists(path.join(root, area))) {
        if (!release.isDirectory()) continue;
        for (const view of ['', 'public/', 'server/'])
          for (const kind of ['generated', 'previews']) yield* walk(root, area + '/' + release.name + '/' + view + 'product-images/' + kind, 'generated');
      }
    }
  }
}

async function bytesAt(root, location) {
  const [file, entry] = location.split('!/');
  const absolute = await fs.realpath(path.join(root, file));
  if (!absolute.startsWith(root + path.sep)) throw Error('Путь PNG выходит за пределы проекта.');
  if (!entry) return fs.readFile(absolute);
  const pattern = entry.replace(/[\\*?\[\]]/gu, character => '\\' + character);
  return (await unzip('unzip', ['-p', absolute, pattern], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 })).stdout;
}

export async function readGalleryPng(root, item) {
  for (const location of item.locations) {
    const bytes = await bytesAt(root, location).catch(() => null);
    if (bytes && hash(bytes) === item.sha256) return bytes;
  }
  throw Error('PNG отсутствует или SHA изменился. Обновите инвентарь.');
}

export async function galleryPngSha(root, file, cache) {
  const archived = file.includes('!/');
  const stat = await fs.stat(path.join(root, file.split('!/')[0]), { bigint: true });
  const key = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, archived ? file : ''].join(':');
  if (cache.has(key)) return cache.get(key);
  const bytes = await bytesAt(root, file);
  if (!bytes.subarray(0, 8).equals(signature)) throw Error('Неверная сигнатура PNG');
  const sha = hash(bytes);
  cache.set(key, sha);
  return sha;
}
