import path from 'node:path';
import { scanProject } from '../core/scanner.js';
import { I, colors, statusColor, statusSymbol, statusLabel, displayName } from '../ui/theme.js';

function printHeader(targetDir: string): void {
  console.log('');
  console.log(`${I}${colors.dim}Target${colors.reset}   ${targetDir}`);
}

function printStatusMatrix(states: import('../types.js').PartState[]): void {
  console.log('');
  console.log(`${I}${'Part'.padEnd(14)}${'Status'.padEnd(14)}Files`);
  console.log(`${I}${'─'.repeat(50)}`);

  for (const ps of states) {
    const col = statusColor(ps.status);
    const sym = statusSymbol(ps.status);
    const label = statusLabel(ps.status);
    const name = displayName(ps.part).padEnd(14);

    const fileList = ps.part.files.map((f) => f.target);
    const statusText = `${sym} ${label}`;
    const statusPad = statusText.padEnd(12);

    if (ps.status === 'not-installed') {
      console.log(`${I}${name}${col}${statusPad}${colors.reset}`);
    } else if (fileList.length > 0) {
      console.log(`${I}${name}${col}${statusPad}${colors.reset} ${fileList[0]}`);
      const indent = ' '.repeat(I.length + 14 + 12 + 1);
      for (let i = 1; i < fileList.length; i++) {
        console.log(`${indent}${fileList[i]}`);
      }
    } else {
      console.log(`${I}${name}${col}${statusPad}${colors.reset}`);
    }
  }
}

export async function status(targetDir: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);

  printHeader(resolvedDir);

  const states = await scanProject(resolvedDir);

  printStatusMatrix(states);

  const installed = states.filter((s) => s.status === 'installed').length;
  const modified = states.filter((s) => s.status === 'modified').length;
  const available = states.filter((s) => s.status === 'not-installed').length;

  console.log('');
  console.log(`${I}${installed} installed, ${modified} modified, ${available} available`);
  console.log('');
}
