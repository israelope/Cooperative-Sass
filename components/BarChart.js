/** Dependency-free bar chart (server component). items: [{ label, value, value2? }]; value2 draws a darker inner bar. */
export default function BarChart({ items, height = 160, format = (n) => String(n), label = 'Bar chart', thin = false }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div className={`flex items-end ${thin ? 'gap-0.5' : 'gap-2'}`} style={{ height }} role="img" aria-label={label}>
      {items.map((i, idx) => (
        <div key={idx} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${i.label}: ${format(i.value)}${i.value2 != null ? ` (${i.value2} unique)` : ''}`}>
          <div className="relative w-full rounded-t bg-adire-200" style={{ height: `${Math.max(2, ((Number(i.value) || 0) / max) * 88)}%` }}>
            {i.value2 != null && Number(i.value) > 0 && (
              <div className="absolute bottom-0 w-full rounded-t bg-adire-600" style={{ height: `${Math.min(100, (Number(i.value2) / Number(i.value)) * 100)}%` }} />
            )}
          </div>
          {!thin && <span className="max-w-full truncate text-[11px] text-ink/60">{i.label}</span>}
        </div>
      ))}
    </div>
  );
}
