> Scritto dopo revisione della letteratura empirica su TDD + AI-assisted coding.
> Arricchito con: skillsmp.com ecosystem search, deepwiki (fast-check, Hypothesis), github-grep.
> Stato: **ricerca aperta** — non ancora una decisione di prodotto definitiva.
> Data: 2026-03-16

---

## Conclusione principale

**Non implementare TDD come default universale di xtrm.**

La ricerca supporta un modello ibrido a strati. Il caso per TDD-first è empiricamente debole
nel contesto che conta di più per xtrm: lo stesso agente che scrive sia codice sia test.

**Nuance:** TDD non è privo di valore — ha una nicchia valida specifica: quando l'interfaccia
è poco chiara o in evoluzione e i test servono a guidare la progettazione. Al di fuori di
quella nicchia, è il default sbagliato.

---

## Perché TDD-first non regge come default

### 1. Il caso "stesso agente" è il caso debole

Le migliori prove pro-TDD con LLM (es. *Test-Driven Development for Code Generation*, arXiv
2402.13521) migliorano la correttezza del ~9–30% **quando i test sono forniti come specifica
esterna**. Assumono un flusso human-in-the-loop in cui l'utente scrive il test, il modello
implementa. Non parlano del caso in cui l'agente genera entrambi dallo stesso contesto.

Quando l'agente produce codice e test in sequenza, il test misura solo se l'agente è
consistente con se stesso — non se il comportamento è corretto. È compliance theater.

### 2. I test generati da LLM sono spesso fragili

Dati empirici (arXiv 2406.18181):
- GPT-4 arriva a **40% line coverage** contro **79% di EvoSuite**
- **34–62%** di test sintatticamente invalidi
- Per **87% dei difetti**, nessun test valido generato
- Tra i difetti "attaccabili", solo **47%** rilevati

Questo invalida "almeno qualcosa è meglio di niente" — il falso senso di copertura è peggio
di nessuna copertura.

### 3. Le codebase AI-assisted mature non usano TDD-first

Pattern pubblico da GitHub Copilot, Anthropic, Cursor — confermato dall'ecosistema
(athola/precommit-setup, 213 stelle):

```
agent → first-pass solution → lint + type + build + test gates → human review
```

L'enforcement universale è sul **quality stack (PostToolUse)**, non sul rito
red-green-refactor (PreToolUse). I test sono checkpoint obbligatori, non prerequisiti
di sviluppo.

### 4. Il costo di test fragili si cristallizza presto

Studio su 152 progetti: almeno **88%** dei test smells nasce al primo commit, **~80%**
non viene corretto entro 1.000 giorni, solo **2.18%** delle istanze viene mai corretto.
Test sugli internals introdotti presto aumentano il costo di refactor a lungo termine.

---

## Tassonomia degli anti-pattern AI-specifici

Quattro failure mode che gli agenti mostrano sistematicamente (MasterCodeYoda/test-strategy):

1. **Tautological tests** — Il test riformula l'implementazione come asserzione. Verificare
   usando valori concreti, non calcolati, per assicurarsi che il test catturi un bug reale.

2. **Assertion-free tests** — Il codice viene eseguito senza verificare outcome osservabili.
   Ogni test deve asserire return value, state change, o side effect.

3. **Context leakage** — Test che passano grazie a stato condiviso con altri test. Ogni test
   deve essere eseguibile indipendentemente con il proprio arrange.

4. **Untested mutations** — Test che coprono code path ma non catturano bug reali. Usare
   mutation testing o "manual sabotage" sulla logica di dominio.

Tutti e quattro sono amplificati quando l'agente genera codice e test dallo stesso contesto.

---

## Matrice di selezione della strategia

Situazioni diverse richiedono strategie diverse:

| Situazione | Strategia | Rationale |
|------------|-----------|-----------|
| **Interfaccia poco chiara / in evoluzione** | **TDD** | I test guidano la progettazione; ogni ciclo rivela la prossima decisione di interfaccia |
| Contratto noto a priori | Spec-First | Scrivi i test dalla specifica, poi implementa |
| Trasformazioni dati / parser | Property-Based | Genera edge case che gli umani mancano; verifica invarianti |
| Boundary di servizio / API | Contract Testing | Garantisce allineamento produttore-consumatore |
| Codice legacy senza test | Characterization Testing | Cattura il comportamento esistente prima di cambiare |
| CRUD semplice | Example-Based | Non over-engineerare |

