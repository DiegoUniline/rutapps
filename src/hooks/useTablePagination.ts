import { useState, useMemo, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'table-page-size';

export type PageSizeOption = 50 | 100 | 200 | 'all';

export function readStoredPageSize(): PageSizeOption {
  return readStoredSize();
}

function readStoredSize(): PageSizeOption {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'all') return 'all';
    const n = Number(raw);
    if (n === 50 || n === 100 || n === 200) return n;
  } catch {}
  return 50;
}

export function useTablePagination<T>(items: T[]) {
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(readStoredSize);
  const [page, setPage] = useState(1);

  const setPageSize = useCallback((size: PageSizeOption) => {
    setPageSizeState(size);
    setPage(1);
    try { localStorage.setItem(STORAGE_KEY, String(size)); } catch {}
  }, []);

  const total = items.length;
  const effectiveSize = pageSize === 'all' ? total : pageSize;
  const totalPages = effectiveSize > 0 ? Math.max(1, Math.ceil(total / effectiveSize)) : 1;

  // Clamp page
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const from = total === 0 ? 0 : (safePage - 1) * effectiveSize + 1;
  const to = Math.min(safePage * effectiveSize, total);

  const paginatedItems = useMemo(() => {
    if (pageSize === 'all') return items;
    return items.slice((safePage - 1) * effectiveSize, safePage * effectiveSize);
  }, [items, safePage, effectiveSize, pageSize]);

  const goFirst = useCallback(() => setPage(1), []);
  const goPrev = useCallback(() => setPage(p => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setPage(p => Math.min(totalPages, p + 1)), []);
  const goLast = useCallback(() => setPage(totalPages), []);
  const resetPage = useCallback(() => setPage(1), []);

  return {
    paginatedItems,
    page: safePage,
    totalPages,
    total,
    from,
    to,
    pageSize,
    setPageSize,
    goFirst,
    goPrev,
    goNext,
    goLast,
    resetPage,
  };
}
