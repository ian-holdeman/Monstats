'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h1>Monstats couldn’t open this view</h1>
      <p>Your local dataset has been preserved.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
