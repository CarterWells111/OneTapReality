import { fireEvent, render } from '@testing-library/react-native';
import { GeographicPlaceForm } from '../src/features/cities/geographic-place-form';
import { resolveCityEntry } from '../src/types/city';

describe('Custom global place entry', () => {
  it('saves the name and signed coordinates without geocoding or permissions', async () => {
    const select = jest.fn();
    const screen = await render(<GeographicPlaceForm onSelect={select} />);
    fireEvent.changeText(screen.getByLabelText('地点名称'), '海边小镇');
    fireEvent.changeText(screen.getByLabelText('纬度'), '-33.5');
    fireEvent.changeText(screen.getByLabelText('经度'), '-70.5');
    fireEvent.press(screen.getByText('使用这个地点'));
    expect(resolveCityEntry(select.mock.calls[0][0])).toMatchObject({ name: '海边小镇', geographic: { latitude: -33.5, longitude: -70.5 } });
  });
  it.each(['', '91', 'NaN', '1,2'])('rejects invalid latitude "%s" without selecting', async latitude => {
    const select = jest.fn();
    const screen = await render(<GeographicPlaceForm onSelect={select} />);
    fireEvent.changeText(screen.getByLabelText('地点名称'), 'Place');
    fireEvent.changeText(screen.getByLabelText('纬度'), latitude);
    fireEvent.changeText(screen.getByLabelText('经度'), '0');
    fireEvent.press(screen.getByText('使用这个地点'));
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
