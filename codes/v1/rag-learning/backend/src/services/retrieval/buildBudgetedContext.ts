import { getEncoding } from 'js-tiktoken';
import type { ContextPassage } from '../../types/applicationTypes.js';
const encoding = getEncoding('cl100k_base');
export function countContextTokens(text: string) {
  return encoding.encode(text).length;
}
export function renderContextPassage(passage: ContextPassage) {
  return `[${passage.citation}] ${passage.path}\n${passage.content}`;
}
export function buildBudgetedContext(
  candidates: Omit<ContextPassage, 'citation' | 'truncated'>[],
  budget: number,
) {
  const passages: ContextPassage[] = [];
  let context = '';
  const used = new Set<string>();
  for (const candidate of candidates) {
    if (used.has(candidate.chunkId)) continue;
    used.add(candidate.chunkId);
    const passage: ContextPassage = {
      ...candidate,
      citation: passages.length + 1,
      truncated: false,
    };
    const prefix = context ? context + '\n\n' : '';
    if (countContextTokens(prefix + renderContextPassage({ ...passage, content: '' })) >= budget)
      break;
    if (countContextTokens(prefix + renderContextPassage(passage)) > budget) {
      let low = 0;
      let high = passage.content.length;
      while (low < high) {
        const midpoint = Math.ceil((low + high) / 2);
        if (
          countContextTokens(
            prefix +
              renderContextPassage({ ...passage, content: passage.content.slice(0, midpoint) }),
          ) <= budget
        )
          low = midpoint;
        else high = midpoint - 1;
      }
      if (/^[\uD800-\uDBFF]$/.test(passage.content[low - 1] ?? '')) low--;
      passage.content = passage.content.slice(0, low);
      passage.endOffset = passage.startOffset + low;
      passage.truncated = true;
    }
    if (!passage.content.trim()) break;
    context = prefix + renderContextPassage(passage);
    passages.push(passage);
    if (passage.truncated) break;
  }
  return { passages, context, contextTokenCount: countContextTokens(context) };
}
