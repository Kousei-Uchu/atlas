// The printable page for a view (M8-02, D-069). It is the export model laid out as a document, so a PDF made
// by the browser's own "Save as PDF" holds exactly what the other formats hold, and nothing else (R-05).
// It is hidden on screen and shown only while printing. Everything stays on this device: there is no PDF
// library and no server. State names are text, so nothing depends on colour or on printing in colour (I-09).

/** @param {{ model: ReturnType<import('../../domain/export-model.js').buildExportModel>['model'] }} props */
export function PrintSheet({ model }) {
  return (
    <article className="print-sheet" data-testid="print-sheet" aria-label="Printable page">
      <h1>{model.title}</h1>
      <p>For: {model.audience === null ? 'Everyone (my own answers)' : model.audience}</p>
      <p>Prepared on {model.date}</p>
      <p className="print-statement">{model.statement}</p>
      <h2>How to read this</h2>
      <ul>
        {model.legend.map((s) => (
          <li key={s.id ?? s.label}><strong>{s.label}</strong>{s.description ? `: ${s.description}` : ''}</li>
        ))}
      </ul>
      {model.sections.map((section) => (
        <section key={section.name} className="print-section">
          <h2>{section.name}</h2>
          <ul>
            {section.items.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                {item.kind === 'state'
                  ? <><span>{item.label}</span>: <strong>{item.state.label}</strong></>
                  : <><span>{item.label}</span>:{' '}<span className="print-words">{item.text.trim() === '' ? '(nothing written)' : item.text}</span></>}
                {item.note ? <p className="print-note">Note: {item.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="print-statement">{model.statement}</p>
    </article>
  );
}
