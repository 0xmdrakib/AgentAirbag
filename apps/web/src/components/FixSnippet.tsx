import type { Fix } from '@airbag/core';
import { CopyButton } from './Primitives';

export function FixSnippet({ fix, compact = false }: { fix: Fix; compact?: boolean }) {
  return (
    <div className={compact ? 'fix fix-compact' : 'fix'}>
      <div className="fix-head">
        <span className="fix-title">{fix.title}</span>
        <CopyButton value={fix.snippet} label="Copy fix" />
      </div>
      <pre className="fix-code mono">
        <code>{fix.snippet}</code>
      </pre>
    </div>
  );
}
