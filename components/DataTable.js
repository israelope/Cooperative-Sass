/**
 * Consistent table shell: horizontal scroll, a screen-reader caption, and
 * tabular numerals. Rows/columns are supplied by the page as normal <thead>
 * and <tbody> children; every <th> should carry scope="col".
 *
 * `scroll` also caps the height and keeps the header visible while scrolling,
 * which matters for the long paginated lists.
 */
export default function DataTable({ children, caption, className = '', scroll = false }) {
  return (
    <div className={`table-wrap ${scroll ? 'tbl-scroll' : ''} ${className}`}>
      <table className={`tbl num ${scroll ? 'tbl-sticky' : ''}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
