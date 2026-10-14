# Resource Allocation Graph Deadlock Simulator

Build resource-allocation graphs, explore deadlock detection algorithms, and compare local and distributed detection methods in the browser.

Live site: <https://ishac-x.github.io/rag-deadlock-simulator/>

## Features

- Single-system resource allocation graphs with process/resource nodes, request and assignment edges, Grant Request, deletion, and resource instance controls.
- **Auto** preserves the original detection behaviour. **DFS** (Algorithm 1) detects a directed cycle and reports visited nodes and examined edges. A cycle in a multi-instance graph is inconclusive by itself. **Reduction** (Algorithm 2) scans processes in creation order until no more can finish. **Ranked** (Algorithm 3) ranks processes once by outstanding requests, then greedily reduces unfinished processes.
- Compare All reports verdict, average runtime over 200 runs, checks, passes, reductions, and remaining processes for DFS, Reduction, and Ranked. Timing is shown to four decimal places. On multi-instance cycles, DFS deliberately reports an inconclusive cycle result; it cannot agree with the reduction algorithms on a safe cycle without doing additional safety analysis.
- Built-in example graphs and a validated random graph generator (1–200 processes and 1–100 resources).
- **Distributed (DOS)** mode places processes in 3–5 site lanes and supports local checks, centralised detection, and Chandy–Misra–Haas edge chasing with probe counts and animated probe logs.
- Step-by-step playback, speed control, activity log, and PDF export are available in both modes. PDF exports include the selected single-system algorithm, comparison data, and DOS results when present.

## Development

Requires Node.js 20.19+ (22 LTS recommended).

```sh
npm install
npm run dev
```

## Test, lint, and build

```sh
npm test
npm run lint
npm run build
```

GitHub Pages deployment is handled by the workflow in `.github/workflows/deploy.yml`; pushes to `main` build and deploy the static site.

## Built with

TanStack Start, React, TypeScript, Tailwind CSS
