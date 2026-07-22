// "Your simulation run, read back", a computational scientist drops a CFD run, the solver
// log, and the method paper; Mavéa reads the convergence, the discretized operator, the domain,
// and spotlights the exact equation in the source paper. A profession demo for STEM/research,
// built to exercise the new math/science primitives (plot · matrix · diagram · docview).
import type { ConversationSpec } from '../conversation';

export const compsci: ConversationSpec = {
  id: 'compsci',
  workspace: 'Simulation run · 044',
  title: 'Your simulation run, read back',
  sub: 'The solver log, the operator, the domain, and the paper behind the scheme.',
  opener: 'It converged cleanly, and the lift matches the wind-tunnel number. Here it is.',
  switchSay: "Let's read your run.",
  gather: 'Reading the run output, the solver log, and the method paper',
  found: 'It converged, and the result checks out against the reference.',
  tint: '#3ca6a6',
  context: [
    { name: 'run_044.h5 · 2.4M cells', color: 'var(--presence-soft)' },
    { name: 'cluster.log', color: 'var(--insight)' },
    { name: 'Hoffmann et al. (method).pdf', color: 'var(--text-muted)' },
  ],
  blocks: [
    {
      type: 'insight',
      col: 4,
      id: 'converged',
      num: '1',
      delay: 0,
      props: {
        title: 'Converged in 1,840 iterations',
        stat: '1,840',
        delta: '−12% vs run 043',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Residual fell below the 5×10⁻⁵ tolerance, no stalls, monotonic after iter ~300.',
        sources: [{ file: 'cluster.log' }],
      },
    },
    {
      type: 'insight',
      col: 4,
      id: 'result',
      num: '2',
      delay: 90,
      props: {
        title: 'Lift coefficient settled at 0.482',
        stat: '0.482',
        delta: 'within 0.3%',
        deltaDir: 'good',
        conf: 'strong',
        summary: 'Matches the wind-tunnel reference (0.484) to within measurement error.',
        sources: [{ file: 'run_044.h5', loc: 'C_L' }],
      },
    },
    {
      type: 'kpi',
      col: 4,
      delay: 180,
      props: {
        title: 'Run at a glance',
        icon: 'spark',
        iconColor: 'var(--presence)',
        kpis: [
          { val: '2.4M', label: 'cells' },
          { val: '3h 12m', label: 'wall-time' },
          { val: '64', label: 'cores' },
          { val: '7.8×', label: 'speedup', color: 'var(--insight)' },
        ],
        footer: 'Strong scaling held to 64 cores; past that, halo exchange dominates.',
      },
    },
    {
      type: 'plot',
      col: 8,
      delay: 260,
      props: {
        title: 'Residual convergence',
        icon: 'chart',
        iconColor: 'var(--presence)',
        xLabel: 'iteration',
        yLabel: 'residual (×10⁻³)',
        xDomain: [0, 1900],
        yDomain: [0, 10],
        origin: true,
        curves: [
          {
            label: 'continuity residual',
            color: 'var(--presence)',
            points: [
              { x: 0, y: 9.5 },
              { x: 200, y: 5.0 },
              { x: 400, y: 2.6 },
              { x: 600, y: 1.4 },
              { x: 800, y: 0.8 },
              { x: 1000, y: 0.45 },
              { x: 1200, y: 0.25 },
              { x: 1400, y: 0.14 },
              { x: 1600, y: 0.08 },
              { x: 1840, y: 0.05 },
            ],
          },
        ],
        markers: [{ x: 1840, y: 0.05, label: 'tol 5e-5', color: 'var(--insight)' }],
        footer:
          'Clean exponential decay after the first ~300 iterations, the scheme is stable here.',
      },
    },
    {
      type: 'matrix',
      col: 4,
      delay: 320,
      props: {
        title: 'The discretized operator',
        icon: 'table',
        iconColor: 'var(--presence)',
        caption: 'A, 5-point Laplacian stencil (4×4 of a 2.4M² sparse system)',
        bracket: true,
        rows: [
          { cells: [{ v: 4, hot: true }, { v: -1 }, { v: 0 }, { v: -1 }] },
          { cells: [{ v: -1 }, { v: 4, hot: true }, { v: -1 }, { v: 0 }] },
          { cells: [{ v: 0 }, { v: -1 }, { v: 4, hot: true }, { v: -1 }] },
          { cells: [{ v: -1 }, { v: 0 }, { v: -1 }, { v: 4, hot: true }] },
        ],
        footer:
          'Each row is one cell’s 5-point stencil; the solver inverts this banded, diagonally-dominant system.',
      },
    },
    {
      type: 'diagram',
      col: 8,
      delay: 380,
      props: {
        title: 'The domain & boundary conditions',
        icon: 'image',
        iconColor: 'var(--presence)',
        ratio: 2.1,
        shapes: [
          { kind: 'rect', x: 10, y: 8, w: 82, h: 32, color: 'var(--text-muted)' },
          {
            kind: 'circle',
            cx: 36,
            cy: 24,
            r: 6,
            color: 'var(--presence)',
            fill: 'var(--presence-soft)',
          },
          { kind: 'line', x1: 1, y1: 24, x2: 9, y2: 24, color: 'var(--insight)', arrow: true },
          { kind: 'line', x1: 92, y1: 24, x2: 99, y2: 24, color: 'var(--warning)', arrow: true },
        ],
        labels: [
          { x: 5, y: 24, text: 'inlet', side: 'bottom', color: 'var(--insight)' },
          { x: 95, y: 24, text: 'outlet', side: 'bottom', color: 'var(--warning)' },
          { x: 51, y: 8, text: 'no-slip wall', side: 'top', color: 'var(--text-muted)' },
          { x: 36, y: 24, text: 'obstacle', side: 'right', color: 'var(--presence)' },
        ],
        footer:
          'Uniform inflow left, pressure outlet right, no-slip on the walls and the obstacle.',
      },
    },
    {
      type: 'diagramflow',
      col: 8,
      delay: 410,
      props: {
        title: 'The solver loop',
        icon: 'layers',
        iconColor: 'var(--presence)',
        layout: 'cycle',
        nodes: [
          { id: 'init', label: 'Initialize field', kind: 'start' },
          { id: 'assemble', label: 'Assemble system', sub: 'discretize PDE' },
          { id: 'solve', label: 'Solve linear system', kind: 'accent' },
          { id: 'check', label: 'Residual < tol?', kind: 'muted' },
          { id: 'done', label: 'Converged', kind: 'good' },
        ],
        edges: [
          { from: 'init', to: 'assemble' },
          { from: 'assemble', to: 'solve' },
          { from: 'solve', to: 'check' },
          { from: 'check', to: 'assemble', label: 'no', kind: 'warn', dashed: true },
          { from: 'check', to: 'done', label: 'yes', kind: 'good' },
        ],
        footer:
          'Each iteration re-assembles and re-solves until the residual falls below tolerance.',
      },
    },
    {
      type: 'docview',
      col: 12,
      delay: 440,
      props: {
        title: 'The method paper, the scheme I used',
        icon: 'doc',
        iconColor: 'var(--presence)',
        source: 'Hoffmann et al. · uploaded · 22 pp',
        page: { n: 7, of: 22 },
        blocks: [
          { kind: 'h2', text: '§4.1, Pressure-velocity coupling' },
          {
            kind: 'p',
            text: 'We use a collocated finite-volume discretization with Rhie–Chow interpolation to suppress checkerboard pressure modes.',
          },
          {
            kind: 'p',
            text: 'Stability requires the under-relaxation factors to satisfy α_p + α_u ≤ 1 on stretched meshes.',
            spot: true,
          },
          {
            kind: 'eq',
            text: 'α_p = 0.3 ,   α_u = 0.7   ⇒   α_p + α_u = 1.0',
          },
          {
            kind: 'p',
            text: 'Outside this bound the continuity residual stalls rather than decays, the failure mode in run 043.',
          },
        ],
        note: 'This is the line your run 043 violated (you had α_u = 0.85). Run 044 sits exactly on the bound, which is why the residual finally <b>decays instead of stalling</b>.',
        footer:
          'I pulled the stability condition straight from the paper and tied it to why 043 stalled and 044 converged, no re-reading 22 pages.',
      },
    },
    {
      type: 'pdfreader',
      col: 12,
      delay: 520,
      props: {
        title: 'The reference, in full',
        icon: 'doc',
        iconColor: 'var(--text-muted)',
        source: 'NASA CR, A First Course in CFD · public domain',
        file: '/demo-assets/pdf/cfd-primer.pdf',
        footer:
          'The actual report, embedded, scroll the real PDF for the derivations behind the scheme.',
      },
    },
    {
      type: 'datastructure',
      col: 10,
      delay: 580,
      props: {
        title: 'Binary search tree — searching for 40',
        icon: 'share',
        iconColor: 'var(--presence)',
        kind: 'bst',
        nodes: [
          { id: 'a', value: 50, left: 'b', right: 'c' },
          { id: 'b', value: 30, left: 'd', right: 'e' },
          { id: 'c', value: 70, left: 'f', right: 'g' },
          { id: 'd', value: 20 },
          { id: 'e', value: 40 },
          { id: 'f', value: 60 },
          { id: 'g', value: 80 },
        ],
        highlight: 'e',
        footer:
          'Search visits <b>50 → 30 → 40</b>: 40 &lt; 50 go left, 40 &gt; 30 go right, match. Three comparisons in a balanced tree of seven nodes — O(log n).',
      },
    },
    {
      type: 'bigo',
      col: 8,
      delay: 640,
      props: {
        title: 'How algorithm cost grows with input',
        icon: 'chart',
        iconColor: 'var(--presence)',
        classes: ['o-1', 'o-logn', 'o-n', 'o-nlogn', 'o-n2', 'o-2n'],
        maxN: 16,
        highlight: 'o-nlogn',
        algorithm: { name: 'merge sort', complexity: 'o-nlogn' },
        xLabel: 'input size (n)',
        yLabel: 'operations',
        footer:
          'Binary search hugs the floor at O(log n), merge sort scales gracefully at O(n log n), but a brute-force O(2&#8319;) approach is already ~65,000 steps at n = 16 &mdash; it leaves the chart entirely.',
      },
    },
    {
      type: 'complexitysummary',
      col: 8,
      id: 'compsci-complexitysummary',
      delay: 660,
      props: {
        title: 'Same lookup, three approaches',
        icon: 'clock',
        iconColor: 'var(--presence)',
        approaches: [
          {
            name: 'Linear scan',
            timeComplexity: 'O(n)',
            spaceComplexity: 'O(1)',
            notes: 'No setup cost — fine for a one-off search over unsorted data.',
          },
          {
            name: 'Binary search',
            timeComplexity: 'O(log n)',
            spaceComplexity: 'O(1)',
            notes: 'Needs the array sorted first; free here since merge sort already sorted it.',
          },
          {
            name: 'Merge sort + binary search',
            timeComplexity: 'O(n log n)',
            spaceComplexity: 'O(n)',
            notes: 'Pays off once the same array is searched many times, not for a single query.',
          },
        ],
        footer:
          'For a single lookup, linear scan wins on simplicity; sort once and binary search pays for itself by the third query.',
      },
    },
    {
      type: 'confusionmatrix',
      col: 6,
      delay: 720,
      props: {
        title: 'Classifier results on the held-out test set',
        icon: 'table',
        iconColor: 'var(--presence)',
        classes: ['Setosa', 'Versicolor', 'Virginica'],
        // rows = actual class, columns = predicted class; diagonal = correct.
        // 150 samples, 143 correct = 95.3% accuracy.
        matrix: [
          [50, 0, 0],
          [0, 47, 3],
          [0, 4, 46],
        ],
        showTotals: true,
        readout: 'perclass',
        countLabel: 'samples',
        footer:
          'Setosa separates cleanly; the only confusion is between Versicolor and Virginica, where the petals overlap.',
      },
    },
    {
      type: 'protocolstack',
      col: 10,
      id: 'tcpip-stack',
      delay: 120,
      props: {
        title: 'The TCP/IP stack: how a request travels down',
        icon: 'layers',
        iconColor: 'var(--presence)',
        layers: [
          {
            name: 'Application',
            role: 'Your request lives here — the actual message a program speaks.',
            protocols: ['HTTP', 'DNS', 'TLS', 'SMTP'],
          },
          {
            name: 'Transport',
            role: 'Splits the message into segments and guarantees order & delivery.',
            protocols: ['TCP', 'UDP'],
          },
          {
            name: 'Internet',
            role: 'Wraps each segment in a packet and routes it across networks by IP address.',
            protocols: ['IP', 'ICMP'],
          },
          {
            name: 'Link',
            role: 'Frames the packet for the local wire and addresses the next hop by MAC.',
            protocols: ['Ethernet', 'Wi-Fi', 'ARP'],
          },
        ],
        packet: [
          { header: 'Ethernet', layer: 'Link' },
          { header: 'IP', layer: 'Internet' },
          { header: 'TCP', layer: 'Transport' },
          { header: 'HTTP', layer: 'Application' },
          { header: 'Your request', layer: 'Application' },
        ],
        caption:
          'Each layer adds its own header on the way down, then the receiver peels them off in reverse on the way back up.',
      },
    },
    {
      type: 'logicgates',
      col: 10,
      id: 'compsci-logicgates',
      delay: 140,
      props: {
        title: 'Half Adder',
        icon: 'share',
        iconColor: 'var(--presence)',
        inputs: [
          { id: 'A', label: 'A', value: 1 },
          { id: 'B', label: 'B', value: 0 },
        ],
        gates: [
          { id: 'sum', kind: 'XOR', inputs: ['A', 'B'] },
          { id: 'carry', kind: 'AND', inputs: ['A', 'B'] },
        ],
        output: { from: 'sum', label: 'Sum' },
        truth: [
          { row: [0, 0], out: 0 },
          { row: [0, 1], out: 1 },
          { row: [1, 0], out: 1 },
          { row: [1, 1], out: 0 },
        ],
        caption:
          'A half adder sums two bits: the XOR gate produces the sum, the AND gate produces the carry. With A=1, B=0 the sum line lights (1) and there is no carry.',
        footer:
          'The truth table row matching the live inputs is highlighted; flip A or B in your head and read the Sum column to see XOR in action.',
      },
    },
    {
      type: 'algorithmtrace',
      col: 10,
      id: 'compsci-algorithmtrace',
      delay: 180,
      props: {
        title: 'Bubble Sort — First Pass',
        icon: 'layers',
        iconColor: 'var(--presence)',
        values: [5, 1, 4, 2, 8, 3, 7],
        steps: [
          {
            caption: 'Start the pass: compare the first adjacent pair, 5 and 1.',
            compare: [0, 1],
            pointer: { i: 0, j: 1 },
          },
          {
            caption: '5 > 1, so swap them — the larger value bubbles right.',
            swapped: [0, 1],
            pointer: { i: 0, j: 1 },
          },
          {
            caption: 'Advance the window and compare 5 and 4.',
            compare: [1, 2],
            pointer: { i: 1, j: 2 },
          },
          { caption: '5 > 4, swap again.', swapped: [1, 2], pointer: { i: 1, j: 2 } },
          { caption: 'Compare 5 and 2.', compare: [2, 3], pointer: { i: 2, j: 3 } },
          { caption: '5 > 2, swap.', swapped: [2, 3], pointer: { i: 2, j: 3 } },
          {
            caption: 'Compare 5 and 8 — already in order, no swap.',
            compare: [3, 4],
            pointer: { i: 3, j: 4 },
          },
          {
            caption: 'The largest value, 8, settles into the last sorted slot.',
            highlight: [6],
            pointer: { i: 5, j: 6 },
          },
        ],
        caption:
          'Step through one full pass: each comparison either holds or swaps, walking the largest remaining value to the right end.',
        footer:
          'After this pass the maximum (8) is locked in its final position; bubble sort repeats over the shrinking unsorted prefix.',
      },
    },
    {
      type: 'sortingviz',
      col: 10,
      id: 'compsci-sortingviz',
      delay: 300,
      props: {
        title: 'Bubble Sort step-by-step',
        algorithm: 'Bubble Sort',
        complexity: 'o-n2',
        values: [5, 3, 8, 1, 6],
        steps: [
          { caption: 'Pass 1: compare 5 and 3.', values: [5, 3, 8, 1, 6], compared: [0, 1] },
          { caption: '5 > 3 → swap.', values: [3, 5, 8, 1, 6], swapped: [0, 1] },
          { caption: 'Compare 5 and 8. No swap.', values: [3, 5, 8, 1, 6], compared: [1, 2] },
          { caption: 'Compare 8 and 1.', values: [3, 5, 8, 1, 6], compared: [2, 3] },
          { caption: '8 > 1 → swap.', values: [3, 5, 1, 8, 6], swapped: [2, 3] },
          { caption: 'Compare 8 and 6.', values: [3, 5, 1, 8, 6], compared: [3, 4] },
          {
            caption: '8 > 6 → swap. 8 is sorted!',
            values: [3, 5, 1, 6, 8],
            swapped: [3, 4],
            sorted: [4],
          },
          {
            caption: 'Pass 2: 3 and 5. No swap.',
            values: [3, 5, 1, 6, 8],
            compared: [0, 1],
            sorted: [4],
          },
          { caption: 'Compare 5 and 1.', values: [3, 5, 1, 6, 8], compared: [1, 2], sorted: [4] },
          { caption: '5 > 1 → swap.', values: [3, 1, 5, 6, 8], swapped: [1, 2], sorted: [4] },
          {
            caption: '5 and 6 — no swap. 6 sorted.',
            values: [3, 1, 5, 6, 8],
            compared: [2, 3],
            sorted: [3, 4],
          },
          {
            caption: 'Pass 3: 3 and 1.',
            values: [3, 1, 5, 6, 8],
            compared: [0, 1],
            sorted: [3, 4],
          },
          {
            caption: '3 > 1 → swap. Done!',
            values: [1, 3, 5, 6, 8],
            swapped: [0, 1],
            sorted: [0, 1, 2, 3, 4],
          },
        ],
        footer:
          'Bubble sort: O(n²) time. Each pass bubbles the largest unsorted element to its final position. Simple to understand, rarely used in practice.',
      },
    },
    {
      type: 'graphtrace',
      col: 10,
      id: 'compsci-graphtrace',
      delay: 360,
      props: {
        title: 'BFS Graph Traversal',
        algorithm: 'bfs',
        nodes: [
          { id: 'A', label: 'A', x: 50, y: 10 },
          { id: 'B', label: 'B', x: 20, y: 40 },
          { id: 'C', label: 'C', x: 80, y: 40 },
          { id: 'D', label: 'D', x: 10, y: 75 },
          { id: 'E', label: 'E', x: 40, y: 75 },
          { id: 'F', label: 'F', x: 70, y: 75 },
        ],
        edges: [
          { from: 'A', to: 'B' },
          { from: 'A', to: 'C' },
          { from: 'B', to: 'D' },
          { from: 'B', to: 'E' },
          { from: 'C', to: 'F' },
        ],
        steps: [
          {
            caption: 'Start BFS at A. Add A to queue.',
            current: 'A',
            frontier: ['A'],
            visited: [],
          },
          {
            caption: 'Dequeue A. Enqueue neighbors B and C.',
            current: 'A',
            visited: ['A'],
            frontier: ['B', 'C'],
          },
          {
            caption: 'Dequeue B. Enqueue neighbors D and E.',
            current: 'B',
            visited: ['A', 'B'],
            frontier: ['C', 'D', 'E'],
          },
          {
            caption: 'Dequeue C. Enqueue neighbor F.',
            current: 'C',
            visited: ['A', 'B', 'C'],
            frontier: ['D', 'E', 'F'],
          },
          {
            caption: 'Dequeue D. No unvisited neighbors.',
            current: 'D',
            visited: ['A', 'B', 'C', 'D'],
            frontier: ['E', 'F'],
          },
          {
            caption: 'Dequeue E. No unvisited neighbors.',
            current: 'E',
            visited: ['A', 'B', 'C', 'D', 'E'],
            frontier: ['F'],
          },
          {
            caption: 'Dequeue F. Queue empty — BFS complete! Order: A B C D E F.',
            current: 'F',
            visited: ['A', 'B', 'C', 'D', 'E', 'F'],
            frontier: [],
          },
        ],
        footer:
          'BFS visits nodes level-by-level (breadth-first). Queue is FIFO. Time: O(V+E). Contrast with DFS which uses a stack and goes deep before wide.',
      },
    },
    {
      type: 'binarytree',
      col: 10,
      id: 'compsci-binarytree',
      delay: 420,
      props: {
        title: 'BST Search — find 7',
        nodes: [
          { id: 'n10', value: 10, left: 'n5', right: 'n15' },
          { id: 'n5', value: 5, left: 'n3', right: 'n7' },
          { id: 'n15', value: 15 },
          { id: 'n3', value: 3 },
          { id: 'n7', value: 7 },
        ],
        root: 'n10',
        steps: [
          { caption: 'Start at root: 10. Is 7 == 10?', states: { n10: 'visiting' } },
          { caption: '7 < 10 → go left to 5.', states: { n10: 'visited', n5: 'visiting' } },
          {
            caption: '7 > 5 → go right to 7.',
            states: { n10: 'visited', n5: 'visited', n7: 'visiting' },
          },
          {
            caption: '7 == 7 → Found! 3 comparisons.',
            states: { n10: 'visited', n5: 'visited', n7: 'found' },
          },
        ],
        footer:
          'BST search: O(h) time where h is tree height — O(log n) balanced, O(n) worst case. Each comparison halves the search space in a balanced BST.',
      },
    },
    {
      type: 'dptable',
      col: 10,
      id: 'compsci-dptable',
      delay: 480,
      props: {
        title: 'LCS — Longest Common Subsequence: "ABCB" vs "BCAB"',
        recurrence: 'dp[i][j] = dp[i-1][j-1]+1 if s[i]=t[j], else max(dp[i-1][j], dp[i][j-1])',
        cols: ['ε', 'B', 'C', 'A', 'B'],
        rows: ['ε', 'A', 'B', 'C', 'B'],
        cells: [
          [0, 0, 0, 0, 0],
          [0, 0, 0, 1, 1],
          [0, 1, 1, 1, 2],
          [0, 1, 2, 2, 2],
          [0, 1, 2, 2, 3],
        ],
        path: [
          [1, 3],
          [2, 4],
          [3, 2],
          [4, 4],
        ],
        steps: [
          {
            caption: 'Base case: row 0 and col 0 are all 0 — empty string has LCS 0 with anything.',
            current: [0, 0],
            deps: [],
          },
          {
            caption: 'dp[1][3]: A matches A → dp[0][2]+1 = 1. First character matched.',
            current: [1, 3],
            deps: [[0, 2]],
          },
          {
            caption: 'dp[2][4]: B matches B → dp[1][3]+1 = 2. Two-character match.',
            current: [2, 4],
            deps: [[1, 3]],
          },
          { caption: 'dp[3][2]: C matches C → dp[2][1]+1 = 2.', current: [3, 2], deps: [[2, 1]] },
          {
            caption:
              'dp[4][4]: B matches B → dp[3][3]+1 = 3. Final answer: LCS = "BCB" (length 3).',
            current: [4, 4],
            deps: [[3, 3]],
          },
        ],
        footer:
          'LCS is <b>"BCB"</b> (length 3). Backtrack from dp[4][4]=3 via diagonal match cells. Classic FAANG problem: edit distance, diff tools, DNA sequencing.',
      },
    },
    {
      type: 'hashtable',
      col: 10,
      id: 'compsci-hashtable',
      delay: 540,
      props: {
        title: 'Hash table — separate chaining, h(k) = k mod 7',
        size: 7,
        hashFn: 'h(k) = k mod 7',
        entries: [
          { key: 14, value: 'Alice' },
          { key: 21, value: 'Bob' },
          { key: 7, value: 'Carol' },
          { key: 3, value: 'Dan' },
          { key: 10, value: 'Eve' },
          { key: 1, value: 'Frank' },
        ],
        highlight: 10,
        footer:
          'Keys 7, 14 and 21 hash to bucket 0 (all divisible by 7). Key 10 hashes to bucket 3, colliding with key 3 — the chain is walked to find Eve. Load factor = 6/7 ≈ 86%.',
      },
    },
    {
      type: 'trie',
      col: 10,
      id: 'compsci-trie',
      delay: 600,
      props: {
        title: 'Prefix tree (Trie) — autocomplete words',
        words: ['apple', 'app', 'apt', 'apply', 'bat', 'ball', 'ban'],
        highlight: 'apply',
        footer:
          'Trie lookup: O(m) where m = word length, regardless of dictionary size. Each edge is one character; double-ringed nodes mark end-of-word. Use for autocomplete, spell-check, prefix search.',
      },
    },
    {
      type: 'gridtrace',
      col: 10,
      id: 'compsci-gridtrace',
      delay: 660,
      props: {
        title: 'BFS Shortest Path on a Grid',
        algorithm: 'BFS',
        steps: [
          {
            caption: 'Find shortest path S→E. Walls (#) block movement.',
            grid: [
              [{ state: 'start' }, { state: 'empty' }, { state: 'wall' }, { state: 'empty' }],
              [{ state: 'empty' }, { state: 'empty' }, { state: 'empty' }, { state: 'empty' }],
              [{ state: 'empty' }, { state: 'empty' }, { state: 'empty' }, { state: 'end' }],
            ],
          },
          {
            caption: 'BFS expands: S visited, neighbors queued.',
            grid: [
              [{ state: 'visited' }, { state: 'queued' }, { state: 'wall' }, { state: 'empty' }],
              [{ state: 'queued' }, { state: 'empty' }, { state: 'empty' }, { state: 'empty' }],
              [{ state: 'empty' }, { state: 'empty' }, { state: 'empty' }, { state: 'end' }],
            ],
          },
          {
            caption: 'Wave reaches E. Shortest path length = 5.',
            grid: [
              [{ state: 'path' }, { state: 'visited' }, { state: 'wall' }, { state: 'visited' }],
              [{ state: 'path' }, { state: 'path' }, { state: 'path' }, { state: 'visited' }],
              [{ state: 'visited' }, { state: 'visited' }, { state: 'visited' }, { state: 'end' }],
            ],
          },
        ],
        footer:
          'BFS guarantees shortest path in unweighted grids. O(rows×cols). Classic FAANG: islands (LC 200), rotting oranges (994), word search (79).',
      },
    },
    {
      type: 'sysarchdiagram',
      col: 12,
      id: 'compsci-sysarchdiagram',
      delay: 700,
      props: {
        title: 'Whiteboard: a URL shortener at scale',
        icon: 'share',
        iconColor: 'var(--presence)',
        nodes: [
          { id: 'client', label: 'Client', kind: 'client' },
          { id: 'cdn', label: 'CDN', kind: 'cdn', sub: 'static assets' },
          { id: 'lb', label: 'Load Balancer', kind: 'loadbalancer' },
          { id: 'api', label: 'API Service', kind: 'service', sub: '×12 instances' },
          { id: 'cache', label: 'Redis Cache', kind: 'cache', sub: 'hot slugs' },
          { id: 'queue', label: 'Write Queue', kind: 'queue', sub: 'Kafka' },
          { id: 'db', label: 'Postgres', kind: 'database', sub: 'primary + replicas' },
          { id: 'gw', label: 'Auth Gateway', kind: 'gateway' },
        ],
        edges: [
          { from: 'client', to: 'cdn', protocol: 'HTTPS' },
          { from: 'client', to: 'gw', protocol: 'HTTPS' },
          { from: 'gw', to: 'lb' },
          { from: 'lb', to: 'api', protocol: 'HTTP/2' },
          { from: 'api', to: 'cache', label: 'read-through' },
          { from: 'api', to: 'queue', label: 'enqueue write' },
          { from: 'queue', to: 'db', label: 'batched insert' },
          { from: 'cache', to: 'db', label: 'cache-aside', protocol: 'TCP:5432' },
        ],
        footer:
          'Reads hit the cache first (sub-ms for hot slugs); writes go through the queue so Postgres never sees a request-rate spike directly. The gateway terminates auth before anything reaches the load balancer.',
      },
    },
    {
      type: 'recursiontree',
      col: 9,
      id: 'compsci-recursiontree',
      delay: 730,
      props: {
        title: 'Naive Recursive fib(4)',
        icon: 'spark',
        iconColor: 'var(--presence)',
        root: {
          call: 'fib(4)',
          result: 3,
          children: [
            {
              call: 'fib(3)',
              result: 2,
              children: [
                {
                  call: 'fib(2)',
                  result: 1,
                  children: [
                    { call: 'fib(1)', result: 1 },
                    { call: 'fib(0)', result: 0 },
                  ],
                },
                { call: 'fib(1)', result: 1 },
              ],
            },
            {
              call: 'fib(2)',
              result: 1,
              children: [
                { call: 'fib(1)', result: 1 },
                { call: 'fib(0)', result: 0 },
              ],
            },
          ],
        },
        footer:
          'fib(2) is recomputed twice here and the redundant subtree only grows with n — O(2ⁿ) calls total. A memo table (see the LCS dptable above) collapses each distinct call to O(1) after its first evaluation.',
      },
    },
    {
      type: 'sequencealign',
      col: 10,
      id: 'compsci-sequencealign',
      delay: 720,
      props: {
        title: 'The LCS problem, on real reads',
        icon: 'layers',
        iconColor: 'var(--presence)',
        kind: 'dna',
        sequences: [
          { label: 'Reference', chars: 'ATGGCTAACGTTAGC' },
          { label: 'Read 1', chars: 'ATGGCTAAAGTTAGC' },
          { label: 'Read 2', chars: 'ATGGCTA--GTTAGC' },
        ],
        consensus: 'Consensus',
        highlightMismatches: true,
        footer:
          "Read 1 carries a single-base substitution (C→A); Read 2 has a 2-base deletion right where Read 1 still matches the reference. The two reads disagree with each other there, so the consensus can't call a base at that column — everywhere else, all three agree.",
      },
    },
  ],
  proof: null,
  extras: {},

  group: 'learn',
  intents: {
    converged: {
      kind: 'spotlight',
      spotId: 'converged',
      say: 'It locked in around iteration 300, clean, monotonic decay to tolerance after that.',
    },
    result: {
      kind: 'spotlight',
      spotId: 'result',
      say: 'And the lift coefficient sits within 0.3% of the wind-tunnel number.',
    },
  },
  tryChip: { label: 'Read back my simulation run', route: 'topic:compsci' },
  suggests: [
    { label: 'Did it actually converge?', icon: 'chart', route: 'topic:compsci', lead: 'Try' },
    { label: 'Show the method paper', icon: 'doc', route: 'topic:compsci' },
    { label: 'Explain compound interest', icon: 'spark', route: 'topic:explain' },
    { label: 'Help me study', icon: 'clock', route: 'topic:study' },
  ],
  keywords: [
    {
      test: /\bsimulation\b|\bsolver\b|\bconvergence\b|\bconverged\b|\bresidual\b|\bcfd\b|finite.?(volume|element)|\beigenvalue|my run\b/,
      route: 'topic:compsci',
    },
  ],
};
