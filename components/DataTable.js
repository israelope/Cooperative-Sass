/**
 * Consistent table shell: horizontal scroll, a screen-reader caption, and
 * tabular numerals. Rows/columns are supplied by the page as normal <thead>
 * and <tbody> children; every <th> should carry scope="col".
 */
export default function DataTable({ children, caption, className = '' }) {
  return (
    <div className={`table-wrap ${className}`}>
      <table className="tbl num">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
