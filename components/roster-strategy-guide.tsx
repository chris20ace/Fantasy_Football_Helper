import {
  researchSections,
  researchSources,
} from '@/lib/fantasy/roster-research';

export function RosterStrategyGuide() {
  return (
    <article className="strategy-guide">
      <h2>Fantasy football roster construction and strategy</h2>
      <nav aria-label="Roster research contents">
        {researchSections.map((s) => (
          <a key={s.id} href={`#strategy-${s.id}`}>
            {s.title}
          </a>
        ))}
        <a href="#strategy-sources">Sources</a>
        <a href="/guides/roster-construction.md" download>
          Download research
        </a>
      </nav>
      {researchSections.map((section) => (
        <section key={section.id}>
          <h3 id={`strategy-${section.id}`}>{section.title}</h3>
          {section.paragraphs.map((p, i) => (
            <p key={i}>
              {p.text}
              {p.cites.length > 0 && (
                <>
                  {' '}
                  {p.cites.map((n) => (
                    <a
                      key={n}
                      className="strategy-citation"
                      href={researchSources[n - 1].url}
                      rel="noreferrer"
                      aria-label={`Source ${n}: ${researchSources[n - 1].title}`}
                    >
                      [{n}]{' '}
                    </a>
                  ))}
                </>
              )}
            </p>
          ))}
        </section>
      ))}
      <section>
        <h3 id="strategy-sources">Sources</h3>
        <ol>
          {researchSources.map((s, i) => (
            <li id={`strategy-source-${i + 1}`} key={s.url}>
              {s.by}.{' '}
              <a href={s.url} rel="noreferrer">
                {s.title}
              </a>
              . {s.date}.
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
