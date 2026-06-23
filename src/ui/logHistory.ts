import type { LogLineView } from './store.svelte';

export function appendLogLine(
  lines: LogLineView[],
  line: LogLineView,
  maxLines = 60
): { lines: LogLineView[]; appended: boolean } {
  const prev = lines.at(-1);
  if (prev?.html === line.html) {
    return {
      lines: [
        ...lines.slice(0, -1),
        { ...prev, count: (prev.count ?? 1) + 1 },
      ],
      appended: false,
    };
  }

  const next = [...lines, line];
  while (next.length > maxLines) next.shift();
  return { lines: next, appended: true };
}
