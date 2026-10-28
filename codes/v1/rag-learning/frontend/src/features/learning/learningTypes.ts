export interface GraphSpec {
  kind: 'linear' | 'quadratic' | 'absolute' | 'reciprocal';
  a: number;
  h: number;
  k: number;
  domain: { excluded: number[] };
  viewport: { xMin: number; xMax: number; yMin: number; yMax: number };
}
export interface LearningCatalog {
  exercise: {
    id: string;
    title: string;
    description: string;
    provenance: string;
    curriculum: string;
  };
  resources: {
    id: string;
    title: string;
    description: string;
    url: string;
    sourceModuleId: string | null;
    publisher: string;
    reuse: string;
    verifiedAt: string;
    noticeUrl: string;
    curriculumMappings: { unitCode: string; title: string; status: string }[];
  }[];
}
export interface LearningSession {
  id: string;
  exercise: {
    templateId: string;
    revision: number;
    viewType: string;
    title: string;
    instructions: string;
    provenance: string;
    domainNote: string;
    hint: string;
    graphs: { id: string; label: string; spec: GraphSpec }[];
    choices: { id: string; label: string }[];
  };
  responses: Record<string, string>;
  feedback: {
    score: number;
    total: number;
    parts: Record<string, { correct: boolean; choiceId: string; explanation: string }>;
  } | null;
  version: number;
  created_at: string;
  submitted_at: string | null;
}
export interface LearningSessionSummary {
  id: string;
  created_at: string;
  submitted_at: string | null;
  score: number | null;
}