La maggior parte delle feature combina più strategie: una vertical slice tipica usa TDD per
la logica di dominio, contract tests per le API, property-based per le trasformazioni.

---

## Il modello ibrido raccomandato

### Layer architetturali (0x7067/test-gen)

```
Core     (funzioni pure, logica dominio)       → unit + property-based — ZERO mock
Boundary (parser, I/O, interfacce esterne)     → contract tests
Shell    (orchestrazione, wiring)              → integration tests
```

La regola del core layer è critica: **nessun mock, passare valori concreti direttamente
alle funzioni**. Mockare nel core dimostra solo che il mock si comporta come il mock.

### Layer di enforcement

| Layer | Cosa copre | Tool (TS / Python) | Enforcement |
|-------|-----------|-------------------|-------------|
| Boundary contracts | API pubbliche, input/output di servizi | Zod / icontract + deal | PreToolUse reminder |
| Behavior / integration | Scenari utente, interfacce pubbliche | Vitest / pytest | PostToolUse gate |
| Property-based | Invarianti, round-trip, edge cases | fast-check + @fast-check/vitest / Hypothesis | Opt-in per dominio |
| Unit selettivi | Logica algoritmica, funzioni pure | Vitest / pytest | Dove precision locale conta |
| Evals | Output agente, workflow, tool behavior | Anthropic evals pattern | Review step |
| Lint + types | Correttezza sintattica e statica | ESLint + tsc / Ruff + mypy | PostToolUse auto |

### Discovery-first workflow per agenti (medtrics/14-test-unit-test)

Prima di scrivere qualsiasi test:
1. `git diff main...HEAD --name-only` — scope ai file modificati
2. Classifica i candidati: logica reale vs thin wrapper
3. Reporta i findings prima di scrivere
4. Poi scrivi — solo per i target ad alto ROI

**HIGH ROI (testa questi):**
- Funzioni pure con logica reale (trasformazioni, validatori, computazioni)
- Hook con `useState`/`useReducer`/`useMemo` + branching reale
- Costanti di feature e completezza di enum

**LOW ROI (salta — territorio E2E):**
- Wrapper thin di useQuery/useMutation che chiamano solo un servizio
- Service file (mockare dipendenze esterne non prova nulla di significativo)
- Componenti UI e organismi (fragili, coperti meglio da E2E)

### Classical vs London-school (markky21/nextjs-classical-testing)

**Non mockare:**
- Il proprio codice, collaboratori interni, child components
- Per il proprio data layer: usare **in-memory fake che implementa la stessa interfaccia**,
  non `vi.fn()` stub

**Mockare:**
- API esterne, primitivi del framework (Next.js headers/navigation)
- Network requests via MSW al boundary HTTP

Asserire su cambiamenti DOM / return value osservabili, non su handler calls.

---

## Executable specifications — risposta alla domanda aperta

> *Il rito di scrivere qualcosa che fallisce prima produce una specifica migliore?*

**Sì, ma solo se è una specifica, non un unit test.**

Il pattern rmarquis/executable-specifications implementa una struttura a 3 livelli che ha
giustificazione empirica: forza l'esplicitazione della specifica prima dell'implementazione,
indipendentemente dal tipo di test. È il bridge tra TDD-come-disciplina (valido) e
TDD-come-coverage-theater (invalido).

**Livello 1 — Interface contracts:**
Pre/post-conditions, return guarantees, error handling per ogni metodo del modulo pubblico.
Un test per comportamento (happy path, poi scenari di errore).

**Livello 2 — Behavior specs:**
Given-When-Then derivati dagli acceptance criteria. Un test per criterio, tracciabile a
requirement via comment ID. I nomi dei test si leggono come statement di specifica.

**Livello 3 — Property specs:**
Invarianti su input random. Seed deterministico, ~100 iterazioni.

---

## Pattern di invarianti per property-based testing

Sei pattern fondamentali validi trasversalmente (0x7067/test-gen, fast-check deepwiki):

| Pattern | Esempio |
|---------|---------|
| Idempotency | `f(f(x)) == f(x)` — normalizzare whitespace |
| Round-trip | `parse(serialize(x)) == x` — JSON encode/decode |
| Commutativity | `f(a,b) == f(b,a)` — operazioni su insiemi |
| Monotonicity | input ordinato → output ordinato (pricing tiers) |
| Invariant preservation | pre-conditions garantiscono post-conditions (balance >= 0) |
| Identity element | `f(x, identity) == x` — sommare zero |

