// Explicit cleanup instead of globals: true — keeps the namespace clean
// while ensuring @testing-library/react tears down after every test.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);
