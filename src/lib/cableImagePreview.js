export const CABLE_PREVIEW_MODE = 'geometry-controls-2026-11-09';
const allowed = new Set(['YU-0000980','YU-0000838','YU-0002954','YU-0003196','YU-0000198','YU-0003905','YU-0004929','YU-0004942','YU-0000979','YU-0000758','YU-0005011', 'YU-0005219', 'YU-0004818', 'YU-0001126', 'YU-0000163', 'YU-0004915', 'YU-0001134', 'YU-0002706']);
const modes = new Set([CABLE_PREVIEW_MODE, 'geometry-revisions-2026-11-09', 'pugv-sip-shvvp-2026-11-09', 'approved-next-five-2026-11-09', 'next-ten-controls-2026-11-09', 'recovery-four-2026-11-09']);
const manifests = new Map();
const currentMode = () =>
  new URLSearchParams(globalThis.window?.location.search || '').get(
    'cableImagePreview'
  );
export function isCableImagePreview({
  dev = import.meta.env?.DEV,
  location = globalThis.window?.location,
} = {}) {
  return (
    !!dev &&
    !!location &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) &&
    modes.has(new URLSearchParams(location.search).get('cableImagePreview'))
  );
}
export function applyCablePreviewManifest(payload, manifest) {
  const replace = (p) => {
    if (!p || !allowed.has(p.sku)) return p;
    const e = manifest.bySku?.[p.sku];
    if (
      !e ||
      !['NEEDS_REVIEW', 'APPROVED'].includes(e.status) ||
      typeof e.image !== 'string' ||
      !e.image.startsWith('/@fs/') ||
      ![
        'cable-geometry-controls-2026-11-09',
        'cable-geometry-revisions-2026-11-09',
        'cable-pugv-sip-shvvp-2026-11-09',
        'cable-approved-next-five-2026-11-09',
        'cable-next-ten-controls-2026-11-09',
        'cable-recovery-four-2026-11-09',
      ].some((dir) =>
        (e.image.endsWith(`/outputs/${dir}/drafts/${p.sku}/image.png`) || (dir === 'cable-approved-next-five-2026-11-09' && ['YU-0001126','YU-0001134'].includes(p.sku) && e.image.endsWith(`/outputs/${dir}/revisions/${p.sku}/image.png`)))
      )
    )
      return p;
    return {
      ...p,
      image: e.image,
      imageVariants: [],
      imageAlt: `${p.title || p.name} — контрольная иллюстрация ${e.status}`,
      cableImagePreview: true,
    };
  };
  return {
    ...payload,
    ...(payload.item ? { item: replace(payload.item) } : {}),
    ...(Array.isArray(payload.items)
      ? { items: payload.items.map(replace) }
      : {}),
  };
}
export async function withCableImagePreview(payload) {
  if (!isCableImagePreview()) return payload;
  const mode = currentMode();
  if (!manifests.has(mode))
    manifests.set(
      mode,
      fetch('/review/cable-' + mode + '.json', { cache: 'no-store' }).then(
        (r) => {
          if (!r.ok) throw Error('Preview manifest unavailable');
          return r.json();
        }
      )
    );
  try {
    return applyCablePreviewManifest(payload, await manifests.get(mode));
  } catch {
    return payload;
  }
}
export function addCableImagePreviewQuery(url) {
  if (!isCableImagePreview()) return url;
  return (
    url + (url.includes('?') ? '&' : '?') + 'cableImagePreview=' + currentMode()
  );
}
