import { useState, useMemo, useCallback, useEffect } from 'react';

const DEFAULT_STORAGE_KEY = 'table-page-size';

export type PageSizeOption = 25 | 50 | 100 | 200 | 500 | 'all';

function coerce(raw: string | null): PageSizeOption | null {
  if (raw === 'all') return 'all';
  const n = Number(raw);
  if (n === 25 || n === 50 || n === 100 || n === 200 || n === 500) return n as PageSizeOption;
  return null;
}

/** Backwards-compatible: reads the shared/global page size preference. */
export function readStoredPageSize(): PageSizeOption {
  try {
    const v = coerce(localStorage.getItem(DEFAULT_STORAGE_KEY));
    if (v) return v;
  } catch {}
  return 50;
}

/** Per-module page size. Falls back to the global preference, then to 50. */
export function readStoredPageSizeFor(moduleKey?: string): PageSizeOption {
  if (!moduleKey) return readStoredPageSize();
  try {
    const v = coerce(localStorage.getItem(`${DEFAULT_STORAGE_KEY}:${moduleKey}`));
    if (v) return v;
  } catch {}
  return readStoredPageSize();
}

export function writeStoredPageSizeFor(size: PageSizeOption, moduleKey?: string) {
  try {
    if (moduleKey) localStorage.setItem(`${DEFAULT_STORAGE_KEY}:${moduleKey}`, String(size));
    // Keep the global preference in sync so new modules inherit the last choice.
    localStorage.setItem(DEFAULT_STORAGE_KEY, String(size));
  } catch {}
}

export function useTablePagination<T>(items: T[], moduleKey?: string) {
  const [pageSize, setPageSizeState] = useState<PageSizeOption>(() => readStoredPageSizeFor(moduleKey));
  const [page, setPage] = useState(1);

  const setPageSize = useCallback((size: PageSizeOption) => {
    setPageSizeState(size);
    setPage(1);
    writeStoredPageSizeFor(size, moduleKey);
  }, [moduleKey]);

  const total = items.length;
  const effectiveSize = pageSize === 'all' ? total : pageSize;
  const totalPages = effectiveSize > 0 ? Math.max(1, Math.ceil(total / effectiveSize)) : 1;

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
  const goNext = useCallback(() => setPage(p => Math.min(totalPages, p + 1)), [totalPages]);
  const goLast = useCallback(() => setPage(totalPages), [totalPages]);
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
