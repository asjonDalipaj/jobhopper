import Table from 'cli-table3';
import pc from 'picocolors';

export function verdictColor(v: string): string {
  const s = v.toLowerCase();
  if (s === 'strong') return pc.green(pc.bold(v));
  if (s === 'fair') return pc.yellow(v);
  if (s === 'weak') return pc.magenta(v);
  if (s === 'no') return pc.red(v);
  return v;
}

export function boxTable(head: string[], rows: unknown[][]): string {
  const table = new Table({ head, style: { head: ['cyan'] }, wordWrap: true });
  for (const row of rows) table.push(row);
  return table.toString();
}

export function dim(s: string): string {
  return pc.dim(s);
}