import type { CSSProperties } from 'react';
import { pokemonColor } from '@/domain/presentation';
export const rowColor = (id: string) =>
  ({ '--row-color': pokemonColor(id) }) as CSSProperties;
