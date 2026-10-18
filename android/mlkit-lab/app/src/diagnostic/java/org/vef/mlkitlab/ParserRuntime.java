package org.vef.mlkitlab;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.*;
import java.util.regex.Pattern;

/** Diagnostic-only memoization; the recovered greedy grouping and VEF rules stay intact. */
public final class ParserRuntime {
    private static final Pattern LETTER = Pattern.compile(".*\\p{L}.*");
    private static final ThreadLocal<Trace> TRACE = new ThreadLocal<>();
    private static final ThreadLocal<Groups> GROUPS = new ThreadLocal<>();
    private static final class Entry {
        final int size;
        final TableParser.Token bounds;
        Entry(List<TableParser.Token> tokens) {
            size = tokens.size();
            bounds = TableParser.diagnosticBounds(tokens);
        }
    }
    private static final class Groups {
        final IdentityHashMap<List<TableParser.Token>, Entry> bounds = new IdentityHashMap<>();
        final Map<String, Boolean> letters = new HashMap<>();
        long requests, computations, letterRequests, letterComputations;
    }
    private static final class Trace {
        final RunJournal journal;
        final long started = System.nanoTime();
        String phase = "";
        long phaseStarted;
        final Map<String, Long> nanos = new LinkedHashMap<>();
        long requests, computations, letterRequests, letterComputations;
        Trace(RunJournal journal) { this.journal = journal; }
        void event(String kind, String detail) {
            if (journal == null) return;
            try { journal.event(kind, detail); }
            catch (IOException e) { throw new UncheckedIOException(e); }
        }
        void endPhase() {
            if (phase.isEmpty()) return;
            long elapsed = System.nanoTime() - phaseStarted;
            nanos.merge(phase, elapsed, Long::sum);
            event("PARSER_PHASE_END", phase + " durationMs=" + elapsed / 1e6);
            phase = "";
        }
    }
    private ParserRuntime() {}

    public static TableParser.Result parse(List<TableParser.Token> words,
            List<TableParser.Token> lines, RunJournal journal) {
        Trace trace = new Trace(journal);
        if (TRACE.get() != null) throw new IllegalStateException("Nested diagnostic parser");
        TRACE.set(trace);
        try {
            phase("DATE_ANCHORS");
            return TableParser.parse(words, lines);
        } finally {
            try {
                trace.endPhase();
                trace.event("PARSER_SUMMARY", "totalMs=" + (System.nanoTime() - trace.started) / 1e6
                    + " phasesNs=" + trace.nanos + " groupBoundsRequests=" + trace.requests
                    + " groupBoundsComputations=" + trace.computations
                    + " letterRequests=" + trace.letterRequests
                    + " letterComputations=" + trace.letterComputations
                    + "; internal validation is timed separately; no values automatically approved");
            } finally { GROUPS.remove(); TRACE.remove(); }
        }
    }
    public static void phase(String name) {
        Trace trace = TRACE.get();
        if (trace == null || trace.phase.equals(name)) return;
        trace.endPhase();
        trace.phase = name;
        trace.event("PARSER_PHASE_BEGIN", name);
        trace.phaseStarted = System.nanoTime();
    }
    public static void beginGroups() { GROUPS.set(new Groups()); }
    public static void endGroups() {
        Groups g = GROUPS.get();
        Trace t = TRACE.get();
        if (g != null && t != null) {
            t.requests += g.requests; t.computations += g.computations;
            t.letterRequests += g.letterRequests; t.letterComputations += g.letterComputations;
        }
        GROUPS.remove();
    }
    public static TableParser.Token cachedBounds(List<TableParser.Token> tokens) {
        Groups g = GROUPS.get();
        if (g == null) throw new IllegalStateException("Grouping cache outside its lifecycle");
        g.requests++;
        Entry e = g.bounds.get(tokens);
        // The grouping algorithm only mutates a group by addAll, then restarts.
        // A changed size invalidates its geometry. Other groups remain unchanged.
        if (e == null || e.size != tokens.size()) {
            e = new Entry(tokens); g.bounds.put(tokens, e); g.computations++;
        }
        return e.bounds;
    }
    public static boolean hasLetters(String text, String regex) {
        if (!regex.equals(LETTER.pattern())) throw new IllegalArgumentException("Unexpected grouping expression");
        Groups g = GROUPS.get();
        if (g == null) throw new IllegalStateException("Letter cache outside its lifecycle");
        g.letterRequests++;
        Boolean value = g.letters.get(text);
        if (value == null) {
            value = LETTER.matcher(text).matches(); g.letters.put(text, value); g.letterComputations++;
        }
        return value;
    }
}
