export default function ResponsiveProductImage({
  variants = [],
  sizes,
  ...imageProps
}) {
  if (!variants.length) return <img {...imageProps} />;
  return (
    <picture style={{ display: 'contents' }}>
      <source
        type="image/webp"
        srcSet={variants.map(({ src, width }) => `${src} ${width}w`).join(', ')}
        sizes={sizes}
      />
      <img {...imageProps} />
    </picture>
  );
}
