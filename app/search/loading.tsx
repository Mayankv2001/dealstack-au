export default function SearchLoading() {
  return (
    <main
      className="mx-auto min-h-[70vh] w-full max-w-6xl animate-pulse px-4 py-8 sm:px-6"
      aria-label="Building your purchase plan"
    >
      <div className="mx-auto h-8 w-80 rounded bg-muted" />
      <div className="mx-auto mt-3 h-4 w-96 max-w-full rounded bg-muted" />
      <div className="mx-auto mt-6 h-14 max-w-3xl rounded-2xl bg-muted" />
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-xl bg-muted" />
        <div className="h-72 rounded-xl bg-muted" />
      </div>
    </main>
  );
}
