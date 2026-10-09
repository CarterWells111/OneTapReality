import { act, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { useCitySpotCheckins } from '../src/features/cities/use-city-spot-checkins';

const mockDb = {};
const mockList = jest.fn();
const mockSet = jest.fn();
let mockOwner = 'guest';
const mockRunWrite = jest.fn(async (fn) => fn(mockOwner, () => {}));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('../src/features/auth/local-library-provider', () => ({ useLocalLibrary: () => ({owner:mockOwner,isReady:true,runWrite:mockRunWrite}) }));
jest.mock('../src/storage/city-spot-checkin-repository', () => ({listCitySpotCheckins:(...args:unknown[])=>mockList(...args),setCitySpotCheckin:(...args:unknown[])=>mockSet(...args)}));
let result: ReturnType<typeof useCitySpotCheckins>;
function Capture({city}:{city:string}) { result=useCitySpotCheckins(city); return null; }
function deferred<T>() { let resolve!:(v:T)=>void; const promise=new Promise<T>(r=>{resolve=r}); return {promise,resolve}; }
beforeEach(() => { jest.clearAllMocks(); mockOwner='guest'; mockList.mockResolvedValue([]); mockSet.mockResolvedValue(undefined); });

it('restores records when React repeats effect setup in StrictMode', async () => {
  mockList.mockResolvedValue([{spotId:'beijing-01',markedAt:'2026-10-09'}]);
  render(<React.StrictMode><Capture city="beijing"/></React.StrictMode>);
  await waitFor(()=>expect(result.isReady).toBe(true));
  expect(result.visitedSpotIds).toEqual(['beijing-01']);
});

it('loads persisted records and updates only after a successful guarded save', async () => {
  mockList.mockResolvedValue([{spotId:'beijing-01',markedAt:'2026-10-09'}]);
  render(<Capture city="beijing"/>);
  await waitFor(()=>expect(result.isReady).toBe(true));
  expect(result.visitedSpotIds).toEqual(['beijing-01']);
  await act(async()=>{await result.setVisited('beijing-01',false)});
  expect(result.visitedSpotIds).toEqual([]);
  expect(mockRunWrite).toHaveBeenCalled();
  mockSet.mockRejectedValueOnce(new Error('disk full'));
  await act(async()=>{await result.setVisited('beijing-02',true)});
  expect(result.visitedSpotIds).toEqual([]);
  expect(result.error).toContain('保存失败');
});

it('ignores late reads after switching cities and owners', async () => {
  const old=deferred<{spotId:string;markedAt:string}[]>();
  mockList.mockReturnValueOnce(old.promise);
  const screen=render(<Capture city="beijing"/>);
  mockOwner='account:new@example.com';
  screen.rerender(<Capture city="shanghai"/>);
  await waitFor(()=>expect(result.isReady).toBe(true));
  await act(async()=>{old.resolve([{spotId:'beijing-01',markedAt:'old'}]);await old.promise});
  expect(result.visitedSpotIds).toEqual([]);
  expect(mockList).toHaveBeenLastCalledWith(mockDb,'account:new@example.com','shanghai');
});

it('ignores a late successful save after owner switch and serializes taps', async () => {
  const screen=render(<Capture city="beijing"/>);
  await waitFor(()=>expect(result.isReady).toBe(true));
  const pending=deferred<void>(); mockSet.mockReturnValueOnce(pending.promise);
  let save!:Promise<void>;
  act(()=>{save=result.setVisited('beijing-01',true); void result.setVisited('beijing-02',true)});
  mockOwner='account:new@example.com';
  screen.rerender(<Capture city="shanghai"/>);
  await waitFor(()=>expect(result.isReady).toBe(true));
  await act(async()=>{pending.resolve();await save});
  expect(result.visitedSpotIds).toEqual([]);
  expect(mockSet).toHaveBeenCalledTimes(1);
});

it('keeps an existing check-in when cancellation fails and retries failed reads', async () => {
  mockList.mockRejectedValueOnce(new Error('locked'));
  render(<Capture city="beijing"/>);
  await waitFor(()=>expect(result.error).toContain('读取失败'));
  expect(result.isReady).toBe(false);
  mockList.mockResolvedValueOnce([{spotId:'beijing-01',markedAt:'2026-10-09'}]);
  act(()=>result.retry());
  await waitFor(()=>expect(result.isReady).toBe(true));
  mockSet.mockRejectedValueOnce(new Error('locked'));
  await act(async()=>{await result.setVisited('beijing-01',false)});
  expect(result.visitedSpotIds).toEqual(['beijing-01']);
});
