import { describe, expect, it, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useConnectionStore } from '../../src/state/connection.js';

describe('useConnectionStore', () => {
  beforeEach(() => {
    act(() => {
      useConnectionStore.setState({ status: 'connecting' });
    });
  });

  it('starts with connecting status', () => {
    expect(useConnectionStore.getState().status).toBe('connecting');
  });

  it('setStatus transitions to connected', () => {
    act(() => {
      useConnectionStore.getState().setStatus('connected');
    });
    expect(useConnectionStore.getState().status).toBe('connected');
  });

  it('setStatus transitions to disconnected', () => {
    act(() => {
      useConnectionStore.getState().setStatus('disconnected');
    });
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('setStatus transitions to linking-required', () => {
    act(() => {
      useConnectionStore.getState().setStatus('linking-required');
    });
    expect(useConnectionStore.getState().status).toBe('linking-required');
  });
});
