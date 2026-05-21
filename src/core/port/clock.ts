// Clock port — テスト時に注入可能な now()。 Phase E 以降で schedule-tick が
// next fire 計算に使う。 production は () => Date.now()。
export interface Clock {
  now(): number;  // epoch ms
}
