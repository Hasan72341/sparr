import type { Difficulty, Question, Track, TrackId } from "../shared/types.js";

export const tracks: Track[] = [
  {
    id: "swe",
    name: "Software engineering",
    shortName: "SWE",
    description: "Algorithms, data structures, debugging, and system design.",
    topics: ["DSA", "Competitive programming", "Systems", "Project defense"],
  },
  {
    id: "quant-research",
    name: "Quant research",
    shortName: "Quant research",
    description: "Probability, statistical reasoning, and robust experiments.",
    topics: ["Probability", "Statistics", "Backtesting", "Research"],
  },
  {
    id: "quant-trading",
    name: "Quant trading",
    shortName: "Quant trading",
    description:
      "Expected value, market making, and decisions under uncertainty.",
    topics: ["Mental math", "Expected value", "Market making", "Risk"],
  },
  {
    id: "quant-dev",
    name: "Quant development",
    shortName: "Quant dev",
    description: "Build correct, efficient systems for market data.",
    topics: ["Order books", "Algorithms", "Concurrency", "Performance"],
  },
  {
    id: "finance",
    name: "Corporate finance",
    shortName: "Finance",
    description:
      "Connect statements, defend valuations, and stress-test assumptions.",
    topics: ["Accounting", "Valuation", "Cash flow", "Sensitivity"],
  },
  {
    id: "markets",
    name: "Markets & investing",
    shortName: "Markets",
    description:
      "Investment theses, portfolio risk, and financial instruments.",
    topics: ["Bonds", "Portfolios", "Investment research", "Scenarios"],
  },
  {
    id: "ml",
    name: "ML & data science",
    shortName: "ML / AI",
    description: "Model evaluation, experiment design, and ML systems.",
    topics: ["Statistics", "Evaluation", "ML systems", "Research"],
  },
];
export interface Problem extends Question {
  solution?: number;
  tolerance?: number;
  hints: string[];
  followups: string[];
  rubric: string[];
  tests?: { input: unknown; output: unknown; name: string; public?: boolean }[];
  reference?: Record<"python" | "javascript", string>;
}
const starterCode = {
  python:
    "def solve(data):\n    # Return your result. Input is already parsed from JSON.\n    pass\n",
  javascript:
    "function solve(data) {\n  // Return your result. Input is already parsed from JSON.\n}\n",
};
function numeric(
  id: string,
  track: TrackId,
  title: string,
  prompt: string,
  solution: number,
  difficulty: Difficulty,
  tags: string[],
  hints: string[],
  followups: string[],
  rubric: string[],
  tolerance = 0.0001,
): Problem {
  return {
    id,
    track,
    title,
    prompt,
    solution,
    difficulty,
    tags,
    hints,
    followups,
    rubric,
    tolerance,
    kind: "numeric",
  };
}
function discussion(
  id: string,
  track: TrackId,
  title: string,
  prompt: string,
  difficulty: Difficulty,
  tags: string[],
  hints: string[],
  followups: string[],
  rubric: string[],
): Problem {
  return {
    id,
    track,
    title,
    prompt,
    difficulty,
    tags,
    hints,
    followups,
    rubric,
    kind: "discussion",
  };
}
function coding(
  id: string,
  track: TrackId,
  title: string,
  prompt: string,
  difficulty: Difficulty,
  tags: string[],
  tests: NonNullable<Problem["tests"]>,
  hints: string[],
  followups: string[],
  reference: NonNullable<Problem["reference"]>,
): Problem {
  return {
    id,
    track,
    title,
    prompt,
    difficulty,
    tags,
    tests,
    hints,
    followups,
    reference,
    kind: "coding",
    starterCode,
    examples: tests
      .filter((t) => t.public)
      .map((t) => ({ input: t.input, output: t.output })),
    rubric: [
      "Correctness on supplied cases",
      "Complexity and assumptions",
      "Explanation of the maintained invariant",
    ],
  };
}
export const problems: Problem[] = [
  coding(
    "two-sum",
    "swe",
    "Find the pair",
    "Implement solve(data). data is {nums: number[], target: number}. Return the two distinct indices whose values sum to target, in ascending order. Exactly one pair exists when there is a solution; return [] otherwise. Aim for O(n) expected time. Constraints: 0–100,000 integers, each with absolute value at most 10^9. Explain how your approach handles duplicates.",
    "foundation",
    ["Hash maps", "Complexity"],
    [
      {
        input: { nums: [2, 7, 11, 15], target: 9 },
        output: [0, 1],
        name: "Basic pair",
        public: true,
      },
      {
        input: { nums: [3, 3], target: 6 },
        output: [0, 1],
        name: "Repeated values",
        public: true,
      },
      {
        input: { nums: [-2, 4, 8, 0], target: 6 },
        output: [0, 2],
        name: "Hidden case 1",
      },
      { input: { nums: [1], target: 2 }, output: [], name: "Hidden case 2" },
      { input: { nums: [], target: 0 }, output: [], name: "Hidden case 3" },
      {
        input: { nums: [1, 2, 3], target: 8 },
        output: [],
        name: "Hidden case 4",
      },
    ],
    [
      "For each number, what complementary value would complete the target?",
      "Store values you have already visited with their indices.",
    ],
    [
      "What invariant prevents reusing the same element?",
      "How would you support many target queries on the same array?",
    ],
    {
      python:
        'def solve(data):\n    seen = {}\n    for i, x in enumerate(data["nums"]):\n        if data["target"] - x in seen:\n            return [seen[data["target"] - x], i]\n        seen[x] = i\n    return []',
      javascript:
        "function solve(data){ const seen = new Map(); for(let i=0;i<data.nums.length;i++){const x=data.nums[i]; if(seen.has(data.target-x)) return [seen.get(data.target-x),i]; seen.set(x,i);} return []; }",
    },
  ),
  coding(
    "merge-intervals",
    "swe",
    "Merge overlapping intervals",
    "Implement solve(data), where data is an array of [start, end] intervals with start <= end. Return sorted, merged intervals. Touching endpoints count as overlap. Empty input returns []. Give the complexity and explain why your merge is safe.",
    "intermediate",
    ["Sorting", "Invariants"],
    [
      {
        input: [
          [1, 3],
          [2, 6],
          [8, 10],
        ],
        output: [
          [1, 6],
          [8, 10],
        ],
        name: "Overlaps",
        public: true,
      },
      {
        input: [
          [4, 5],
          [1, 4],
        ],
        output: [[1, 5]],
        name: "Touching",
        public: true,
      },
      { input: [], output: [], name: "Hidden case 1" },
      {
        input: [
          [1, 10],
          [2, 3],
          [5, 7],
        ],
        output: [[1, 10]],
        name: "Hidden case 2",
      },
      {
        input: [
          [1, 1],
          [1, 1],
        ],
        output: [[1, 1]],
        name: "Hidden case 3",
      },
    ],
    [
      "Sort intervals by start first.",
      "Compare the next start with the end of the most recent merged interval.",
    ],
    [
      "Why is sorting sufficient to avoid revisiting earlier intervals?",
      "How would you handle an online stream of unsorted intervals?",
    ],
    {
      python:
        "def solve(data):\n    out=[]\n    for a,b in sorted(data):\n        if out and a <= out[-1][1]: out[-1][1]=max(out[-1][1],b)\n        else: out.append([a,b])\n    return out",
      javascript:
        "function solve(data){const out=[]; for(const [a,b] of data.sort((x,y)=>x[0]-y[0])){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;}",
    },
  ),
  coding(
    "sliding-window",
    "swe",
    "Sliding-window maximum",
    "Implement solve(data) for {nums: number[], k: number}. Return the maximum of every consecutive window of k values. 1 <= k <= nums.length. Aim for O(n) time; describe which indices your data structure retains.",
    "advanced",
    ["Deque", "Competitive programming"],
    [
      {
        input: { nums: [1, 3, -1, -3, 5, 3, 6, 7], k: 3 },
        output: [3, 3, 5, 5, 6, 7],
        name: "Mixed values",
        public: true,
      },
      {
        input: { nums: [4, 4, 4], k: 2 },
        output: [4, 4],
        name: "Hidden case 1",
      },
      {
        input: { nums: [-4, -2, -9], k: 1 },
        output: [-4, -2, -9],
        name: "Hidden case 2",
      },
      { input: { nums: [9, 7, 5], k: 3 }, output: [9], name: "Hidden case 3" },
    ],
    [
      "Which smaller values can never become a future maximum?",
      "Keep candidate indices in decreasing value order and remove expired indices.",
    ],
    [
      "Why is each index removed at most once?",
      "What changes when the window size varies?",
    ],
    {
      python:
        'from collections import deque\ndef solve(data):\n    q=deque(); out=[]; a=data["nums"]; k=data["k"]\n    for i,x in enumerate(a):\n        while q and q[0]<=i-k: q.popleft()\n        while q and a[q[-1]]<=x: q.pop()\n        q.append(i)\n        if i>=k-1: out.append(a[q[0]])\n    return out',
      javascript:
        "function solve({nums:a,k}){let q=[],h=0,out=[];for(let i=0;i<a.length;i++){while(h<q.length&&q[h]<=i-k)h++;while(q.length>h&&a[q.at(-1)]<=a[i])q.pop();q.push(i);if(i>=k-1)out.push(a[q[h]]);}return out;}",
    },
  ),
  discussion(
    "cache-design",
    "swe",
    "Design a cache boundary",
    "A service caches product prices for five minutes. A customer sees a different price at checkout. Explain what you would measure, which consistency guarantee you would choose, and how writes invalidate the cache.",
    "advanced",
    ["System design", "Caching"],
    ["Distinguish stale display data from the authoritative checkout price."],
    ["How would your design behave if invalidation messages were lost?"],
    ["Consistency guarantee", "Failure recovery", "Tradeoffs"],
  ),
  numeric(
    "conditional-dice",
    "quant-research",
    "Condition on what you know",
    "A fair six-sided die is rolled. You are told the result is even. What is the probability it is 6? Give a fraction or decimal, then explain the conditional sample space.",
    1 / 3,
    "foundation",
    ["Conditional probability"],
    [
      "List only the outcomes consistent with the information given.",
      "The remaining outcomes are equally likely.",
    ],
    [
      "What changes if the information is that the result is greater than 3?",
      "How would unequal face probabilities change your method?",
    ],
    ["Conditional sample space", "Equal-likelihood assumption"],
  ),
  numeric(
    "bayes-test",
    "quant-research",
    "A positive test",
    "A condition has prevalence 1%. A test has 90% sensitivity and a 5% false-positive rate. Given a positive result, what is the probability the condition is present? Give a decimal or percentage and show your reasoning.",
    0.009 / 0.0585,
    "intermediate",
    ["Bayes", "Base rates"],
    ["Imagine a population of 10,000 and count true and false positives."],
    ["What happens to the result if prevalence doubles?"],
    ["Base rate", "Conditional denominator"],
  ),
  numeric(
    "coin-wait",
    "quant-research",
    "Waiting for two heads",
    "For independent fair coin flips, what is the expected number of flips until two consecutive heads first appear? Define states and derive the answer.",
    6,
    "advanced",
    ["Markov states", "Expectation"],
    ["Use separate expectations for no current head and one trailing head."],
    ["How does your recurrence change for a biased coin?"],
    ["State definition", "Recurrence", "Boundary conditions"],
  ),
  discussion(
    "backtest-leakage",
    "quant-research",
    "A suspicious backtest",
    "A researcher selects the best 20 stocks using the entire ten-year dataset, then reports performance from trading those stocks during those same ten years. Identify the failure modes and design an evaluation you would trust.",
    "intermediate",
    ["Research", "Leakage"],
    [
      "Ask which information would have existed on each historical trading date.",
    ],
    [
      "How would you account for trying many strategies before selecting this one?",
    ],
    ["Look-ahead bias", "Selection bias", "Out-of-sample evaluation"],
  ),
  numeric(
    "trading-ev",
    "quant-trading",
    "Price a simple bet",
    "A ticket pays 100 with probability 0.3 and 0 otherwise. For a risk-neutral buyer with no fees, what is its fair price? Explain which assumptions make that price appropriate.",
    30,
    "foundation",
    ["Expected value"],
    ["Weight each payoff by its probability."],
    ["What changes with a 2-unit transaction fee?"],
    ["Expected payoff", "Risk neutrality"],
  ),
  numeric(
    "market-mid",
    "quant-trading",
    "Trade through the spread",
    "A market is quoted 99 bid / 101 ask. You buy 10 units at the ask and immediately sell them at the unchanged bid. What is your total profit or loss, excluding other fees?",
    -20,
    "intermediate",
    ["Spread", "Execution"],
    ["A buyer pays the ask; a seller receives the bid."],
    ["What information would justify crossing the spread?"],
    ["Execution prices", "Position size"],
  ),
  numeric(
    "kelly",
    "quant-trading",
    "Size a favorable bet",
    "An independent repeatable bet wins with probability 0.6. A win earns an amount equal to your stake; a loss loses the stake. What fraction of wealth maximizes expected logarithmic growth? Derive it and discuss estimation risk.",
    0.2,
    "advanced",
    ["Sizing", "Optimization"],
    ["Write 0.6 log(1+f) + 0.4 log(1-f), then differentiate."],
    ["Why might a trader deliberately use a smaller fraction?"],
    ["Objective function", "Sizing", "Estimation uncertainty"],
  ),
  discussion(
    "inventory",
    "quant-trading",
    "Manage inventory",
    "You are making a two-sided market and have accumulated a large long position while volatility increases. Explain how you would adjust quotes, sizing, and risk limits. State what information you need.",
    "intermediate",
    ["Market making", "Risk"],
    [
      "Consider both execution probability and the cost of additional inventory.",
    ],
    ["What would distinguish informed order flow from a temporary imbalance?"],
    ["Inventory exposure", "Adverse selection", "Risk limits"],
  ),
  coding(
    "vwap",
    "quant-dev",
    "Compute execution VWAP",
    "Implement solve(data), where data is an array of {price, quantity} trades. Return sum(price * quantity) / sum(quantity). Quantities are nonnegative. Return null when total quantity is zero. Explain numerical and overflow considerations.",
    "foundation",
    ["Market data", "Numerics"],
    [
      {
        input: [
          { price: 100, quantity: 2 },
          { price: 103, quantity: 1 },
        ],
        output: 101,
        name: "Weighted average",
        public: true,
      },
      { input: [], output: null, name: "Hidden case 1" },
      {
        input: [{ price: 10, quantity: 0 }],
        output: null,
        name: "Hidden case 2",
      },
      {
        input: [
          { price: 12, quantity: 5 },
          { price: 8, quantity: 5 },
        ],
        output: 10,
        name: "Hidden case 3",
      },
    ],
    ["Accumulate notional and quantity separately."],
    ["How would you update this incrementally across a stream?"],
    {
      python:
        'def solve(data):\n    q=sum(t["quantity"] for t in data)\n    return sum(t["price"]*t["quantity"] for t in data)/q if q else None',
      javascript:
        "function solve(data){const q=data.reduce((s,t)=>s+t.quantity,0);return q?data.reduce((s,t)=>s+t.price*t.quantity,0)/q:null;}",
    },
  ),
  discussion(
    "order-book",
    "quant-dev",
    "Maintain an order book",
    "Design an in-memory order book supporting add, cancel by order ID, and best bid/ask. Explain the data structures, invariants, and treatment of an out-of-order market-data update.",
    "intermediate",
    ["Order books", "Data structures"],
    ["Separate locating an individual order from ordering price levels."],
    ["How would you recover after a sequence-number gap?"],
    ["Lookup complexity", "Ordering", "Gap recovery"],
  ),
  discussion(
    "latency",
    "quant-dev",
    "Diagnose a latency tail",
    "Median processing latency is 50 microseconds but p99 is 8 milliseconds. Design an investigation and a benchmark that can distinguish allocation pauses, contention, and operating-system scheduling.",
    "advanced",
    ["Performance", "Concurrency"],
    [
      "Measure distributions under representative load; averages hide rare stalls.",
    ],
    ["How could your measurement code distort the result?"],
    ["Measurement", "Hypothesis isolation", "Tail latency"],
  ),
  numeric(
    "working-capital",
    "finance",
    "Cash tied up in operations",
    "Inventory increases by 20 and accounts receivable increases by 10. Accounts payable increases by 5. All amounts are in millions. What is the change in operating working capital, and the resulting cash-flow effect? Enter the working-capital increase as your numeric answer.",
    25,
    "foundation",
    ["Accounting", "Working capital"],
    [
      "Operating working capital here is inventory plus receivables minus payables.",
    ],
    ["Why can a profitable growing business still run out of cash?"],
    ["Working-capital signs", "Cash-flow direction"],
  ),
  numeric(
    "perpetuity",
    "finance",
    "Value a stable cash flow",
    "A business is expected to generate free cash flow of 10 million next year, growing at 2% forever. The discount rate is 10%. What is enterprise value in millions? Explain when this model becomes unreliable.",
    125,
    "intermediate",
    ["DCF", "Valuation"],
    ["Use next-year cash flow divided by the discount rate minus growth."],
    [
      "How sensitive is the valuation to a one-percentage-point change in discount rate?",
    ],
    ["Timing", "Discount-growth relationship", "Assumptions"],
  ),
  numeric(
    "depreciation",
    "finance",
    "Link the three statements",
    "Depreciation expense increases by 10 million. The tax rate is 30%, taxes are paid currently, and nothing else changes. By how much does operating cash flow change, in millions? Explain the income-statement and cash-flow bridge.",
    3,
    "advanced",
    ["Three statements", "Tax shield"],
    ["Net income falls, but depreciation is added back as a noncash expense."],
    [
      "What if the company has no taxable income and cannot use the tax benefit currently?",
    ],
    ["Noncash expense", "Tax effect", "Statement linkage"],
  ),
  discussion(
    "valuation-gap",
    "finance",
    "Explain a valuation gap",
    "Two companies have equal current EBITDA but very different enterprise-value multiples. Build an explanation using growth, reinvestment, risk, and accounting quality. What evidence would you collect?",
    "intermediate",
    ["Valuation", "Commercial reasoning"],
    ["Equal accounting earnings need not imply equal future free cash flow."],
    ["How could capital intensity change the comparison?"],
    ["Cash conversion", "Growth", "Risk"],
  ),
  numeric(
    "bond-discount",
    "markets",
    "Price a zero-coupon bond",
    "A default-free zero-coupon bond pays 110 in one year. The annual effective yield is 10%. What is its price today? State the discounting convention.",
    100,
    "foundation",
    ["Fixed income"],
    ["Discount the future payment by one year."],
    ["What happens to the price when the required yield rises?"],
    ["Discounting", "Yield-price relationship"],
  ),
  numeric(
    "portfolio-return",
    "markets",
    "Weight the returns",
    "A portfolio starts with 60% in asset A and 40% in asset B. Over one period A returns 10% and B returns -5%. With no rebalancing or cash flows during the period, what is the portfolio return? Give a percentage or decimal.",
    0.04,
    "intermediate",
    ["Portfolios"],
    ["Weight returns using beginning-of-period allocations."],
    ["What are the weights at the end of the period?"],
    ["Weighting", "Rebalancing assumption"],
  ),
  discussion(
    "investment-thesis",
    "markets",
    "Defend an investment thesis",
    "Choose an industry you understand. Propose a hypothetical investment thesis, identify what the market may already price in, and state two observable developments that would falsify your thesis. Do not rely on live prices.",
    "advanced",
    ["Research", "Uncertainty"],
    [
      "Separate a good business from an attractive investment at a given price.",
    ],
    ["Which downside scenario would change your position size?"],
    ["Variant view", "Falsifiability", "Risk"],
  ),
  numeric(
    "precision",
    "ml",
    "Measure precision",
    "A classifier produces 80 true positives, 20 false positives, and 40 false negatives. What is precision? Give a decimal or percentage, and distinguish it from recall.",
    0.8,
    "foundation",
    ["Evaluation"],
    ["Precision conditions on predicted positives."],
    ["Which metric matters more when false positives are expensive?"],
    ["Denominator", "Precision versus recall"],
  ),
  numeric(
    "base-rate-accuracy",
    "ml",
    "The accuracy trap",
    "A dataset contains 990 negative and 10 positive examples. A model predicts negative for every example. What is its accuracy? Give a decimal or percentage, then explain why this result can be misleading.",
    0.99,
    "intermediate",
    ["Imbalance", "Metrics"],
    ["Count correct predictions, then divide by the total."],
    ["What is the model’s recall for the positive class?"],
    ["Class imbalance", "Decision cost"],
  ),
  discussion(
    "feature-leakage",
    "ml",
    "Find the leaked feature",
    "A loan-default model uses account status recorded six months after the loan was issued. Offline AUC is excellent. Explain the issue and propose a deployment-realistic evaluation pipeline.",
    "intermediate",
    ["Leakage", "Data pipelines"],
    ["Ask whether each feature existed at the prediction timestamp."],
    ["How would a random split obscure the problem further?"],
    ["Temporal availability", "Validation design", "Pipeline consistency"],
  ),
  discussion(
    "model-drift",
    "ml",
    "Investigate a model in production",
    "A ranking model’s offline metric remains stable but user engagement declines. Design an investigation separating data drift, feedback loops, logging changes, and causal effects.",
    "advanced",
    ["ML systems", "Experimentation"],
    [
      "Check whether the offline evaluation population still matches production exposure.",
    ],
    ["How would you design a safe experiment to isolate the model’s effect?"],
    ["Measurement validity", "Distribution change", "Experiment design"],
  ),
];
export function publicQuestion(p: Problem): Question {
  const {
    solution,
    tolerance,
    hints,
    followups,
    rubric,
    tests,
    reference,
    ...question
  } = p;
  return question;
}
export function getProblem(id: string): Problem {
  const p = problems.find((q) => q.id === id);
  if (!p) throw new Error("Unknown question");
  return p;
}
export function chooseProblems(
  track: TrackId,
  difficulty: Difficulty,
  previousIds: string[] = [],
): string[] {
  const rank: Record<Difficulty, number> = {
    foundation: 0,
    intermediate: 1,
    advanced: 2,
  };
  return problems
    .filter((p) => p.track === track)
    .sort(
      (a, b) =>
        Number(previousIds.includes(a.id)) -
          Number(previousIds.includes(b.id)) ||
        Math.abs(rank[a.difficulty] - rank[difficulty]) -
          Math.abs(rank[b.difficulty] - rank[difficulty]),
    )
    .map((p) => p.id);
}
