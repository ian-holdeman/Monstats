import type { NormalizedEvent, Slot } from '../src/domain/types';
export const slot = (id: string): Slot => ({
  id,
  name: id,
  originalName: id,
  originalId: id,
  derivedForm: null,
  item: null,
  ability: null,
  moves: null,
  nature: null,
  stats: null,
});
export function fixture(): NormalizedEvent {
  return {
    id: 'event-a',
    name: 'Test only',
    regulation: 'M-C',
    date: '2026-09-20T12:00:00Z',
    completed: true,
    platform: 'SWITCH',
    players: 3,
    sheet: {
      visibility: 'open',
      basis: 'verified',
      evidence: 'deterministic fixture',
    },
    phases: [{ phase: 1, type: 'SWISS', mode: 'BO3', rounds: 3 }],
    registrations: [
      { player: 'a', slots: [slot('incineroar'), slot('rillaboom')], drop: 3 },
      {
        player: 'b',
        slots: [slot('incineroar'), slot('sneasler')],
        drop: null,
      },
      { player: 'c', slots: [slot('sneasler'), slot('garchomp')], drop: null },
    ],
    matches: [
      { id: '1', phase: 1, round: 1, player1: 'a', player2: 'b', winner: 'a' },
      { id: '2', phase: 1, round: 2, player1: 'a', player2: 'c', winner: 'c' },
      { id: '3', phase: 1, round: 3, player1: 'b', player2: 'c', winner: 'c' },
    ],
    quarantine: [],
    snapshots: [],
  };
}
