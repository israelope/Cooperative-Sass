import { thresholds, setupLogin, journey } from './common.js';
export const options = { stages: [{ duration: '2m', target: 50 }, { duration: '5m', target: 50 }, { duration: '1m', target: 0 }], thresholds };
export const setup = setupLogin;
export default journey;
