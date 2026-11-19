import { thresholds, setupLogin, journey } from './common.js';
export const options = { stages: [{ duration: '2m', target: 20 }, { duration: '10s', target: 200 }, { duration: '1m', target: 200 }, { duration: '10s', target: 20 }, { duration: '2m', target: 20 }, { duration: '30s', target: 0 }], thresholds };
export const setup = setupLogin;
export default journey;
