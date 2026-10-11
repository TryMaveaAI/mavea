import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioLab } from '../src/live/studio/StudioLab';
import { RETENTION, exampleForQuestion, retentionScenario } from '../src/live/studio/model';
import { isLegalGateBypassed, isNoSpendRoute } from '../src/legal/routePolicy';

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: () => {},
  configurable: true,
});

afterEach(() => {
  cleanup();
  document.documentElement.dataset.theme = 'light';
});

describe('Live design studio', () => {
  it('keeps skip navigation inside the app and exposes compact navigation', () => {
    render(<StudioLab />);
    fireEvent.click(screen.getByRole('link', { name: 'Skip to canvas' }));
    expect(screen.getByRole('main')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace navigation' }));
    expect(
      screen.getByRole('navigation', { name: 'Compact workspace navigation' }),
    ).toBeInTheDocument();
  });
  it('changes the chart, comparison and evidence with the same scenario', () => {
    render(<StudioLab />);
    fireEvent.change(screen.getByLabelText(/Retention improvement/), { target: { value: '10' } });
    expect(screen.getByRole('img', { name: /Example retention/ })).toHaveAccessibleName(
      /scenario of 52 percent/,
    );
    expect(screen.getByText('10 more people stay for every 100 who arrive.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.getByText('With your assumed improvement')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Behind this answer/ }));
    expect(screen.getByRole('table')).toHaveAccessibleName(
      'Illustrative cohort retention and your scenario',
    );
    expect(screen.getByText(/The lift is an assumption you control/)).toBeInTheDocument();
  });
  it('inspects individual weeks rather than reporting the end of the curve for every point', () => {
    render(<StudioLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Inspect week 0' }));
    expect(screen.getByRole('img', { name: /Example retention/ })).toHaveAccessibleName(
      /100 percent at week 0/,
    );
    expect(screen.getByText('The same experience leads to the same outcome.')).toBeInTheDocument();
  });
  it('opens sample plans, explores a step and restores earlier spaces', () => {
    render(<StudioLab />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Plan a product launch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Explore sample question' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Small, deliberate steps.');
    fireEvent.click(screen.getByRole('button', { name: /DAY 11–17/ }));
    expect(screen.getByRole('button', { name: /DAY 11–17/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Where growth really lives/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your next growth lever');
  });
  it('does not pretend unsupported questions or the microphone run a model', () => {
    render(<StudioLab />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tell me about the moon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Explore sample question' }));
    expect(screen.getByRole('status')).toHaveTextContent('two sample worlds');
    fireEvent.click(screen.getByRole('button', { name: 'About voice in this design preview' }));
    expect(screen.getByRole('status')).toHaveTextContent('does not access your microphone');
  });
  it('lets people start fresh and return, and keeps presentation reversible', () => {
    render(<StudioLab />);
    fireEvent.click(screen.getByRole('button', { name: /New space/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What’s on');
    fireEvent.click(screen.getByRole('button', { name: /Find the growth/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Present' }));
    expect(screen.getByRole('button', { name: 'Exit presentation' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exit presentation' }));
    expect(screen.getByRole('button', { name: 'Present' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
  it('keeps this authored preview local and behind the dev route boundary', () => {
    expect(isLegalGateBypassed('#/studiolab')).toBe(true);
    expect(isNoSpendRoute('#/studiolab')).toBe(true);
    expect(isLegalGateBypassed('#/live')).toBe(false);
  });
});

describe('illustrative retention model', () => {
  it('preserves the original cohort at zero lift and leaves week zero unchanged', () => {
    expect(retentionScenario(0)).toEqual(RETENTION);
    expect(retentionScenario(30)[0]).toBe(100);
    expect(retentionScenario(20)[8]).toBe(62);
  });
  it('bounds invalid assumptions and recognizes only supported example topics', () => {
    expect(retentionScenario(-10)).toEqual(RETENTION);
    expect(retentionScenario(NaN)).toEqual(RETENTION);
    expect(retentionScenario(100)[8]).toBe(72);
    expect(exampleForQuestion('improve onboarding')).toBe('growth');
    expect(exampleForQuestion('plan a launch')).toBe('launch');
    expect(exampleForQuestion('tell me anything')).toBeNull();
  });
});
