import { randomInt, randomUUID } from 'node:crypto';

export interface GraphSpec {
  kind: 'linear' | 'quadratic' | 'absolute' | 'reciprocal';
  a: number;
  h: number;
  k: number;
  domain: { excluded: number[] };
  viewport: { xMin: number; xMax: number; yMin: number; yMax: number };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const signed = (n: number) => (n === 0 ? '' : n < 0 ? ` − ${-n}` : ` + ${n}`);

// Four distinct families make each match unique. All parameters are generated locally.
export function createGraphExercise() {
  const families = ['linear', 'quadratic', 'absolute', 'reciprocal'] as const;
  const records = families.map((kind) => {
    const a = [-2, -1, 1, 2][randomInt(4)];
    const h = kind === 'linear' ? 0 : randomInt(-2, 3);
    const k = randomInt(-2, 3);
    const coefficient = a === 1 ? '' : a === -1 ? '−' : a < 0 ? `−${-a}` : `${a}`;
    const shifted = h === 0 ? 'x' : `(x${signed(-h)})`;
    const expressions = {
      linear: `y = ${coefficient}x${signed(k)}`,
      quadratic: `y = ${coefficient}${shifted}²${signed(k)}`,
      absolute: `y = ${coefficient}|x${signed(-h)}|${signed(k)}`,
      reciprocal: `y = ${a < 0 ? `−${-a}` : a}/${shifted}${signed(k)}`,
    };
    const explanations = {
      linear: `The line has slope ${a} and crosses the y-axis at ${k}.`,
      quadratic: `The parabola has vertex (${h}, ${k}) and opens ${a > 0 ? 'upward' : 'downward'}.`,
      absolute: `The two straight arms meet at (${h}, ${k}) and point ${a > 0 ? 'upward' : 'downward'}.`,
      reciprocal: `The two branches approach x = ${h} and y = ${k}. The function is undefined at x = ${h}.`,
    };
    const spec: GraphSpec = {
      kind,
      a,
      h,
      k,
      domain: { excluded: kind === 'reciprocal' ? [h] : [] },
      viewport: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
    };
    return {
      id: randomUUID(),
      spec,
      expression: expressions[kind],
      explanation: explanations[kind],
    };
  });
  const choices = shuffle(records).map((record) => ({ id: record.id, label: record.expression }));
  const answerKey: Record<string, { choiceId: string; explanation: string }> = {};
  const graphs = shuffle(records).map((record, index) => {
    const id = `graph-${index + 1}`;
    answerKey[id] = { choiceId: record.id, explanation: record.explanation };
    return { id, label: String.fromCharCode(65 + index), spec: record.spec };
  });
  return {
    exercise: {
      templateId: 'grove-function-graph-matching',
      revision: 1,
      viewType: 'function_graph_matching',
      title: 'Match equations to graphs',
      instructions: 'Choose the equation for each graph. Use each equation once.',
      provenance: 'Original Grove exercise',
      curriculum: { unitCode: 'CP02', title: 'Functions and graphs', status: 'candidate' },
      domainNote:
        'Domains are all real numbers, except excluded x-values shown below. The plots show a window from −6 to 6 on both axes.',
      hint: 'First identify the shape: a straight line, a parabola, two straight arms, or two separate curved branches. Then compare intercepts, turning points, and asymptotes.',
      choices,
      graphs,
    },
    answerKey,
  };
}
export type GraphExercise = ReturnType<typeof createGraphExercise>['exercise'];
export type GraphAnswerKey = ReturnType<typeof createGraphExercise>['answerKey'];
