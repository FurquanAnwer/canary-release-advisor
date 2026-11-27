import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';

const sdk = vi.hoisted(() => ({
  variant: 'control',
  trackEvent: vi.fn(),
  flushEvents: vi.fn(() => Promise.resolve()),
}));

vi.mock('@flagsmith/flagsmith/react', () => ({
  useExperiment: () => ({ value: sdk.variant }),
  useFlagsmith: () => sdk,
}));

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  sdk.variant = 'control';
  sdk.trackEvent.mockClear();
  sdk.flushEvents.mockClear();
});

test('control sees metrics and history without advisor guidance', () => {
  render(<App visitorId="ui-test-control" />);
  expect(screen.getByText('Request volume')).toBeTruthy();
  expect(screen.getByText('DEPLOYMENT HISTORY')).toBeTruthy();
  expect(screen.queryByLabelText('Rule-based advisor recommendation')).toBeNull();
});

test('advisor sees the same metrics plus prepared guidance', () => {
  sdk.variant = 'advisor';
  render(<App visitorId="ui-test-advisor" />);
  expect(screen.getByText('Request volume')).toBeTruthy();
  expect(screen.getByText('DEPLOYMENT HISTORY')).toBeTruthy();
  expect(screen.getByLabelText('Rule-based advisor recommendation')).toBeTruthy();
  expect(screen.getByText('Prepared guidance based on this scenario’s explicit rules. No live model is used.')).toBeTruthy();
});

test('correct first submission sends the exact event once; wrong submission does not', () => {
  render(<App visitorId="ui-test-decisions" />);
  fireEvent.click(screen.getByRole('button', { name: /Increase rollout/i }));
  fireEvent.click(screen.getByRole('button', { name: /Submit decision/i }));
  expect(sdk.trackEvent).toHaveBeenCalledTimes(1);
  expect(sdk.trackEvent).toHaveBeenCalledWith('correct_rollout_decision');
  expect(sdk.flushEvents).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Good call.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /Clear regression/i }));
  fireEvent.click(screen.getByRole('button', { name: /Hold and inspect/i }));
  fireEvent.click(screen.getByRole('button', { name: /Submit decision/i }));
  expect(sdk.trackEvent).toHaveBeenCalledTimes(1);
  expect(screen.getByText('The stronger call was different.')).toBeTruthy();
});
