/** Provider-neutral experiment contracts. Expected labels never enter model state. */
export type Direction = 'belief' | 'question' | 'adaptation';
export type Split = 'development' | 'evaluation';
export type Variant = 'canonical' | 'paraphrase' | 'reversed';
export type Provider = 'typesafe' | 'openrouter';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Candidate { id: string; action: string; predictions: string; requirements: string }
export interface Case {
  id: string;
  direction: Direction;
  split: Split;
  title: string;
  state: { [key: string]: Json };
}
export interface Gold { labels: string[]; reason: string }
export interface Baseline {
  author: string;
  limitation: string;
  createdAt: string;
  unaided: Record<string, string>;
  checklist: Record<string, string>;
}
export interface RubricSection {
  instruction: string;
  paraphrase: string;
  criteria: Record<string, string>;
}
export interface Rubric {
  version: string;
  note: string;
  sections: Record<Direction, RubricSection>;
}
export type Question =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };
export type Answer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, string> }
  | { type: 'noul'; noul: number };
export interface Request { model: string; state: Json; questions: Record<string, Question> }
export interface Response {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number; cost?: number };
  id?: string;
  provider?: string;
}
export interface Event {
  caseId: string;
  direction: Direction;
  variant: Variant;
  startedAt: string;
  request: Request;
  fingerprint: string;
  elapsedMs: number;
  attempts: number;
  response?: Response;
  rawResponse?: Json;
  error?: { kind: string; message: string; status?: number };
}
export interface Manifest {
  schemaVersion: 1;
  createdAt: string;
  live: boolean;
  provider: Provider;
  endpoint: string;
  requestedModel: string;
  split: Split;
  variants: Variant[];
  rubric: Rubric;
  cases: Case[];
  gold: Record<string, Gold>;
  baselines: Baseline;
  hashes: Record<string, string>;
  plannedRequests: number;
}
