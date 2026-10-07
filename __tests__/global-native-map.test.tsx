import { act, fireEvent, render } from '@testing-library/react-native';
import { GlobalCityMap } from '../src/features/cities/global-city-map.ios';
import { createGeographicCity } from '../src/types/city';
import { getCityStats } from '../src/features/cities/city-stats';

const mockAnimate = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: React.forwardRef((props: unknown, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimate }));
    return React.createElement(View, props);
  }), Marker: View };
});

describe('iPhone global map adapter (MapKit mocked)', () => {
  beforeEach(() => mockAnimate.mockClear());
  const city = createGeographicCity({ name: 'Sydney trip', latitude: -33.8688, longitude: 151.2093 });
  const stats = getCityStats([{ city, status: 'saved' }]);
  it('waits for MapKit readiness and acknowledges search only after arriving', async () => {
    const reached = jest.fn();
    const screen = await render(<GlobalCityMap stats={[]} variant="workspace" targetCity={city} onTargetReached={reached} />);
    expect(mockAnimate).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('global-native-map'), 'mapReady');
    expect(mockAnimate).toHaveBeenCalledWith(expect.objectContaining({ latitude: -33.8688, longitude: 151.2093 }), 500);
    expect(reached).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('global-native-map'), 'regionChangeComplete', { latitude: -33.8688, longitude: 151.2093, latitudeDelta: 0.08, longitudeDelta: 0.08 });
    expect(reached).toHaveBeenCalledTimes(1);
  });
  it('fits late-loading saved albums only once, while preserving user movement', async () => {
    const screen = await render(<GlobalCityMap stats={[]} variant="workspace" />);
    fireEvent(screen.getByTestId('global-native-map'), 'mapReady');
    await screen.rerender(<GlobalCityMap stats={stats} variant="workspace" />);
    expect(mockAnimate).toHaveBeenCalledTimes(1);
    await screen.rerender(<GlobalCityMap stats={[...stats]} variant="workspace" />);
    expect(mockAnimate).toHaveBeenCalledTimes(1);
    const moved = await render(<GlobalCityMap stats={[]} variant="workspace" />);
    fireEvent(moved.getByTestId('global-native-map'), 'mapReady');
    fireEvent(moved.getByTestId('global-native-map'), 'touchStart');
    await moved.rerender(<GlobalCityMap stats={stats} variant="workspace" />);
    expect(mockAnimate).toHaveBeenCalledTimes(1);
  });
  it('fits saved places, avoids controlled-camera snapback, and leaves location access disabled', async () => {
    const screen = await render(<GlobalCityMap stats={stats} variant="workspace" />);
    const map = screen.getByTestId('global-native-map');
    expect(map.props.initialRegion).toMatchObject({ latitude: -33.8688, longitude: expect.closeTo(151.2093, 4) });
    expect(map.props.region).toBeUndefined();
    expect(map.props.provider).toBeUndefined();
    expect(map.props.showsUserLocation).toBe(false);
    expect(map.props.scrollEnabled).toBe(true);
    expect(map.props.zoomEnabled).toBe(true);
  });
  it('keeps custom markers clickable after camera moves in either hemisphere', async () => {
    const press = jest.fn();
    const screen = await render(<GlobalCityMap stats={stats} variant="workspace" interactive onCityPress={press} />);
    fireEvent.press(screen.getByTestId(`global-marker-${city}`));
    expect(press).toHaveBeenCalledWith(city);
    await act(async () => fireEvent(screen.getByTestId('global-native-map'), 'regionChangeComplete', { latitude: 51, longitude: 0, latitudeDelta: 10, longitudeDelta: 10 }));
    await act(async () => fireEvent(screen.getByTestId('global-native-map'), 'regionChangeComplete', { latitude: -33.8688, longitude: 151.2093, latitudeDelta: 0.08, longitudeDelta: 0.08 }));
    expect(screen.getByLabelText('Sydney trip，已保存 1 册旅行记忆')).toBeTruthy();
  });
  it('starts at a world viewport with no saved locations', async () => {
    const screen = await render(<GlobalCityMap stats={[]} variant="workspace" />);
    expect(screen.getByTestId('global-native-map').props.initialRegion).toMatchObject({ longitudeDelta: 360, latitudeDelta: 180 });
  });
});
