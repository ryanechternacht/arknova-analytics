// Bundled into an IIFE and injected into a BGA page to test the parser against many games.
import { analyze, normalizeInput } from '../src/lib/parse';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__arkAnalytics = { analyze, normalizeInput };
