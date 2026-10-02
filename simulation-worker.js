import { firstMatchInRange } from './simulation.js?v=3';

self.onmessage = ({ data }) => {
  const { jobId, chunkId, start, end, targetRank, words } = data;
  const foundIndex = firstMatchInRange(words, targetRank, start, end);
  self.postMessage({ jobId, chunkId, foundIndex });
};
