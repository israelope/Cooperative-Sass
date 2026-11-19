import { thresholds, setupLogin, journey } from './common.js';
export const options = { stages: [{ duration: '2m', target: 50 }, { duration: '2m', target: 100 }, { duration: '2m', target: 200 }, { duration: '2m', target: 300 }, { duration: '2m', target: 0 }], thresholds };
export const setup = setupLogin;
export default journey;