**fast-check + Vitest:**
```typescript
test.prop([fc.string(), fc.string()])('round-trip', (a, b) => {
  return decode(encode(a + b)) === a + b
})
```

**Hypothesis + pytest:**
```python
@given(st.text(), st.text())
def test_round_trip(a, b):
    assert decode(encode(a + b)) == a + b
```

Per CI: usare `--hypothesis-profile=ci`, aumentare `max_examples` per test critici,
attenzione a `HealthCheck.function_scoped_fixture` con pytest fixtures.

---

## Implicazioni concrete per xtrm

### `tdd-guard` — deprecare come hard gate PreToolUse

Mantenere come *suggerimento* opzionale quando rileva pattern implementation-heavy.
Il blocco ha giustificazione empirica per `main-guard` (protegge invarianti oggettivi)
e `beads-edit-gate` (protegge il workflow di tracking). Non ce l'ha per testing.

**Alternativa:** trasformarlo in un reminder che propone di scrivere uno scenario
behavior/contract/spec prima di implementare, senza bloccare. TDD resta opt-in per
il caso "interfaccia in evoluzione".

### `Stop` hook — mantenere per beads, non per testing discipline

`Stop` con exit code 2 blocca correttamente la sessione quando il claim è aperto.
È il backstop giusto per il workflow di tracking. Usarlo anche per enforcement testing
aggiunge friction senza payoff corrispondente.

Nota tecnica: la docs Claude Code documenta `Stop` → `decision: "block"` + `reason`,
ma **non documenta reiniezione di user-message sintetico**. Non contare su quel meccanismo.

### Skill `using-TDD` → riscrivere come `behavior-first` / `spec-first`

Il default skill per testing in xtrm dovrebbe riflettere il modello ibrido sopra.
Includere la matrice di selezione della strategia. TDD può restare come opzione esplicita
opt-in per scenari "interfaccia poco chiara", non come default attivato automaticamente.

**Nuovo skill candidato:** `executable-specifications` — struttura a 3 livelli
(contracts → behavior specs → property specs) che risponde alla domanda aperta.

### `using-quality-gates` — questo è il default corretto

PostToolUse lint + type gates sono l'enforcement universale supportato dalla letteratura e
confermato dall'ecosistema (213 stelle). È il layer più difendibile; va rafforzato, non
sostituito.

### Serena namespace deduplication e gitnexus forcing function

Nulla nella letteratura li tocca. Indipendenti dalla decisione testing. Procedere.

---

## Mossa successiva raccomandata

Prima di scrivere hook nuovi: **decision matrix su corpus reale**.

Prendere task già esistenti in xtrm con outcome noti (PR merge, regression introdotta,
refactor riuscito) e misurare retroattivamente:

- Quale policy avrebbe catturato la regression?
- Quale policy avrebbe aggiunto friction senza beneficio?
- Quale churn avrebbe generato sulla suite nel tempo?

Policy da confrontare:
1. `TDD-first` (status quo tdd-guard)
2. `behavior-first + contracts` (modello ibrido sopra)
3. `hybrid layered` (ibrido completo con property-based + evals)

Metriche: regressioni reali, churn suite, refactor breakage, tempo CI, false-positive rate.

---

## Riferimenti chiave

**Letteratura empirica:**
- arXiv 2402.13521 — Test-Driven Development for Code Generation
- arXiv 2406.18181 — An Empirical Study of Unit Test Generation with LLMs
- Google Testing Blog — Effective Testing (testare API, non internals)
- ASE'16 — Test Smells persistence study (W&M CS)
- Anthropic Engineering — Demystifying Evals for AI Agents
- Claude Code Docs — Hooks reference (Stop hook behavior)

**Tool documentation:**
- fast-check — @fast-check/vitest integration (deepwiki)
- Hypothesis — pytest integration, CI profiles (deepwiki)
- icontract + icontract-hypothesis — DbC + property-based per Python

**Skill ecosystem:**
- athola/precommit-setup (213★) — three-layer quality gate, testing as PostToolUse checkpoint
- MasterCodeYoda/test-strategy — AI anti-patterns + strategy selection matrix
- 0x7067/test-gen — architectural layers (core/boundary/shell) + 6 invariant patterns
- rmarquis/executable-specifications — spec-first 3-level structure
- markky21/nextjs-classical-testing — classical vs London-school, mock boundaries
- medtrics/14-test-unit-test — discovery-first workflow, risk-based prioritization
