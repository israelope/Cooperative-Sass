import { thresholds, setupLogin, journey } from './common.js';
export const options = { vus: 2, duration: '1m', thresholds };
export const setup = setupLogin;
export default journey;
