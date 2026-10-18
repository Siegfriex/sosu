// Every run starts with an empty request ledger, so per-phase budgets apply to this run only.
import { rmSync } from 'node:fs';
import { LEDGER } from './tests/lib.mjs';

export default function globalSetup() {
  rmSync(LEDGER, { force: true });
}
