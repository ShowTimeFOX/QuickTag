// Fuzzy tag matching. Pure functions; lower scores are better matches.

const MAX_RESULTS = 60;

/**
 * Scores how well `query` matches `candidate` (both already formatted).
 * Returns Infinity when there is no match. Tiers, best first:
 *   < 0.5  substring of a word (earlier and tighter is better)
 *   0.5+   within edit distance of a word fragment (typo tolerance, 3+ chars)
 *   2+     characters appear in order across the whole tag
 */
export function getFuzzyScore(query, candidate) {
  const candidateWords = candidate.split("_");
  let bestScore = Infinity;

  candidateWords.forEach((word) => {
    const position = word.indexOf(query);
    if (position >= 0) {
      bestScore = Math.min(bestScore, position * 0.08 + (word.length - query.length) * 0.002);
    }
    if (query.length < 3) return;

    const maxDistance = Math.max(1, Math.floor(query.length * 0.25));
    for (let length = Math.max(1, query.length - maxDistance); length <= query.length + maxDistance && length <= word.length; length += 1) {
      for (let start = 0; start + length <= word.length; start += 1) {
        const fragment = word.slice(start, start + length);
        const previousRow = Array.from({ length: fragment.length + 1 }, (_, index) => index);
        let row = [];
        for (let queryIndex = 1; queryIndex <= query.length; queryIndex += 1) {
          row = [queryIndex];
          for (let fragmentIndex = 1; fragmentIndex <= fragment.length; fragmentIndex += 1) {
            row[fragmentIndex] = Math.min(
              row[fragmentIndex - 1] + 1,
              previousRow[fragmentIndex] + 1,
              previousRow[fragmentIndex - 1] + (query[queryIndex - 1] === fragment[fragmentIndex - 1] ? 0 : 1),
            );
          }
          previousRow.splice(0, previousRow.length, ...row);
        }
        const distance = previousRow[fragment.length];
        if (distance <= maxDistance) {
          bestScore = Math.min(bestScore, 0.5 + distance + start * 0.01);
        }
      }
    }
  });

  if (bestScore < Infinity) return bestScore;
  let queryIndex = 0;
  let lastMatch = -1;
  let gaps = 0;
  for (let index = 0; index < candidate.length && queryIndex < query.length; index += 1) {
    if (candidate[index] === query[queryIndex]) {
      if (lastMatch >= 0) gaps += index - lastMatch - 1;
      lastMatch = index;
      queryIndex += 1;
    }
  }
  return queryIndex === query.length ? 2 + gaps * 0.1 : Infinity;
}

/**
 * Searches every tag in a pack. Returns up to 60 unique results:
 * `{ tag, groupName, categoryName, score }`, best score first.
 */
export function searchPack(pack, query, formatTag) {
  if (!query || !pack) return [];

  const bestByTag = new Map();
  Object.entries(pack.groups).forEach(([groupName, categories]) => {
    Object.entries(categories).forEach(([categoryName, tags]) => {
      tags.forEach((tag) => {
        const cleanTag = formatTag(tag);
        if (!cleanTag) return;
        const score = getFuzzyScore(query, cleanTag);
        if (score === Infinity) return;
        const existing = bestByTag.get(cleanTag);
        if (!existing || score < existing.score) {
          bestByTag.set(cleanTag, { tag: cleanTag, groupName, categoryName, score });
        }
      });
    });
  });

  return [...bestByTag.values()].sort((first, second) => first.score - second.score || first.tag.localeCompare(second.tag)).slice(0, MAX_RESULTS);
}
