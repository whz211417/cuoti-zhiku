import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the local library shell', () => {
  render(<App />);
  expect(screen.getByRole('application', { name: '错题智库' })).toBeVisible();
});
