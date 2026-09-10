import type { RetrievedChunk } from '../../types/applicationTypes.js';
export function combineRankedCandidates(
  vectorCandidates: RetrievedChunk[],
  keywordCandidates: RetrievedChunk[],
  candidateCount: number,
) {
  const merged = new Map<string, RetrievedChunk>();
  for (const list of [vectorCandidates, keywordCandidates]) {
    list.forEach((candidate, index) => {
      const previous = merged.get(candidate.id);
      merged.set(candidate.id, {
        ...previous,
        ...candidate,
        fusionScore: (previous?.fusionScore ?? 0) + 1 / (60 + index + 1),
      });
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.fusionScore! - a.fusionScore! || a.id.localeCompare(b.id))
    .slice(0, candidateCount);
}
