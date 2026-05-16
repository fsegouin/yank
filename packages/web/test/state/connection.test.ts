import { describe, expect, it, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useConnectionStore } from '../../src/state/connection.js';

describe('useConnectionStore', () => {
  beforeEach(() => {
    act(() => {
      useConnectionStore.setState({ status: 'connecting', everConnected: false });
    });
  });

  it('starts with connecting status and everConnected false', () => {
    expect(useConnectionStore.getState().status).toBe('connecting');
    expect(useConnectionStore.getState().everConnected).toBe(false);
  });

  it('setStatus transitions to connected and flips everConnected to true', () => {
    act(() => {
      useConnectionStore.getState().setStatus('connected');
    });
    expect(useConnectionStore.getState().status).toBe('connected');
    expect(useConnectionStore.getState().everConnected).toBe(true);
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

  it('everConnected stays true after a transient connecting transition', () => {
    act(() => { useConnectionStore.getState().setStatus('connected'); });
    act(() => { useConnectionStore.getState().setStatus('connecting'); });
    expect(useConnectionStore.getState().everConnected).toBe(true);
  });
});
