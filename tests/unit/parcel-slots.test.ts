import { expect, expectTypeOf, it } from 'vitest';
import type { ParcelDetail } from '@/shared/schemas';
import type { ProofViewerProps, RiderActionPanelProps } from '@/shared/types/parcel-slots';
import { assertUnreachable } from '../harness/import-graph';

it('M2-PH3-T03 H34 slot props take the A12 detail and a refetch callback', () => {
  expectTypeOf<RiderActionPanelProps>().toEqualTypeOf<{ parcel: ParcelDetail; onChanged(): void }>();
  expectTypeOf<ProofViewerProps>().toEqualTypeOf<RiderActionPanelProps>();
});

it('M2-PH3-T03 the slot contract depends on no M3 component or server code', () => {
  expect(() => assertUnreachable(process.cwd(), 'src/shared/types', /^src\/(features\/delivery|server)\//)).not.toThrow();
});
