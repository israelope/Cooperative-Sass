'use client';

import { useState } from 'react';
import Icon from '@/components/Icon';

export default function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value));
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  }
  return (
    <button type="button" onClick={copy} className="btn-quiet">
      <Icon name={done ? 'check' : 'copy'} size={16} /> {done ? 'Copied' : label}
    </button>
  );
}
