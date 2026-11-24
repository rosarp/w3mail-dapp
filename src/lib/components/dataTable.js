import { formatValue } from '../charts.js';

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return String(a).localeCompare(String(b));
}

/** Alpine data `dataTable`, the behaviour of `ui/DataTable.astro`. */
export function dataTable(rows, loading, { pageSize, sortable, formats }) {
  return {
    table: {
      sort: null,
      index: 0,

      get loading() {
        return !!loading();
      },
      get all() {
        const value = rows();
        return Array.isArray(value) ? value : [];
      },
      get total() {
        return this.all.length;
      },
      get sorted() {
        const sort = this.sort;
        if (!sort) return this.all;
        const dir = sort.direction === 'asc' ? 1 : -1;
        return [...this.all].sort((a, b) => compare(a?.[sort.key], b?.[sort.key]) * dir);
      },
      get pages() {
        return pageSize > 0 ? Math.max(1, Math.ceil(this.total / pageSize)) : 1;
      },
      get page() {
        if (pageSize <= 0) return this.sorted;
        const start = this.index * pageSize;
        return this.sorted.slice(start, start + pageSize);
      },
      get range() {
        if (pageSize <= 0 || this.total === 0) return `${this.total}`;
        const start = this.index * pageSize + 1;
        return `${start}–${Math.min(this.total, start + pageSize - 1)} of ${this.total}`;
      },

      clamp() {
        if (this.index > this.pages - 1) this.index = this.pages - 1;
      },
      toggle(key) {
        if (!sortable.includes(key)) return;
        if (this.sort?.key !== key) this.sort = { key, direction: 'asc' };
        else if (this.sort.direction === 'asc') this.sort = { key, direction: 'desc' };
        else this.sort = null;
        this.index = 0;
      },
      ariaSort(key) {
        if (this.sort?.key !== key) return 'none';
        return this.sort.direction === 'asc' ? 'ascending' : 'descending';
      },
      cell(row, key) {
        return formatValue(formats[key], row?.[key]);
      },
    },
  };
}
