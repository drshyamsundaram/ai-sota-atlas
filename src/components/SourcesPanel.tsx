type Row = { source_name: string; source_url: string };

/** Lists every data source actually present in the current batch, with row counts. */
export function SourcesPanel({
  title = "Sources",
  groups,
}: {
  title?: string;
  groups: { label: string; rows: Row[]; note?: string }[];
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-10">
      <div className="rounded-lg border border-border p-5">
        <h2 className="mono-label mb-4">{title}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {groups.map((g) => {
            const map = new Map<string, { name: string; url: string; n: number }>();
            for (const r of g.rows) {
              let host = r.source_url;
              try {
                const u = new URL(r.source_url);
                host = u.origin + u.pathname;
              } catch {
                /* keep raw */
              }
              const key = `${r.source_name}|${host}`;
              const cur = map.get(key) ?? { name: r.source_name, url: host, n: 0 };
              cur.n += 1;
              map.set(key, cur);
            }
            const list = [...map.values()].sort((a, b) => b.n - a.n);
            return (
              <div key={g.label}>
                <h3 className="text-sm font-semibold">{g.label}</h3>
                {g.note ? <p className="mt-1 text-xs text-muted-foreground">{g.note}</p> : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {list.length === 0 ? (
                    <li className="text-muted-foreground">No rows stored yet.</li>
                  ) : (
                    list.map((s) => (
                      <li key={s.name + s.url} className="flex justify-between gap-3">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-primary hover:underline"
                        >
                          {s.name}
                        </a>
                        <span className="mono-label shrink-0">{s.n} rows</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
