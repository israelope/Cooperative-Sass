/* eslint-disable @next/next/no-img-element */

/** Responsive local image wrapper used by the help centre and role guides. */
export default function GuideImage({ src, alt, aspect = 'aspect-[16/9]', className = '', eager = false }) {
  return (
    <div className={`relative w-full overflow-hidden bg-accent-50 ${aspect} ${className}`}>
      <img src={src} alt={alt} loading={eager ? undefined : 'lazy'} className="h-full w-full object-cover" />
    </div>
  );
}
