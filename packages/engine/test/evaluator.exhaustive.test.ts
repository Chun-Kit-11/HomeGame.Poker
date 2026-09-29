import { describe, expect, it } from 'vitest';
import { categoryOf, scoreHand } from '../src';

// Slow (a few minutes). Run with: npm run test:exhaustive
describe.skipIf(!process.env.EXHAUSTIVE)('exhaustive 7-card enumeration', () => {
  it('all 133,784,560 seven-card hands have the known category counts', () => {
    const counts = new Array(9).fill(0);
    const h = [0, 0, 0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 52; h[0]++)
      for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
        for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
          for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
            for (h[4] = h[3] + 1; h[4] < 52; h[4]++)
              for (h[5] = h[4] + 1; h[5] < 52; h[5]++)
                for (h[6] = h[5] + 1; h[6] < 52; h[6]++) counts[categoryOf(scoreHand(h))]++;
    expect(counts).toEqual([23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584]);
  }, 3_600_000);
});
