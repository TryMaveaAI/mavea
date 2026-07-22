// Code walkthrough block examples (split from authoredExamples.ts).
// Entries verbatim — do not edit content.
export const CODE_EXAMPLES: Record<string, Record<string, unknown>> = {
  syntaxbreakdown: {
    title: 'Python list comprehension explained',
    icon: 'code',
    iconColor: 'var(--presence)',
    lang: 'python',
    lines: [
      {
        code: 'squares = [x ** 2 for x in range(10)]',
        explanation: 'Builds a list of squares from 0 to 81 in one expression',
        tokens: [
          { code: 'squares', label: 'Output variable', kind: 'identifier' },
          { code: '[', label: 'Open list comprehension', kind: 'operator' },
          { code: 'x ** 2', label: 'Expression evaluated per item', kind: 'value' },
          {
            code: 'for x in range(10)',
            label: 'Iteration clause — x takes values 0–9',
            kind: 'keyword',
          },
          { code: ']', label: 'Close comprehension', kind: 'operator' },
        ],
      },
      {
        code: 'evens = [x for x in range(20) if x % 2 == 0]',
        explanation: 'Adds a filter clause to include only even numbers',
        tokens: [
          {
            code: 'if x % 2 == 0',
            label: 'Guard — only items passing this test are included',
            kind: 'keyword',
          },
        ],
      },
    ],
    summary: 'List comprehensions replace verbose for-loops with a single readable expression',
    footer: 'Equivalent to a for-loop + .append(), but more idiomatic',
  },
  codewalk: {
    title: 'Binary search — step by step',
    icon: 'code',
    iconColor: 'var(--presence)',
    algorithm: 'Binary Search',
    steps: [
      {
        step: 1,
        title: 'Pick the midpoint',
        code: 'mid = (low + high) // 2',
        lang: 'python',
        explanation:
          'Start with the full sorted array. Compute the index of the middle element using integer division.',
      },
      {
        step: 2,
        title: 'Compare and halve',
        code: 'if arr[mid] == target:\n    return mid\nelif arr[mid] < target:\n    low = mid + 1\nelse:\n    high = mid - 1',
        lang: 'python',
        explanation:
          'If the middle element matches, we are done. Otherwise discard the half that cannot contain the target — this halves the search space each iteration, giving O(log n) time.',
      },
    ],
    footer: 'Time complexity: O(log n) · Space: O(1) iterative',
  },
};
