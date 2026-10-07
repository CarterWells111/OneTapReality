import { fireEvent, render } from '@testing-library/react-native';
import { GlobalCityMap } from '../src/features/cities/global-city-map.ios';
const mockPaper = jest.fn();
const mockStreet = jest.fn();
jest.mock('../src/features/cities/global-paper-map', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { GlobalPaperMap: (props: unknown) => { mockPaper(props); return React.createElement(View, { testID: 'paper-map' }); } };
});
jest.mock('../src/features/cities/global-street-map.ios', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { StreetCityMap: (props: unknown) => { mockStreet(props); return React.createElement(View, { testID: 'street-map' }); } };
});
it('defaults to domestic paper artwork and carries the current region into street mode', async () => {
  const screen = await render(<GlobalCityMap stats={[]} variant="workspace" />);
  expect(screen.getByTestId('paper-map')).toBeTruthy();
  expect(screen.queryByTestId('street-map')).toBeNull();
  const region = { latitude: -33, longitude: 151, latitudeDelta: 1, longitudeDelta: 2 };
  mockPaper.mock.calls.at(-1)[0].onViewportChange(region);
  fireEvent.press(screen.getByLabelText('街道地图'));
  expect(screen.getByTestId('street-map')).toBeTruthy();
  expect(mockStreet.mock.calls.at(-1)[0].initialRegion).toEqual(region);
  fireEvent.press(screen.getByLabelText('旅行地图'));
  expect(screen.getByTestId('paper-map')).toBeTruthy();
  expect(mockPaper.mock.calls.at(-1)[0].initialRegion).toEqual(region);
});
it('keeps the city overview in the paper style without a street-mode selector', async () => {
  const screen = await render(<GlobalCityMap stats={[]} variant="overview" />);
  expect(screen.getByTestId('paper-map')).toBeTruthy();
  expect(screen.queryByLabelText('街道地图')).toBeNull();
});
