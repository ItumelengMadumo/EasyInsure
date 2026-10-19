import { resetDemoData } from './client';
import { setDemoRole } from './mode';

export function exitDemo() {
  setDemoRole(null); resetDemoData();
  window.location.assign(window.location.pathname);
}
