import { Functions } from 'firebase/functions';

export function requireFunctions(functions: Functions | null): Functions {
  if (!functions) {
    throw new Error('Firebase is not configured yet — see ROADMAP.md "Setup" to add your project config to .env.');
  }
  return functions;
}
