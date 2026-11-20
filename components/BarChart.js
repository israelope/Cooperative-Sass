/** Dependency-free bar chart (server component). items: [{ label, value, value2? }]; value2 draws a darker inner bar. */
export default function BarChart({ items, height = 160, format = (n) => String(n), label = 'Bar chart', thin = false }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  const hasValue2 = items.some((i) => i.value2 != null);

  return (
    <div>
      <div
        className={`relative flex items-end ${thin ? 'gap-0.5' : 'gap-2'}`}
        style={{ height }}
        role="img"
        aria-label={label}
      >
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-dashed border-rule" />)}
        </div>
        <div className={`relative flex h-full w-full items-end ${thin ? 'gap-0.5' : 'gap-2'}`}>
          {items.map((i, idx) => (
            <div
              key={idx}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${i.label}: ${format(i.value)}${i.value2 != null ? ` (${format(i.value2)} unique)` : ''}`}
            >
              <div className="relative w-full rounded-t bg-adire-200" style={{ height: `${Math.max(2, ((Number(i.value) || 0) / max) * 88)}%` }}>
                {i.value2 != null && Number(i.value) > 0 && (
                  <div className="absolute bottom-0 w-full rounded-t bg-adire-600" style={{ height: `${Math.min(100, (Number(i.value2) / Number(i.value)) * 100)}%` }} />
                )}
              </div>
              {!thin && <span className="max-w-full truncate text-xs text-ink/75">{i.label}</span>}
            </div>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Value</th>{hasValue2 && <th scope="col">Unique visitors</th>}</tr></thead>
        <tbody>
          {items.map((i, idx) => (
            <tr key={idx}>
              <th scope="row">{i.label}</th>
              <td>{format(i.value)}</td>
              {hasValue2 && <td>{format(i.value2 ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
