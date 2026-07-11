export default function DealsLoading() {
  return <main className="mx-auto min-h-[70vh] w-full max-w-6xl animate-pulse px-4 py-8 sm:px-6" aria-label="Loading deals"><div className="mx-auto h-8 w-72 rounded bg-muted" /><div className="mx-auto mt-4 h-11 max-w-3xl rounded-xl bg-muted" /><div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 rounded-xl bg-muted" />)}</div></main>;
}
