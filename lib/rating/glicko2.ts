// lib/rating/glicko2.ts
export type GlickoRating = { rating: number; rd: number; vol: number };
type Opp = { rating: number; rd: number; outcome: 1 | 0 | 0.5 };

const Q = Math.log(10) / 400;
const TAU = 0.5; // volatility constraint (0.3..1.2 common). Tune as needed.

function g(rd: number) {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

function E(myR: number, oppR: number, oppRD: number) {
  return 1 / (1 + Math.pow(10, (-g(oppRD) * (myR - oppR)) / 400));
}

export function glicko2Update(cur: GlickoRating, opps: Opp[]): GlickoRating {
  if (!opps.length) return cur;

  const { rating: r, rd: RD, vol: sigma } = cur;

  const v_inv = opps.reduce((acc, o) => {
    const gRD = g(o.rd);
    const e = 1 / (1 + Math.pow(10, (-gRD * (r - o.rating)) / 400));
    return acc + (Q * Q) * (gRD * gRD) * e * (1 - e);
  }, 0);
  const v = 1 / v_inv;

  const delta = v * opps.reduce((acc, o) => {
    const gRD = g(o.rd);
    const e = E(r, o.rating, o.rd);
    return acc + Q * gRD * (o.outcome - e);
  }, 0);

  // volatility iteration (per Glicko-2 paper, section 3)
  const a = Math.log(sigma * sigma);
  let A = a;
  const eps = 0.000001;
  // f(x) helper
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - RD * RD - v - ex);
    const den = 2 * Math.pow(RD * RD + v + ex, 2);
    return (num / den) - ((x - a) / (TAU * TAU));
  };

  // set initial bounds
  let B: number;
  if (delta * delta > RD * RD + v) {
    B = Math.log(delta * delta - RD * RD - v);
  } else {
    let k = 1;
    while (f(a - k * Math.sqrt(TAU * TAU)) < 0) k++;
    B = a - k * Math.sqrt(TAU * TAU);
  }

  // solve for A with Illinois/Regula Falsi like in the paper
  let fA = f(A), fB = f(B);
  while (Math.abs(B - A) > eps) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) { A = B; fA = fB; }
    else { fA = fA / 2; }
    B = C; fB = fC;
  }

  const aPrime = A;
  const sigmaPrime = Math.exp(aPrime / 2);

  const RDStar = Math.sqrt(RD * RD + sigmaPrime * sigmaPrime);
  const RDPrime = 1 / Math.sqrt((1 / (RDStar * RDStar)) + (1 / v));
  const rPrime = r + (Q / (1 / (RDPrime * RDPrime))) * opps.reduce((acc, o) => {
    const e = E(r, o.rating, o.rd);
    return acc + g(o.rd) * (o.outcome - e);
  }, 0);

  return {
    rating: rPrime,
    rd: RDPrime,
    vol: sigmaPrime,
  };
}

// Build pairwise outcomes from final% (strict > wins, == draw)
export function pairwiseFromScores(byUid: Map<string, number>) {
  const entries = Array.from(byUid.entries()); // [uid, score]
  // a compact shape that's easy to consume
  const out: Array<{ uid: string; opponents: Array<{ opp: string; score: number; opp_score: number; outcome: 1|0|0.5 }> }> = [];
  const idx: Record<string, number> = {};
  entries.forEach(([u], i) => { idx[u] = i; out.push({ uid: u, opponents: [] }); });
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ui, si] = entries[i], [uj, sj] = entries[j];
      const outcomeI = si > sj ? 1 : si < sj ? 0 : 0.5;
      const outcomeJ = 1 - outcomeI as 1|0|0.5; // 1 vs 0 or 0.5
      out[idx[ui]].opponents.push({ opp: uj, score: si, opp_score: sj, outcome: outcomeI });
      out[idx[uj]].opponents.push({ opp: ui, score: sj, opp_score: si, outcome: outcomeJ });
    }
  }
  return out;
}
