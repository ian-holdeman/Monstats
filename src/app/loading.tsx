export default function Loading() {
  return (
    <main className="loading" aria-busy="true">
      <p>Loading your published dataset…</p>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </main>
  );
}
