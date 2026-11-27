import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';

const sdk = vi.hoisted(() => ({ variant: 'control', trackEvent: vi.fn(), flushEvents: vi.fn(() => Promise.resolve()) }));
vi.mock('@flagsmith/flagsmith/react', () => ({ useExperiment: () => ({ value: sdk.variant }), useFlagsmith: () => sdk }));

beforeEach(() => {
  cleanup(); window.localStorage.clear(); window.location.hash = '';
  vi.spyOn(Math, 'random').mockReturnValue(0);
  sdk.variant = 'control'; sdk.trackEvent.mockClear(); sdk.flushEvents.mockClear();
});

test('advisor explains evidence without displaying an action before submission', () => {
  sdk.variant = 'advisor';
  render(<App visitorId="advisor" />);
  expect(screen.getByLabelText('Rule-based advisor evidence')).toBeTruthy();
  expect(screen.getByText('Baseline remains stable')).toBeTruthy();
  expect(screen.queryByText('Increase to 25%')).toBeNull();
  expect(screen.getByText('Canary: 26,040 requests')).toBeTruthy();
  vi.restoreAllMocks();
});

test('only the assigned first scenario emits outcomes, and practice cannot be scored', () => {
  render(<App visitorId="trial" />);
  expect(screen.getByRole('button', { name: /Clear regression/i }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Increase rollout/i }));
  fireEvent.click(screen.getByRole('button', { name: /Submit decision/i }));
  expect(sdk.trackEvent).toHaveBeenCalledWith('rollout_decision_submitted', { metadata: expect.objectContaining({ scenario: 'healthy', choice: 'increase', correct: true }) });
  expect(sdk.trackEvent).toHaveBeenCalledWith('rollout_decision_submitted_healthy_increase');
  expect(sdk.trackEvent).toHaveBeenCalledWith('correct_rollout_decision');
  expect(sdk.trackEvent.mock.calls.filter(([event]) => event === 'correct_rollout_decision')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Clear regression/i }));
  fireEvent.click(screen.getByRole('button', { name: /Hold and inspect/i }));
  fireEvent.click(screen.getByRole('button', { name: /Submit decision/i }));
  expect(sdk.trackEvent).toHaveBeenCalledTimes(4);
  expect(screen.getByText('The stronger call was different.')).toBeTruthy();
  cleanup(); render(<App visitorId="trial" />);
  expect(sdk.trackEvent).toHaveBeenCalledTimes(4);
  vi.restoreAllMocks();
});

test('incorrect primary decision still records a submission without conversion', () => {
  render(<App visitorId="wrong" />);
  fireEvent.click(screen.getByRole('button', { name: /Hold and inspect/i }));
  fireEvent.click(screen.getByRole('button', { name: /Submit decision/i }));
  expect(sdk.trackEvent).toHaveBeenCalledWith('rollout_decision_submitted_healthy_hold');
  expect(sdk.trackEvent).not.toHaveBeenCalledWith('correct_rollout_decision');
  vi.restoreAllMocks();
});
