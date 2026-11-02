/** Structural distance only; AIBot separately checks Ji'an eligibility and live waits. */
import { Tile } from '../core/Tile';
import { Suit } from '../core/Types';
const suits = [Suit.Wan, Suit.Tong, Suit.Tiao, Suit.Feng, Suit.Yuan];
const offsets = [0, 9, 18, 27, 31];
const cache = new Map<string, number>();
export function handDistance(hand: Tile[], fixed: number, allowQi: boolean): number {
    const c = Array<number>(34).fill(0);
    for (const t of hand) c[offsets[suits.indexOf(t.suit)] + t.rank - 1]++;
    const key = fixed + ':' + Number(allowQi) + ':' + c.join('');
    const cached = cache.get(key); if (cached !== undefined) return cached;
    let best = 8, pairs = 0, distinct = 0;
    for (const n of c) { if (n >= 2) pairs++; if (n) distinct++; }
    if (allowQi && !fixed) best = Math.min(best, 6 - pairs + Math.max(0, 7 - distinct));
    const visited = new Set<string>();
    const search = (start: number, melds: number, blocks: number, head: number): void => {
        if (melds + fixed > 4) return;
        while (start < 34 && !c[start]) start++;
        if (start === 34) { best = Math.min(best, 8 - 2 * (melds + fixed) - Math.min(blocks, 4 - melds - fixed) - head); return; }
        const state = c.join('') + ':' + melds + blocks + head;
        if (visited.has(state)) return; visited.add(state);
        if (c[start] >= 3) { c[start] -= 3; search(start, melds + 1, blocks, head); c[start] += 3; }
        if (start < 27 && start % 9 <= 6 && c[start + 1] && c[start + 2]) {
            c[start]--; c[start + 1]--; c[start + 2]--; search(start, melds + 1, blocks, head);
            c[start]++; c[start + 1]++; c[start + 2]++;
        }
        if (c[start] >= 2) {
            c[start] -= 2; if (!head) search(start, melds, blocks, 1);
            if (blocks < 4) search(start, melds, blocks + 1, head); c[start] += 2;
        }
        if (start < 27 && blocks < 4) for (const gap of [1, 2]) {
            if (start % 9 + gap >= 9 || !c[start + gap]) continue;
            c[start]--; c[start + gap]--; search(start, melds, blocks + 1, head); c[start]++; c[start + gap]++;
        }
        c[start]--; search(start, melds, blocks, head); c[start]++;
    };
    search(0, 0, 0, 0); if (cache.size > 20000) cache.clear(); cache.set(key, best); return best;
}
