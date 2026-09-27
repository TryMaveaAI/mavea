import { render } from '@testing-library/react';
import { Plot } from '../src/canvas/blocks/charts2/Plot';

it('places the horizontal axis title below the tick labels, inside the view box', () => {
  const { container, getByText } = render(
    <Plot
      title="Growth"
      xLabel="Year"
      curves={[
        {
          label: 'Value',
          points: [
            { x: 0, y: 0 },
            { x: 30, y: 80 },
          ],
        },
      ]}
    />,
  );
  const titleY = Number(getByText('Year').getAttribute('y'));
  const tickYs = [...container.querySelectorAll('.c2-plot-tick')].map((tick) =>
    Number(tick.getAttribute('y')),
  );
  expect(titleY).toBeGreaterThan(Math.max(...tickYs) + 10);
  expect(titleY).toBeLessThan(220);
});
