# LaTeX Document Expert — Persistent Memory

## Active Project
White paper: "Crux: AI Agent Personas Debate to Reveal Disagreement Maps"
- Root: `C:/Users/tarun/code/Faultline/Faultline/paper/`
- Entry point: `main.tex`
- Sections: `sections/00_*.tex` through `sections/10_*.tex`
- Bibliography: `references.bib` (natbib/plainnat)
- Details: see `patterns.md`

## Key Conventions for This Paper
- System name macro: `\crux` (primary) and `\cruxname` (alias) — both expand to `\textsc{Crux}`
- Glossary entry key for the concept is `crux` (accessed via `\gls{crux}`) — does NOT conflict with `\crux` macro
- Editorial macros: `\todo{}` (BrickRed), `\openq{}` (MidnightBlue), `\hyp{}` (OliveGreen)
- Compiler: pdflatex (no Unicode font requirements; glossaries-extra + makeglossaries needed)
- Build sequence: `pdflatex` → `bibtex` → `makeglossaries` → `pdflatex` × 2

## Stable Patterns (Cross-Project)
- Always define `\crux`-style name macros BEFORE glossary entries to avoid naming conflicts
- `glossaries-extra` must be loaded BEFORE `hyperref`; `cleveref` must be loaded AFTER `hyperref`
- `\todo{}` inside tabularx cells is safe (expands to `\textcolor{}\textbf{}`)
- For `algorithm2e`: use `[ruled,vlined,linesnumbered]` options for publication style
- natbib `[round]` option gives `(Author, Year)` citation style; use `\citet` for in-text, `\citep` for parenthetical
