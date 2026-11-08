import { useEffect, useState } from 'react';
import type { Notice } from '../store';

export function Toast({ notice }: { notice: Notice | null }) {
  const [shown, setShown] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    setShown(notice);
    const t = setTimeout(() => setShown(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  if (!shown) return null;
  return <div className={`toast ${shown.kind}`} role="status" data-testid="toast">{shown.text}</div>;
}
