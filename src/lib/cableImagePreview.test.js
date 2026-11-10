import { it, expect } from 'vitest';
import {
  isCableImagePreview,
  applyCablePreviewManifest,
  CABLE_PREVIEW_MODE,
} from './cableImagePreview.js';
it('is impossible in production and requires explicit local query', () => {
  const location = {
    hostname: '127.0.0.1',
    search: '?cableImagePreview=' + CABLE_PREVIEW_MODE,
  };
  expect(isCableImagePreview({ dev: false, location })).toBe(false);
  expect(isCableImagePreview({ dev: true, location })).toBe(true);
  expect(
    isCableImagePreview({
      dev: true,
      location: { ...location, hostname: 'example.com' },
    })
  ).toBe(false);
  expect(
    isCableImagePreview({ dev: true, location: { ...location, search: '' } })
  ).toBe(false);
});
it('overrides only whitelisted temporary images, preserving the original payload', () => {
  const p = {
      sku: 'YU-0005011',
      image: '/old.png',
      imageVariants: [{ src: '/old.webp' }],
    },
    other = { sku: 'other', image: '/photo.jpg' },
    payload = { item: p, items: [p, other] },
    image =
      '/@fs/Users/Shared/yuzhural-site/outputs/cable-geometry-controls-2026-11-09/drafts/YU-0005011/image.png';
  const out = applyCablePreviewManifest(payload, {
    bySku: { 'YU-0005011': { image, status: 'NEEDS_REVIEW' } },
  });
  expect(out.item.image).toBe(image);
  expect(out.item.imageVariants).toEqual([]);
  expect(out.items[1]).toBe(other);
  expect(p.image).toBe('/old.png');
  expect(
    applyCablePreviewManifest(payload, {
      bySku: {
        'YU-0005011': {
          image: 'https://evil.example/image.png',
          status: 'NEEDS_REVIEW',
        },
      },
    }).item
  ).toBe(p);
});
it('supports isolated revision preview and APPROVED PUGV without applying bindings', () => {
  const location = {
    hostname: '127.0.0.1',
    search: '?cableImagePreview=geometry-revisions-2026-11-09',
  };
  expect(isCableImagePreview({ dev: true, location })).toBe(true);
  const p = { sku: 'YU-0005011', image: '/existing.png' },
    image =
      '/@fs/Users/Shared/yuzhural-site/outputs/cable-geometry-controls-2026-11-09/drafts/YU-0005011/image.png';
  expect(
    applyCablePreviewManifest(
      { item: p },
      { bySku: { [p.sku]: { image, status: 'APPROVED' } } }
    ).item.image
  ).toBe(image);
  expect(p.image).toBe('/existing.png');
});

it('allows the isolated new SHVVP preview without modifying original bindings', () => {
 const mode='pugv-sip-shvvp-2026-11-09';
 expect(isCableImagePreview({dev:true,location:{hostname:'127.0.0.1',search:'?cableImagePreview='+mode}})).toBe(true);
 const p={sku:'YU-0005219',image:'/existing.png'};
 const image='/@fs/Users/Shared/yuzhural-site/outputs/cable-'+mode+'/drafts/YU-0005219/image.png';
 expect(applyCablePreviewManifest({item:p},{bySku:{[p.sku]:{image,status:'NEEDS_REVIEW'}}}).item.image).toBe(image);
 expect(p.image).toBe('/existing.png');
});
it('permits only the two VVG revision paths inside this local batch', () => {
 const sku='YU-0001126',image='/@fs/Users/Shared/yuzhural-site/outputs/cable-approved-next-five-2026-11-09/revisions/'+sku+'/image.png';
 expect(applyCablePreviewManifest({item:{sku,image:'/old.png'}},{bySku:{[sku]:{image,status:'NEEDS_REVIEW'}}}).item.image).toBe(image);
 const other='YU-0000163',bad=image.replace(sku,other);
 expect(applyCablePreviewManifest({item:{sku:other,image:'/old.png'}},{bySku:{[other]:{image:bad,status:'NEEDS_REVIEW'}}}).item.image).toBe('/old.png');
});
