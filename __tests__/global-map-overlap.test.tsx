import { fireEvent, render } from '@testing-library/react-native';
import { StreetCityMap } from '../src/features/cities/global-street-map.ios';
import { createGeographicCity } from '../src/types/city';
import { getCityStats } from '../src/features/cities/city-stats';

it('lets the user choose individual albums when two places share the exact same coordinate', async () => {
  const a = createGeographicCity({ name: 'First place', latitude: 0, longitude: 0 });
  const b = createGeographicCity({ name: 'Second place', latitude: 0, longitude: 0 });
  const press = jest.fn();
  const screen = await render(<StreetCityMap stats={getCityStats([{ city: a }, { city: b }])} variant="workspace" interactive onCityPress={press} />);
  fireEvent.press(screen.getByTestId(`global-marker-${a}`));
  fireEvent.press(screen.getByLabelText('Second place，查看旅行记忆'));
  expect(press).toHaveBeenCalledWith(b);
});
