import type { Metadata } from 'next';
import './globals.css';
import './rows.css';
import './matchups.css';
export const metadata: Metadata = {
  title: 'Monstats · Champions analytics',
  description:
    'Observed tournament performance of registered Pokémon Champions teams.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="workspace small muted">
          <details>
            <summary>Artwork credits</summary>
            <p>
              Sprites from{' '}
              <a href="https://play.pokemonshowdown.com/sprites/">
                Pokémon Showdown
              </a>{' '}
              and Mega sprites by Kyledove, contributed through{' '}
              <a href="https://github.com/PokeAPI/sprites/pull/236">PokeAPI</a>.
              Pokémon characters and artwork belong to their respective rights
              holders. Monstats is an unofficial project.
            </p>
          </details>
        </footer>
      </body>
    </html>
  );
}
